import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'

type Vm = { id: string; full_name: string; equipe_id: string | null }
type Ligne = { programme_ligne_id: string; client_id: string; date_visite: string; client_nom?: string; potentiel?: string; type_visite?: string }
type Client = { id: string; nom: string; centre: string | null; specialite: string | null }
type Session = { id: string; superviseur_id: string; vm_id: string; jour: string; mode: string; statut: string; started_at: string | null; ended_at: string | null; medecins_vus_ids: string[]; observations: string | null; compte_rendu: string | null; preparation_commentaire: string | null; argumentaire_commentaire: string | null; objections_commentaire: string | null; engagement_commentaire: string | null; posture_commentaire: string | null; presence_terrain_commentaire: string | null; supervisor?: { full_name: string } | null }
type AdminQuota = { id: string; superviseur_id: string; vm_id: string; jours: number; statut: string; supervisor?: { full_name: string } | null }

const VAD_CRITERES = [
  { key: 'preparation_commentaire', label: '01 · Préparation', help: 'Secteur, cible, historique et objectif du jour.' },
  { key: 'argumentaire_commentaire', label: '02 · Argumentaire', help: 'Message validé, adapté à la réalité de la visite.' },
  { key: 'objections_commentaire', label: '03 · Objections', help: 'Réponses méthodiques, sans improvisation risquée.' },
  { key: 'engagement_commentaire', label: '04 · Engagement', help: 'Conclusion claire et vérifiable.' },
  { key: 'posture_commentaire', label: '05 · Posture', help: 'Écoute, ton et respect du temps du prescripteur.' },
  { key: 'presence_terrain_commentaire', label: '06 · Présence terrain', help: 'Reconnaissance du VM et connaissance des produits.' }
] as const

const SUD_VM_IDS = new Set(['62cdc900-5544-470a-94bf-ef30c9c8fb2f','f7c8b228-1978-4b68-bca8-8e745866b0b8','d53c31c1-5adb-4549-82ca-0fff2a6692dd','d73bdceb-4bb3-496c-9d74-d24f6907c3b0','34deced5-26da-44c4-9bd5-7950e13552a9','180dedac-597a-47c9-97d5-8b5d93109f25','db3b946a-165e-4a20-91e0-073c2e170a72','a0436f11-d425-4014-9733-5c7cc4271189'])

function getPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  })
}

