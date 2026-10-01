import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCalendar, IconCheckCircle, IconClock } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { nowBenin } from '@/lib/time'
import dayjs from 'dayjs'

type Equipe = { id: string; nom: string }
type VadPlan = { id: string; equipe_id: string; superviseur_id: string; mois: string; contenu: { texte?: string } | null; soumis_at: string | null }

function moisOptions() {
  return Array.from({ length: 4 }, (_, i) => nowBenin().startOf('month').add(i, 'month').format('YYYY-MM-DD'))
}

function deadline(mois: string) {
  return dayjs.tz(mois, 'Africa/Porto-Novo').subtract(1, 'month').date(25).hour(21).minute(0).second(0)
}

export default function ManagementVadPlan() {
  const { profile } = useAuth()
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [supervisedIds, setSupervisedIds] = useState<string[]>([])
  const [plans, setPlans] = useState<VadPlan[]>([])
  const [mois, setMois] = useState(moisOptions()[1])
  const [equipeId, setEquipeId] = useState('')
  const [texte, setTexte] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isAdmin = profile?.role === 'admin'
  const db = supabase as any

  async function load() {
    const [{ data: eq }, { data: pl }, se] = await Promise.all([
      db.from('equipes').select('id, nom').order('nom'),
      db.from('vad_plans_mensuels').select('*').order('mois', { ascending: false }),
      profile?.role === 'superviseur'
        ? db.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
        : Promise.resolve({ data: [] })
    ])
    const supervised = (se.data ?? []).map((s: { equipe_id: string }) => s.equipe_id)
    const visible = isAdmin ? (eq ?? []) : (eq ?? []).filter((e: Equipe) => supervised.includes(e.id))
    setEquipes(eq ?? [])
    setPlans(pl ?? [])
    setSupervisedIds(supervised)
    if (!equipeId && visible.length) setEquipeId(visible[0].id)
  }

  useEffect(() => { load() }, [profile?.id])

  const equipesVisibles = useMemo(
    () => isAdmin ? equipes : equipes.filter((e) => supervisedIds.includes(e.id)),
    [equipes, isAdmin, supervisedIds]
  )

  useEffect(() => {
    if (!equipeId && equipesVisibles.length) setEquipeId(equipesVisibles[0].id)
  }, [equipesVisibles, equipeId])

  useEffect(() => {
    const p = plans.find((x) => x.equipe_id === equipeId && x.mois === mois)
    setTexte(p?.contenu?.texte ?? '')
  }, [equipeId, mois, plans])

  const dateLimite = deadline(mois)
  const ferme = !isAdmin && nowBenin().isAfter(dateLimite)

  async function soumettre(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || ferme) return
    const selectedEquipeId = equipeId || (isAdmin ? equipesVisibles[0]?.id : supervisedIds[0]) || ''
    if (!selectedEquipeId) {
      setNotice({ type: 'error', text: 'Aucune équipe n’est associée à ce superviseur. Impossible de soumettre le plan de duo.' })
      return
    }
    setSaving(true); setNotice(null)
    const existant = plans.find((p) => p.equipe_id === selectedEquipeId && p.mois === mois)
    const { error } = await db.from('vad_plans_mensuels').upsert({
      id: existant?.id,
      equipe_id: selectedEquipeId,
      superviseur_id: profile.id,
      mois,
      contenu: { texte },
      soumis_at: new Date().toISOString()
    }, { onConflict: 'equipe_id,mois' })
    setSaving(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else { setNotice({ type: 'success', text: 'Plan VAD soumis.' }); load() }
  }

  if (!profile || (profile.role !== 'admin' && profile.role !== 'superviseur')) {
    return <Card className="text-sm text-ink-400 text-center py-8">Accès réservé aux superviseurs et managers.</Card>
  }

  if (!equipes.length) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">VAD – Plan de Duo</h1>
        <p className="text-sm text-ink-400">Plan mensuel des visites à deux entre superviseur et délégués. Le mois à venir doit être soumis au plus tard le 25 à 21h00.</p>
      </div>

      <Card className={ferme ? 'border border-flame-200 bg-flame-50/60' : 'border border-royal-100 bg-royal-50/40'}>
        <div className="flex items-center gap-3">
          {ferme ? <IconClock className="h-5 w-5 text-flame-600" /> : <IconCalendar className="h-5 w-5 text-royal-600" />}
          <div>
            <p className="text-sm font-bold text-ink-800">{ferme ? 'Soumission fermée' : 'Échéance de soumission'}</p>
            <p className="text-xs text-ink-500">25/{dayjs(mois).subtract(1, 'month').format('MM/YYYY')} à 21h00 — heure du Bénin</p>
          </div>
        </div>
      </Card>

      <Card>
        <form onSubmit={soumettre} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Équipe</label>
              <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} disabled={ferme} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm">
                {equipesVisibles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Mois du plan VAD</label>
              <select value={mois} onChange={(e) => setMois(e.target.value)} disabled={ferme} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm">
                {moisOptions().map((m) => <option key={m} value={m}>{dayjs(m).format('MMMM YYYY')}</option>)}
              </select>
            </div>
          </div>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} disabled={ferme} required rows={7} placeholder="Délégués concernés, dates prévues, objectifs du duo, secteurs/clients à accompagner…" className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" />
          {notice && <p className={`text-xs rounded-xl px-3 py-2.5 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>}
          <Button type="submit" loading={saving} disabled={ferme}>Soumettre le plan VAD</Button>
        </form>
      </Card>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">Suivi des plans VAD</p>
        <div className="space-y-2">
          {equipesVisibles.map((e) => {
            const p = plans.find((x) => x.equipe_id === e.id && x.mois === mois)
            return <Card key={e.id} className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-ink-800">{e.nom}</p><p className="text-xs text-ink-400">{p?.soumis_at ? `Soumis le ${dayjs(p.soumis_at).format('DD/MM/YYYY HH:mm')}` : 'Plan VAD non soumis'}</p></div>
              <Badge tone={p?.soumis_at ? 'success' : 'warning'}><IconCheckCircle className="h-3 w-3 mr-1 inline" />{p?.soumis_at ? 'Soumis' : 'Manquant'}</Badge>
            </Card>
          })}
        </div>
      </div>
    </div>
  )
}
