import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCalendar, IconPlus } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { nowBenin } from '@/lib/time'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Plan = Database['public']['Tables']['plans_activites_mensuels']['Row'] & { statut?: 'BROUILLON' | 'SOUMIS' | 'VALIDE' | 'REFUSE'; motif_rejet?: string | null; valide_at?: string | null; valide_par?: string | null; profiles?: { full_name: string } | null }

function moisOptions() {
  // Mois courant + 3 suivants (le plan porte "sur le mois suivant", soumis avant le 25 du mois précédent)
  return Array.from({ length: 4 }, (_, i) => nowBenin().startOf('month').add(i, 'month').format('YYYY-MM-DD'))
}

export default function ManagementPlanActivites() {
  const { profile } = useAuth()
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [supervisedIds, setSupervisedIds] = useState<string[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [mois, setMois] = useState(moisOptions()[1])
  const [equipeId, setEquipeId] = useState('')
  const [texte, setTexte] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const [motifs, setMotifs] = useState<Record<string, string>>({})
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const deadline = new Date(dayjs(mois).subtract(1, 'month').date(25).hour(23).minute(59).second(59).millisecond(0).format('YYYY-MM-DDTHH:mm:ss') + '+01:00')
  const remaining = Math.max(0, deadline.getTime() - clock)
  const countdown = remaining > 0 ? `${Math.floor(remaining / 86400000)} j ${Math.floor(remaining % 86400000 / 3600000)} h ${Math.floor(remaining % 3600000 / 60000)} min ${Math.floor(remaining % 60000 / 1000)} s` : 'Délai dépassé'
  const late = clock > deadline.getTime()

  const isAdmin = profile?.role === 'admin'

  async function load() {
    const [{ data: eq }, { data: pl }, se] = await Promise.all([
      supabase.from('equipes').select('*').order('nom'),
      (supabase.from('plans_activites_mensuels' as any).select('*, profiles:profiles!plans_activites_mensuels_superviseur_id_fkey(full_name)').order('mois', { ascending: false }) as any),
      profile?.role === 'superviseur'
        ? supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
        : Promise.resolve({ data: [] as { equipe_id: string }[] })
    ])
    setEquipes(eq ?? [])
    setPlans(pl ?? [])
    setSupervisedIds((se.data ?? []).map((s) => s.equipe_id))
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id])

  const equipesVisibles = useMemo(
    () => isAdmin ? equipes : equipes.filter((e) => supervisedIds.includes(e.id)),
    [equipes, isAdmin, supervisedIds]
  )

  useEffect(() => {
    if (!equipeId && equipesVisibles.length > 0) setEquipeId(equipesVisibles[0].id)
  }, [equipesVisibles, equipeId])

  useEffect(() => {
    const existant = plans.find((p) => p.equipe_id === equipeId && p.mois === mois)
    const contenu = existant?.contenu as { texte?: string } | null
    setTexte(contenu?.texte ?? '')
  }, [equipeId, mois, plans])

  async function soumettre(e: React.FormEvent) {
    e.preventDefault()
    if (!equipeId || !profile) return
    if (!texte.trim()) { setNotice({type:'error',text:'Le plan doit être renseigné avant soumission.'}); return }
    if (late && profile.role !== 'admin') { setNotice({type:'error',text:'Le délai de soumission est dépassé. Contactez un administrateur.'}); return }
    setSaving(true)
    setNotice(null)
    const existant = plans.find((p) => p.equipe_id === equipeId && p.mois === mois)
    const payload: any = {
      id: existant?.id, equipe_id: equipeId, superviseur_id: profile.id, mois, contenu: { texte }, statut: 'SOUMIS', motif_rejet: null
    }
    // upsert plutôt que select-puis-insert/update : deux superviseurs (ou deux onglets) soumettant
    // en même temps pour la même équipe/mois ne se heurtent alors plus à la contrainte unique.
    const { error } = await (supabase.from('plans_activites_mensuels' as any).upsert(payload, { onConflict: 'equipe_id,mois' }) as any)
    setSaving(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      setNotice({ type: 'success', text: 'Plan soumis à l’administrateur pour validation.' })
      setFormOpen(false)
      load()
    }
  }

  async function decision(plan: Plan, statut: 'VALIDE' | 'REFUSE') {
    const motif = (motifs[plan.id] ?? '').trim()
    if (statut === 'REFUSE' && !motif) { setNotice({ type: 'error', text: 'Le motif du retour pour correction est obligatoire.' }); return }
    setSaving(true); setNotice(null)
    const { error } = await (supabase.from('plans_activites_mensuels' as any).update({
      statut, motif_rejet: statut === 'REFUSE' ? motif : null,
      valide_at: new Date().toISOString(), valide_par: profile?.id
    }).eq('id', plan.id) as any)
    setSaving(false)
    if (error) { setNotice({ type: 'error', text: error.message }); return }
    setNotice({ type: 'success', text: statut === 'VALIDE' ? 'Plan d’activité validé.' : 'Plan renvoyé au superviseur pour correction.' })
    await load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const equipeNomById = Object.fromEntries(equipes.map((e) => [e.id, e.nom]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Plan d'activités mensuel</h1>
        <p className="text-sm text-ink-400">
          À soumettre par équipe au plus tard le 25 du mois en cours pour le mois suivant — sans plan soumis,
          l'équipe ne peut programmer aucune activité pour le mois concerné.
        </p>
      </div>

      {equipesVisibles.length === 0 ? (
        <Card className="text-sm text-ink-400 text-center py-8">
          Aucune équipe ne vous est rattachée pour le moment. Contactez un administrateur.
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-ink-800">Plans d'action mensuels</p>
              <p className="mt-1 text-xs text-ink-400">{isAdmin ? 'Contrôlez les plans soumis et rendez votre décision.' : 'Soumettez le plan mensuel de votre équipe. Il sera appliqué uniquement après validation administrative.'}</p>
            </div>
            {!isAdmin && <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>
              Nouveau plan
            </Button>}
          </Card>
          {notice && (
            <p className={`text-xs rounded-xl px-3 py-2.5 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {notice.text}
            </p>
          )}
        </div>
      )}

      {!isAdmin && <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Plan d'action mensuel"
        description="Renseignez le plan de l'équipe sélectionnée pour le mois concerné."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={soumettre} className="space-y-4">
          <div className={`rounded-xl p-3 ${late ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}><p className="text-xs font-semibold">Échéance : le 25 du mois précédent à 23h59 (Bénin)</p><p className="mt-1 text-sm font-bold">{countdown}</p>{late && profile?.role !== 'admin' && <p className="text-xs mt-1">Soumission verrouillée. Demandez une dérogation à l’administrateur.</p>}</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Équipe</label>
              <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                {equipesVisibles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Mois concerné</label>
              <select value={mois} onChange={(e) => setMois(e.target.value)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                {moisOptions().map((m) => <option key={m} value={m}>{dayjs(m).format('MMMM YYYY')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-500">Contenu du plan</label>
            <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={7} required
              placeholder="Objectifs, actions prévues, formations, challenges, points d'attention pour le mois…"
              className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Annuler</Button>
            <Button type="submit" loading={saving} disabled={!texte.trim() || (late && profile?.role !== 'admin')}>Soumettre le plan</Button>
          </div>
        </form>
      </Modal>}

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">{isAdmin ? 'État des plans par équipe' : 'État de vos plans par équipe'}</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {equipesVisibles.map((eq) => {
            const soumisPourMois = plans.filter((p) => p.equipe_id === eq.id)
            const dernier = soumisPourMois[0]
            return (
              <Card key={eq.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink-800">{eq.nom}</p>
                  <p className="text-[11px] text-ink-400">
                    {dernier ? `Dernier plan : ${dayjs(dernier.mois).format('MMMM YYYY')}` : 'Aucun plan soumis'}
                  </p>
                </div>
                {dernier ? (
                  <Badge tone={dernier.statut === 'VALIDE' ? 'success' : dernier.statut === 'SOUMIS' ? 'info' : dernier.statut === 'REFUSE' ? 'danger' : 'warning'}>{dernier.statut === 'VALIDE' ? 'Validé' : dernier.statut === 'SOUMIS' ? 'En attente' : dernier.statut === 'REFUSE' ? 'À corriger' : 'Brouillon'}</Badge>
                ) : (
                  <Badge tone="warning"><IconCalendar className="h-3 w-3 mr-1 inline" />Manquant</Badge>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      {plans.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                  <th className="px-4 py-3 text-left font-semibold">Équipe</th>
                  <th className="px-4 py-3 text-left font-semibold">Soumis par</th>
                  <th className="px-4 py-3 text-left font-semibold">Mois</th>
                  <th className="px-4 py-3 text-left font-semibold">Soumis le</th>
                  <th className="px-4 py-3 text-left font-semibold">Statut</th>
                  <th className="px-4 py-3 text-left font-semibold">Contenu / décision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {plans.filter((p) => isAdmin || supervisedIds.includes(p.equipe_id)).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-semibold text-ink-800">{equipeNomById[p.equipe_id]}</td>
                    <td className="px-4 py-3 text-ink-600">{p.profiles?.full_name ?? 'Superviseur'}</td>
                    <td className="px-4 py-3 text-ink-500">{dayjs(p.mois).format('MMMM YYYY')}</td>
                    <td className="px-4 py-3 text-ink-500">{dayjs(p.soumis_at).format('DD/MM/YYYY HH:mm')}</td>
                    <td className="px-4 py-3">{p.statut === 'VALIDE' ? <Badge tone="success">Validé</Badge> : p.statut === 'SOUMIS' ? <Badge tone="info">À valider</Badge> : p.statut === 'REFUSE' ? <Badge tone="danger">À corriger</Badge> : <Badge tone="warning">Brouillon</Badge>}</td>
                    <td className="px-4 py-3 min-w-[280px]">
                      <p className="max-w-md whitespace-pre-wrap text-xs text-ink-600">{(p.contenu as { texte?: string } | null)?.texte ?? '—'}</p>
                      {p.statut === 'REFUSE' && p.motif_rejet && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">Motif : {p.motif_rejet}</p>}
                      {isAdmin && p.statut === 'SOUMIS' && <div className="mt-2 space-y-2">
                        <textarea value={motifs[p.id] ?? ''} onChange={e => setMotifs(v => ({ ...v, [p.id]: e.target.value }))} rows={2} placeholder="Motif obligatoire si vous demandez une correction…" className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs" />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => void decision(p, 'VALIDE')} loading={saving}>Valider le plan</Button>
                          <Button size="sm" variant="danger" onClick={() => void decision(p, 'REFUSE')} loading={saving} disabled={!(motifs[p.id] ?? '').trim()}>Demander une correction</Button>
                        </div>
                      </div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