export default function VadPlan() {
  const { profile } = useAuth()
  const [vms, setVms] = useState<Vm[]>([])
  const [vmId, setVmId] = useState('')
  const [jour, setJour] = useState(todayBenin().format('YYYY-MM-DD'))
  const [mode, setMode] = useState<'COTONOU' | 'HORS_COTONOU'>('COTONOU')
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selection, setSelection] = useState<string[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [observations, setObservations] = useState('')
  const [compteRendu, setCompteRendu] = useState('')
  const [evaluation, setEvaluation] = useState({ preparation_commentaire: '', argumentaire_commentaire: '', objections_commentaire: '', engagement_commentaire: '', posture_commentaire: '', presence_terrain_commentaire: '' })
  const [sessionsMois, setSessionsMois] = useState<Session[]>([])
  const [approvedQuota, setApprovedQuota] = useState<number | null>(null)
  const [adminQuotas, setAdminQuotas] = useState<AdminQuota[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    async function init() {
      if (!profile?.id) return
      const [{ data: vmRows }, { data: teamRows }] = await Promise.all([
        supabase.from('profiles').select('id,full_name,equipe_id').eq('role', 'vm').eq('actif', true).order('full_name'),
        supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
      ])
      const teamIds = (teamRows ?? []).map(x => x.equipe_id)
      const visible = (vmRows ?? []).filter(v => profile.role === 'admin' || (v.equipe_id && teamIds.includes(v.equipe_id) && (profile.id !== '847d0024-7def-45d1-a669-d7276502ca32' || SUD_VM_IDS.has(v.id)))) as Vm[]
      setVms(visible)
      if (visible.length) setVmId(current => current || visible[0].id)
      setLoading(false)
    }
    void init()
  }, [profile?.id, profile?.role])

  useEffect(() => {
    if (!vmId) return
    async function loadDay() {
      setNotice('')
      const debutMois = dayjs(jour).startOf('month').format('YYYY-MM-DD')
      const finMois = dayjs(jour).add(1, 'month').startOf('month').format('YYYY-MM-DD')
      if (profile?.role === 'admin') {
        const [{ data: monthly }, { data: quotas }] = await Promise.all([
          (supabase.from('vad_duo_journaliers' as any).select('*, supervisor:profiles!vad_duo_journaliers_superviseur_id_fkey(full_name)').eq('vm_id', vmId).gte('jour', debutMois).lt('jour', finMois).order('jour', { ascending: false }) as any),
          (supabase.from('vad_duo_quotas_mensuels' as any).select('id,superviseur_id,vm_id,jours,statut,supervisor:profiles!vad_duo_quotas_mensuels_superviseur_id_fkey(full_name)').eq('vm_id', vmId).eq('mois', debutMois).order('created_at') as any)
        ])
        setLignes([]); setClients([]); setSession(null); setSelection([])
        setObservations(''); setCompteRendu(''); setEvaluation({ preparation_commentaire: '', argumentaire_commentaire: '', objections_commentaire: '', engagement_commentaire: '', posture_commentaire: '', presence_terrain_commentaire: '' })
        setSessionsMois((monthly ?? []) as Session[])
        setAdminQuotas((quotas ?? []) as AdminQuota[])
        setApprovedQuota(null); setElapsed(0)
        return
      }
      const [{ data: program }, { data: current }, { data: monthly }, { data: quotaRow }] = await Promise.all([
        supabase.from('v_lignes_avec_statut').select('*').eq('vm_id', vmId).eq('date_visite', jour).order('type_visite'),
        (supabase.from('vad_duo_journaliers' as any).select('*').eq('superviseur_id', profile?.id).eq('vm_id', vmId).eq('jour', jour).maybeSingle() as any),
        (supabase.from('vad_duo_journaliers' as any).select('*').eq('superviseur_id', profile?.id).eq('vm_id', vmId).gte('jour', debutMois).lt('jour', finMois) as any),
        (supabase.from('vad_duo_quotas_mensuels' as any).select('jours').eq('superviseur_id', profile?.id).eq('vm_id', vmId).eq('mois', debutMois).eq('statut', 'VALIDE').maybeSingle() as any)
      ])
      const medicalLines = ((program ?? []) as unknown as Ligne[]).filter(l => l.type_visite === 'MEDICAL' && l.client_id)
      setLignes(medicalLines)
      const ids = [...new Set(medicalLines.map(l => l.client_id))]
      if (ids.length) {
        const { data } = await supabase.from('clients').select('id,nom,centre,specialite').in('id', ids)
        setClients((data ?? []) as Client[])
      } else setClients([])
      const found = current as Session | null
      setSession(found)
      setSelection(found?.medecins_vus_ids ?? [])
      setObservations(found?.observations ?? '')
      setCompteRendu(found?.compte_rendu ?? '')
      setEvaluation({ preparation_commentaire: found?.preparation_commentaire ?? '', argumentaire_commentaire: found?.argumentaire_commentaire ?? '', objections_commentaire: found?.objections_commentaire ?? '', engagement_commentaire: found?.engagement_commentaire ?? '', posture_commentaire: found?.posture_commentaire ?? '', presence_terrain_commentaire: found?.presence_terrain_commentaire ?? '' })
      setSessionsMois((monthly ?? []) as Session[])
      setAdminQuotas([])
      setApprovedQuota(quotaRow?.jours ?? null)
      if (found?.statut === 'EN_COURS' && found.started_at) {
        setElapsed(Math.max(0, Math.floor((Date.now() - new Date(found.started_at).getTime()) / 1000)))
      } else setElapsed(0)
    }
    void loadDay()
  }, [vmId, jour, profile?.id])

  useEffect(() => {
    if (session?.statut !== 'EN_COURS' || !session.started_at) return
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(session.started_at!).getTime()) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [session?.id, session?.statut, session?.started_at])

  const selectedVm = vms.find(v => v.id === vmId)
  const isAdmin = profile?.role === 'admin'
  const quota = approvedQuota
  const quotaCount = sessionsMois.filter(s => s.statut === 'PROGRAMME' || s.statut === 'TERMINE' || s.statut === 'EN_COURS').length
  const quotaLabel = 'Quota mensuel validé'
  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients])
  const formatDuration = (n: number) => [Math.floor(n / 3600), Math.floor(n % 3600 / 60), n % 60].map(x => String(x).padStart(2, '0')).join(':')

  async function start() {
    if (!profile?.id || !vmId) return
    setSaving(true); setNotice('')
    const pos = await getPosition()
    const payload = {
      superviseur_id: profile.id, vm_id: vmId, jour, mode, statut: 'EN_COURS',
      programme_ligne_ids: mode === 'COTONOU' ? lignes.map(l => l.programme_ligne_id) : [],
      medecins_vus_ids: [], started_at: new Date().toISOString(),
      start_latitude: pos?.latitude ?? null, start_longitude: pos?.longitude ?? null
    }
    const { data, error } = await (supabase.from('vad_duo_journaliers' as any).upsert(payload, { onConflict: 'superviseur_id,vm_id,jour' }).select('*').single() as any)
    setSaving(false)
    if (error) { setNotice(error.message); return }
    setSession(data as Session); setElapsed(0)
    setNotice(pos ? 'VAD démarré. Position GPS enregistrée.' : 'VAD démarré. Position GPS indisponible sur cet appareil.')
  }

  async function finish() {
    if (!session || !profile?.id) return
    if (!compteRendu.trim()) { setNotice('Ajoutez le compte rendu avant de clôturer le VAD.'); return }
    const critereManquant = VAD_CRITERES.find(c => !evaluation[c.key].trim())
    if (critereManquant) { setNotice(`Renseignez le commentaire du critère : ${critereManquant.label}.`); return }
    setSaving(true); setNotice('')
    const pos = await getPosition()
    const { data, error } = await (supabase.from('vad_duo_journaliers' as any).update({
      statut: 'TERMINE', ended_at: new Date().toISOString(),
      medecins_vus_ids: mode === 'COTONOU' ? selection : [],
      observations: observations || null, compte_rendu: compteRendu,
      ...evaluation,
      end_latitude: pos?.latitude ?? null, end_longitude: pos?.longitude ?? null
    }).eq('id', session.id).select('*').single() as any)
    setSaving(false)
    if (error) { setNotice(error.message); return }
    setSession(data as Session); setNotice('VAD clôturé et compte rendu enregistré.')
  }

  if (loading) return <div className="py-10 text-center text-sm text-ink-400">Chargement des VM…</div>

  if (isAdmin) return <div className="space-y-5 pb-8">
    <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Consultation administrative</p><h1 className="mt-1 text-xl font-extrabold text-ink-800 font-display">Suivi des VAD</h1><p className="mt-1 text-sm text-ink-400">Consultation des quotas validés et des VAD réalisés par les superviseurs. L’administrateur ne démarre ni ne clôture de VAD.</p></div>
    <Card className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-ink-500">Visiteur médical<select value={vmId} onChange={e => setVmId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-sm"><option value="">Sélectionner un VM…</option>{vms.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}</select></label>
      <label className="block text-xs font-semibold text-ink-500">Mois consulté<input type="month" value={dayjs(jour).format('YYYY-MM')} onChange={e => e.target.value && setJour(e.target.value + '-01')} className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-3 text-sm" /></label>
    </Card>
    {selectedVm && <Card className="space-y-3"><p className="text-sm font-bold text-ink-800">Quotas du mois · {selectedVm.full_name}</p>{adminQuotas.length===0?<p className="text-xs text-ink-400">Aucun quota mensuel enregistré pour ce VM.</p>:adminQuotas.map(q=>{const related=sessionsMois.filter(s=>s.superviseur_id===q.superviseur_id);const done=related.filter(s=>s.statut==='TERMINE').length;const active=related.filter(s=>s.statut==='EN_COURS').length;const planned=related.filter(s=>s.statut==='PROGRAMME').length;return <div key={q.id} className="rounded-xl border border-ink-100 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink-800">{q.supervisor?.full_name??'Superviseur'}</p><p className="text-xs text-ink-400">{q.statut==='VALIDE'?'Quota validé':q.statut==='SOUMIS'?'En attente':q.statut==='REFUSE'?'Refusé':'Brouillon'}</p></div><strong className="text-base text-royal-700">{q.statut==='VALIDE'?q.jours:'—'} <span className="text-xs font-normal text-ink-400">jour(s)</span></strong></div><p className="mt-2 text-xs text-ink-600">{planned} programmé(s) · {active} en cours · {done} terminé(s)</p></div>})}</Card>}
    {selectedVm && <Card className="space-y-3"><p className="text-sm font-bold text-ink-800">VAD enregistrés · {dayjs(jour).format('MMMM YYYY')}</p>{sessionsMois.length===0?<p className="text-xs text-ink-400">Aucun VAD enregistré pour ce VM durant ce mois.</p>:sessionsMois.map(s=><div key={s.id} className="flex items-start justify-between gap-3 border-b border-ink-100 py-2"><div><p className="text-sm font-semibold text-ink-800">{s.supervisor?.full_name??'Superviseur'}</p><p className="text-xs text-ink-500">{dayjs(s.jour).format('DD/MM/YYYY')} · {s.mode==='COTONOU'?'Cotonou':'Hors Cotonou'}</p>{s.observations&&<p className="mt-1 text-xs text-ink-500">Observation : {s.observations}</p>}{s.compte_rendu&&<p className="mt-1 text-xs text-ink-500">Compte rendu : {s.compte_rendu}</p>}{VAD_CRITERES.map(c=>s[c.key]&&<p key={c.key} className="mt-1 text-xs text-ink-500"><strong>{c.label} :</strong> {s[c.key]}</p>)}</div><strong className={s.statut==='TERMINE'?'text-emerald-600':'text-amber-600'}>{s.statut==='TERMINE'?'Terminé':s.statut==='EN_COURS'?'En cours':'Programmé'}</strong></div>)}</Card>}
  </div>

  return <div className="space-y-5 pb-8">
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Terrain · TIL</p>
      <h1 className="mt-1 text-xl font-extrabold text-ink-800 font-display">VAD quotidien</h1>
      <p className="mt-1 text-sm text-ink-400">Suivi du VAD, présence terrain, chronométrage et compte rendu de fin de journée.</p>
    </div>
    <Card className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink-500">Visiteur médical<select value={vmId} onChange={e => setVmId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-sm"><option value="">Sélectionner un VM…</option>{vms.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}</select></label>
        <label className="block text-xs font-semibold text-ink-500">Date du VAD<input type="date" value={jour} onChange={e => setJour(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 px-3 py-3 text-sm" /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setMode('COTONOU')} className={`rounded-xl px-3 py-3 text-sm font-bold ${mode === 'COTONOU' ? 'bg-royal-700 text-white' : 'bg-ink-100 text-ink-600'}`}>VAD à Cotonou</button>
        <button type="button" onClick={() => setMode('HORS_COTONOU')} className={`rounded-xl px-3 py-3 text-sm font-bold ${mode === 'HORS_COTONOU' ? 'bg-royal-700 text-white' : 'bg-ink-100 text-ink-600'}`}>VAD hors Cotonou</button>
      </div>
      {selectedVm && <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600"><strong>{quotaLabel} : {quota === null ? 'non défini pour ce mois' : `${quota} jour(s)`}</strong><span className="ml-2 text-ink-400">· {quotaCount}/{quota ?? '—'} programmé(s), en cours ou terminé(s)</span>{quota !== null && quotaCount >= quota && !session && <p className="mt-1 font-semibold text-red-600">Quota mensuel atteint : aucun nouveau VAD ne peut être démarré.</p>}</div>}
    </Card>
    {vmId && <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink-800">{mode === 'COTONOU' ? 'Médecins du programme du jour' : 'Chronomètre VAD'}</p><p className="text-xs text-ink-400">{mode === 'COTONOU' ? 'Cochez uniquement les médecins effectivement vus ensemble.' : 'Démarrez le matin et clôturez en fin de journée.'}</p></div><div className="text-right"><p className="font-mono text-2xl font-extrabold text-royal-700">{formatDuration(elapsed)}</p><p className="text-[10px] text-ink-400">{session?.statut === 'EN_COURS' ? 'Chronomètre actif' : session?.statut === 'TERMINE' ? 'VAD terminé' : 'Non démarré'}</p></div></div>
      {mode === 'COTONOU' && <div className="space-y-2">{lignes.length === 0 ? <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">Aucune visite médicale n’est programmée pour ce VM à cette date. Aucun médecin hors programme ne peut être ajouté au VAD.</p> : lignes.map(l => { const c = clientMap[l.client_id]; return <label key={l.programme_ligne_id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3 text-sm"><input type="checkbox" checked={selection.includes(l.client_id)} disabled={session?.statut === 'TERMINE'} onChange={e => setSelection(old => e.target.checked ? [...old, l.client_id] : old.filter(id => id !== l.client_id))} /><span className="min-w-0 flex-1"><strong>{c?.nom ?? l.client_nom ?? 'Client'}</strong><span className="block text-xs text-ink-400">{c?.specialite ?? 'Spécialité non renseignée'} · {c?.centre ?? 'Centre non renseigné'}</span></span></label> })}<p className="text-xs font-semibold text-royal-700">{selection.length} médecin(s) sélectionné(s)</p></div>}
      <div><label className="mb-1 block text-xs font-semibold text-ink-500">Observations terrain</label><textarea value={observations} disabled={session?.statut === 'TERMINE'} onChange={e => setObservations(e.target.value)} rows={3} className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" placeholder="Observations sur le VM, les médecins, les échanges…" /></div>
      <div><label className="mb-1 block text-xs font-semibold text-ink-500">Compte rendu de fin de journée</label><textarea value={compteRendu} disabled={session?.statut === 'TERMINE'} onChange={e => setCompteRendu(e.target.value)} rows={4} className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" placeholder="Activités réalisées, difficultés, décisions et actions de suivi…" /></div>
      {session?.statut === 'EN_COURS' && <div className="space-y-3 border-t border-ink-100 pt-4">
        <div><p className="text-sm font-bold text-ink-800">Évaluation qualitative du VAD</p><p className="text-xs text-ink-400">Renseignez un commentaire libre pour chacun des six critères observés avant de clôturer.</p></div>
        {VAD_CRITERES.map(c => <div key={c.key} className="rounded-xl border border-ink-100 p-3">
          <label className="mb-1 block text-sm font-semibold text-ink-700">{c.label}</label>
          <p className="mb-2 text-xs text-ink-400">{c.help}</p>
          <textarea value={evaluation[c.key]} onChange={e => setEvaluation(old => ({ ...old, [c.key]: e.target.value }))} rows={3} className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-2 focus:ring-royal-100" placeholder="Décrivez librement les faits observés, points forts et axes d'amélioration…" />
        </div>)}
      </div>}
      <div className="flex flex-wrap gap-2">{!session || session.statut === 'PROGRAMME' ? <Button onClick={start} loading={saving} disabled={!vmId || (quota !== null && quotaCount >= quota)}>Démarrer le VAD</Button> : session.statut === 'EN_COURS' ? <Button onClick={finish} loading={saving}>Enregistrer l'évaluation et clôturer le VAD</Button> : <span className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">VAD clôturé · évaluation enregistrée</span>}</div>
      {notice && <p role="status" className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">{notice}</p>}
    </Card>}
    {selectedVm && <Card><p className="mb-2 text-sm font-bold text-ink-800">Historique du mois · {dayjs(jour).format('MMMM YYYY')}</p>{sessionsMois.length ? <div className="space-y-2">{sessionsMois.map(s => <div key={s.id} className="flex items-center justify-between border-b border-ink-100 py-2 text-xs"><span>{dayjs(s.jour).format('DD/MM/YYYY')} · {s.mode === 'COTONOU' ? 'VAD Cotonou' : 'VAD hors Cotonou'}</span><strong className={s.statut === 'TERMINE' ? 'text-emerald-600' : 'text-amber-600'}>{s.statut === 'TERMINE' ? 'Terminé' : 'En cours'}</strong></div>)}</div> : <p className="text-xs text-ink-400">Aucun VAD enregistré ce mois.</p>}</Card>}
  </div>
}
