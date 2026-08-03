import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCalendar, IconCheckCircle } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { nowBenin } from '@/lib/time'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Plan = Database['public']['Tables']['plans_activites_mensuels']['Row']

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

  const isAdmin = profile?.role === 'admin'

  async function load() {
    const [{ data: eq }, { data: pl }, se] = await Promise.all([
      supabase.from('equipes').select('*').order('nom'),
      supabase.from('plans_activites_mensuels').select('*').order('mois', { ascending: false }),
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
    setSaving(true)
    setNotice(null)
    const existant = plans.find((p) => p.equipe_id === equipeId && p.mois === mois)
    const payload = { equipe_id: equipeId, superviseur_id: profile.id, mois, contenu: { texte } }
    const { error } = existant
      ? await supabase.from('plans_activites_mensuels').update(payload).eq('id', existant.id)
      : await supabase.from('plans_activites_mensuels').insert(payload)
    setSaving(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      setNotice({ type: 'success', text: 'Plan enregistré.' })
      load()
    }
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
        <Card>
          <form onSubmit={soumettre} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Équipe</label>
                <select
                  value={equipeId} onChange={(e) => setEquipeId(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                >
                  {equipesVisibles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Mois concerné</label>
                <select
                  value={mois} onChange={(e) => setMois(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                >
                  {moisOptions().map((m) => <option key={m} value={m}>{dayjs(m).format('MMMM YYYY')}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Contenu du plan</label>
              <textarea
                value={texte} onChange={(e) => setTexte(e.target.value)} rows={6} required
                placeholder="Objectifs, actions prévues, formations, challenges, points d'attention pour le mois…"
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
            {notice && (
              <p className={`text-xs rounded-xl px-3 py-2.5 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {notice.text}
              </p>
            )}
            <Button type="submit" loading={saving}>Enregistrer le plan</Button>
          </form>
        </Card>
      )}

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">Statut par équipe</p>
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
                  <Badge tone="success"><IconCheckCircle className="h-3 w-3 mr-1 inline" />À jour</Badge>
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
                  <th className="px-4 py-3 text-left font-semibold">Mois</th>
                  <th className="px-4 py-3 text-left font-semibold">Soumis le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {plans.filter((p) => isAdmin || supervisedIds.includes(p.equipe_id)).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-semibold text-ink-800">{equipeNomById[p.equipe_id]}</td>
                    <td className="px-4 py-3 text-ink-500">{dayjs(p.mois).format('MMMM YYYY')}</td>
                    <td className="px-4 py-3 text-ink-500">{dayjs(p.soumis_at).format('DD/MM/YYYY HH:mm')}</td>
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
