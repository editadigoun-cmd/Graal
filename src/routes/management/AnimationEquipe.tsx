import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconStethoscope } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Equipe = Database['public']['Tables']['equipes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type TypeAnimation = Database['public']['Enums']['type_animation']
type Activite = Database['public']['Tables']['activites_animation']['Row'] & {
  profiles: { full_name: string } | null
}

const TYPE_LABEL: Record<TypeAnimation, string> = {
  POINT_QUOTIDIEN: 'Point quotidien',
  REUNION_LUNDI: 'Réunion du lundi',
  REUNION_MERCREDI: 'Réunion du mercredi',
  CHALLENGE: 'Challenge',
  FORMATION_CONTINUE: 'Formation continue',
  COACHING_TERRAIN: 'Coaching terrain',
  ARGUMENTAIRE_VM: 'Maîtrise des argumentaires'
}

export default function ManagementAnimationEquipe() {
  const { profile } = useAuth()
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [supervisedIds, setSupervisedIds] = useState<string[]>([])
  const [vms, setVms] = useState<Profile[]>([])
  const [activites, setActivites] = useState<Activite[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<TypeAnimation>('POINT_QUOTIDIEN')
  const [equipeId, setEquipeId] = useState('')
  const [vmId, setVmId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const isAdmin = profile?.role === 'admin'

  async function load() {
    const [{ data: eq }, { data: vm }, { data: act }, se] = await Promise.all([
      supabase.from('equipes').select('*').order('nom'),
      supabase.from('profiles').select('*').eq('role', 'vm').order('full_name'),
      supabase.from('activites_animation').select('*, profiles!activites_animation_vm_id_fkey(full_name)')
        .order('jour', { ascending: false }).limit(30),
      profile?.role === 'superviseur'
        ? supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
        : Promise.resolve({ data: [] as { equipe_id: string }[] })
    ])
    setEquipes(eq ?? [])
    setVms(vm ?? [])
    setActivites((act as unknown as Activite[]) ?? [])
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

  const vmsEquipe = vms.filter((v) => v.equipe_id === equipeId)
  const besoinVm = type === 'COACHING_TERRAIN' || type === 'ARGUMENTAIRE_VM'

  async function enregistrer() {
    if (!profile || !equipeId) return
    if (besoinVm && !vmId) return
    setSaving(true)
    setErreur(null)
    const { error } = await supabase.from('activites_animation').insert({
      superviseur_id: profile.id, equipe_id: equipeId, vm_id: besoinVm ? vmId : null,
      type, notes: notes || null
    })
    setSaving(false)
    if (error) { setErreur(error.message); return }
    setNotes('')
    setVmId('')
    setFormOpen(false)
    load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-64" /><Skeleton className="h-40" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Animation d'équipe</h1>
        <p className="text-sm text-ink-400">Journal des actions d'animation (points, réunions, challenges, formation, coaching)</p>
      </div>

      {equipesVisibles.length === 0 ? (
        <Card className="text-sm text-ink-400 text-center py-8">Aucune équipe dans votre périmètre.</Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink-800">Actions d'animation</p><p className="text-xs text-ink-400">{activites.length} action(s) récente(s)</p></div><Button size="sm" onClick={()=>setFormOpen(true)}>Nouvelle action</Button></div>
          <Modal open={formOpen} onClose={()=>setFormOpen(false)} title="Nouvelle action d'animation" description="Enregistrez une action pour l'équipe sélectionnée." maxWidth="max-w-2xl"><Card className="border-0 shadow-none p-0">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Type d'action</label>
              <select value={type} onChange={(e) => setType(e.target.value as TypeAnimation)}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                {(Object.keys(TYPE_LABEL) as TypeAnimation[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Équipe</label>
              <select value={equipeId} onChange={(e) => { setEquipeId(e.target.value); setVmId('') }}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                {equipesVisibles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            {besoinVm && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">Visiteur médical concerné</label>
                <select value={vmId} onChange={(e) => setVmId(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                  <option value="">Sélectionner…</option>
                  {vmsEquipe.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Notes (optionnel)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" loading={saving} disabled={besoinVm && !vmId} onClick={enregistrer}>
              Enregistrer
            </Button>
            {erreur && <p className="text-xs font-semibold text-red-600">{erreur}</p>}
          </div>
</Card></Modal>
        </>
      )}
      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">Actions récentes</p>
        {activites.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-6">Aucune action enregistrée pour l'instant.</Card>
        ) : (
          <div className="space-y-2">
            {activites.map((a) => (
              <Card key={a.id} className="flex items-center gap-3">
                <div className="rounded-xl bg-royal-50 p-2 text-royal-600"><IconStethoscope className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink-800">{TYPE_LABEL[a.type]}{a.profiles?.full_name ? ` · ${a.profiles.full_name}` : ''}</p>
                  <p className="text-[10px] text-ink-400">{dayjs(a.jour).format('DD/MM/YYYY')}</p>
                  {a.notes && <p className="text-[11px] text-ink-500 mt-1">{a.notes}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
