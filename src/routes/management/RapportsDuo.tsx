import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Profile = Database['public']['Tables']['profiles']['Row']
type RapportDuo = Database['public']['Tables']['rapports_duo']['Row'] & { profiles: { full_name: string; equipe_id: string | null } | null }
type EquipeOption = { id: string; nom: string }
type Session = { id: string; vm_id: string; jour: string; statut: string; profiles: { full_name: string } | null }
type CriterionKey = 'preparation_visite' | 'utilisation_argumentaire' | 'gestion_objections' | 'obtention_engagement' | 'posture_professionnelle' | 'presence_terrain'
type Form = Record<CriterionKey, number> & { vm_id: string; duo_session_id: string; commentaire: string }

const CRITERES: { key: CriterionKey; label: string; help: string }[] = [
  { key: 'preparation_visite', label: 'Préparation de la visite', help: "Le VM connaît son secteur, sa cible, ses historiques de visites précédentes et l'objectif du jour." },
  { key: 'utilisation_argumentaire', label: "Utilisation de l'argumentaire", help: "Le VM déploie l'argumentaire validé sur le produit phare en s'adaptant aux réalités de la visite." },
  { key: 'gestion_objections', label: 'Gestion des objections', help: "Le VM répond aux objections du prescripteur avec méthode, sans improvisation risquée." },
  { key: 'obtention_engagement', label: "Obtention d'un engagement", help: 'Le VM conclut la visite par une promesse ou un engagement clair et vérifiable.' },
  { key: 'posture_professionnelle', label: 'Posture professionnelle', help: 'Ton, écoute et respect du temps du prescripteur.' },
  { key: 'presence_terrain', label: 'Présence terrain', help: 'Reconnaissance du VM sur le terrain et connaissance des produits par les PDS.' }
]

const EMPTY_FORM: Form = { vm_id: '', duo_session_id: '', preparation_visite: 3, utilisation_argumentaire: 3, gestion_objections: 3, obtention_engagement: 3, posture_professionnelle: 3, presence_terrain: 3, commentaire: '' }

export default function ManagementRapportsDuo() {
  const { profile } = useAuth()
  const [vms, setVms] = useState<Profile[]>([])
  const [equipes, setEquipes] = useState<EquipeOption[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [equipeFilter, setEquipeFilter] = useState('')
  const [rapports, setRapports] = useState<RapportDuo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  async function load() {
    // The generated Supabase typings do not yet contain the VAD session table.
    // Keep this query runtime-safe without weakening the rest of the page's typing.
    const db = supabase as any
    const sessionsQuery = profile?.role === 'superviseur'
      ? db.from('vad_duo_sessions').select('id, vm_id, jour, statut, profiles!vad_duo_sessions_vm_id_fkey(full_name)').eq('superviseur_id', profile.id).eq('statut', 'TERMINE').order('jour', { ascending: false }).limit(50)
      : db.from('vad_duo_sessions').select('id, vm_id, jour, statut, profiles!vad_duo_sessions_vm_id_fkey(full_name)').eq('statut', 'TERMINE').order('jour', { ascending: false }).limit(50)
    const [{ data: pr }, { data: rd }, { data: eq }, { data: ss }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'vm').order('full_name'),
      supabase.from('rapports_duo').select('*, profiles!rapports_duo_vm_id_fkey(full_name, equipe_id)').order('jour', { ascending: false }).limit(50),
      supabase.from('equipes').select('id, nom').order('nom'),
      sessionsQuery
    ])
    setVms(pr ?? [])
    setRapports((rd as unknown as RapportDuo[]) ?? [])
    setEquipes(eq ?? [])
    setSessions((ss as unknown as Session[]) ?? [])
    if (!form.vm_id && pr?.length) setForm(f => ({ ...f, vm_id: pr[0].id }))
    setLoading(false)
  }

  useEffect(() => { void load() }, [profile?.id, profile?.role])

  const vmsFiltres = equipeFilter ? vms.filter(v => v.equipe_id === equipeFilter) : vms
  const rapportsFiltres = equipeFilter ? rapports.filter(r => r.profiles?.equipe_id === equipeFilter) : rapports
  const sessionsFiltrees = form.vm_id ? sessions.filter(s => s.vm_id === form.vm_id) : sessions

  function openForm() {
    const vmId = vmsFiltres[0]?.id ?? ''
    const firstSession = sessions.find(s => s.vm_id === vmId)
    setForm({ ...EMPTY_FORM, vm_id: vmId, duo_session_id: firstSession?.id ?? '' })
    setNotice(null)
    setFormOpen(true)
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !form.vm_id || !form.duo_session_id) return
    setSaving(true)
    setNotice(null)
    const average = Math.round(CRITERES.reduce((sum, c) => sum + form[c.key], 0) / CRITERES.length)
    const payload = {
      superviseur_id: profile.id,
      vm_id: form.vm_id,
      duo_session_id: form.duo_session_id,
      connaissance_produits: average,
      maitrise_portefeuille: average,
      relationnel: average,
      preparation_visite: form.preparation_visite,
      utilisation_argumentaire: form.utilisation_argumentaire,
      gestion_objections: form.gestion_objections,
      obtention_engagement: form.obtention_engagement,
      posture_professionnelle: form.posture_professionnelle,
      presence_terrain: form.presence_terrain,
      commentaire: form.commentaire || null
    }
    const { error } = await supabase.from('rapports_duo').insert(payload as never)
    setSaving(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      setFormOpen(false)
      setForm(EMPTY_FORM)
      await load()
    }
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-64" /><Skeleton className="h-40" /></div>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold text-ink-800 font-display">Évaluation des VAD</h1><p className="text-sm text-ink-400">Évaluation du visiteur médical selon la grille officielle VAD</p></div>
      {equipes.length > 0 && <select value={equipeFilter} onChange={e => { setEquipeFilter(e.target.value); setForm(f => ({ ...f, vm_id: (e.target.value ? vms.filter(v => v.equipe_id === e.target.value) : vms)[0]?.id ?? '', duo_session_id: '' })) }} className="rounded-xl border border-ink-200 px-3.5 py-2 text-sm"><option value="">Toutes les équipes</option>{equipes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}</select>}
    </div>

    <Card className="border-royal-100 bg-royal-50/50"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink-800">Grille d'évaluation VAD</p><p className="text-xs text-ink-500">6 critères · notation de 1 à 5 · à renseigner après le VAD</p></div><Button size="sm" onClick={openForm} disabled={!sessions.length}>Évaluer un VAD</Button></div>{!sessions.length && <p className="mt-3 text-xs text-ink-400">Aucun VAD terminé n'est disponible pour le moment.</p>}</Card>

    <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Évaluation du VAD" description="Renseignez les six critères observés pendant le VAD." maxWidth="max-w-2xl">
      <form onSubmit={soumettre} className="space-y-4">
        <div><label className="mb-1.5 block text-xs font-semibold text-ink-500">Visiteur médical</label><select value={form.vm_id} onChange={e => { const vm = e.target.value; setForm(f => ({ ...f, vm_id: vm, duo_session_id: sessions.find(s => s.vm_id === vm)?.id ?? '' })) }} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm">{vmsFiltres.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}</select></div>
        <div><label className="mb-1.5 block text-xs font-semibold text-ink-500">VAD réalisé</label><select required value={form.duo_session_id} onChange={e => setForm(f => ({ ...f, duo_session_id: e.target.value }))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm"><option value="">Sélectionner le VAD…</option>{sessionsFiltrees.map(s => <option key={s.id} value={s.id}>{dayjs(s.jour).format('DD/MM/YYYY')} · {s.profiles?.full_name ?? 'VM'}</option>)}</select></div>
        {CRITERES.map(c => <div key={c.key} className="rounded-xl border border-ink-100 p-3"><div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-ink-700">{c.label}</label><span className="text-sm font-bold text-royal-600">{form[c.key]}/5</span></div><p className="mt-1 text-[11px] leading-4 text-ink-400">{c.help}</p><input type="range" min={1} max={5} step={1} value={form[c.key]} onChange={e => setForm(f => ({ ...f, [c.key]: Number(e.target.value) }))} className="mt-2 w-full accent-royal-600" /></div>)}
        <div><label className="mb-1.5 block text-xs font-semibold text-ink-500">Commentaires / retour du superviseur</label><textarea value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} rows={4} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" placeholder="Points observés, recommandations, engagements de progression…" /></div>
        {notice && <p className={`rounded-xl px-3 py-2.5 text-xs ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{notice.text}</p>}
        <Button type="submit" loading={saving} disabled={!form.duo_session_id}>Enregistrer l'évaluation</Button>
      </form>
    </Modal>

    <div><p className="mb-3 text-sm font-bold text-ink-600">Dernières évaluations</p>{rapportsFiltres.length === 0 ? <Card className="py-6 text-center text-sm text-ink-400">Aucune évaluation VAD pour l'instant.</Card> : <div className="space-y-2">{rapportsFiltres.map(r => { const avg = Math.round(CRITERES.reduce((sum, c) => sum + Number((r as any)[c.key] ?? 0), 0) / CRITERES.length); return <Card key={r.id} className="flex items-center gap-3"><Avatar name={r.profiles?.full_name ?? ''} size={32} /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink-800">{r.profiles?.full_name}</p><p className="text-[10px] text-ink-400">{dayjs(r.jour).format('DD/MM/YYYY')} · Score {avg}/5 · 6 critères</p>{r.commentaire && <p className="mt-1 text-[11px] text-ink-500">{r.commentaire}</p>}</div></Card> })}</div>}</div>
  </div>
}
