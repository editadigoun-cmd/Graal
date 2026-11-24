import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { TrajetCarte, type PointTrajet } from '@/components/ui/TrajetCarte'
import dayjs from 'dayjs'

type Evaluation = {
  superviseur_id: string
  full_name: string
  mois: string
  vm_count: number
  vad_objectif: number
  vad_realises: number
  vad_quota_pct: number
  qualite_duo_pct: number
  clients_total: number
  clients_maj: number
  prospection_pct: number
  staffs_realises: number
  staffs_objectif: number
  rapport_mensuel_score: number
  appreciation: string | null
  recommandations: string | null
  note_finale: number
}


type VadSession = {
  id: string; superviseur_id: string; vm_id: string; jour: string; mode: string; statut: string;
  medecins_vus_ids: string[] | null; observations: string | null; compte_rendu: string | null;
  started_at: string | null; ended_at: string | null; start_latitude: number | null; start_longitude: number | null;
  end_latitude: number | null; end_longitude: number | null;
  supervisor?: { full_name: string } | null; vm?: { full_name: string } | null;
}
type VadClient = { id: string; nom: string; specialite: string | null; centre: string | null }
function VadsDuMois({ mois }: { mois: string }) {
  const [sessions, setSessions] = useState<VadSession[]>([])
  const [clients, setClients] = useState<Record<string, VadClient[]>>({})
  const [trajets, setTrajets] = useState<Record<string, PointTrajet[]>>({})
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const debut = dayjs(mois).startOf('month').format('YYYY-MM-DD')
      const fin = dayjs(mois).add(1, 'month').startOf('month').format('YYYY-MM-DD')
      const { data } = await (supabase.from('vad_duo_journaliers' as any)
        .select('*, supervisor:profiles!vad_duo_journaliers_superviseur_id_fkey(full_name), vm:profiles!vad_duo_journaliers_vm_id_fkey(full_name)')
        .gte('jour', debut).lt('jour', fin).order('jour', { ascending: false }) as any)
      const rows = (data ?? []) as VadSession[]
      if (!active) return
      setSessions(rows)
      const ids = [...new Set(rows.flatMap(s => s.medecins_vus_ids ?? []))]
      const { data: clientRows } = ids.length
        ? await supabase.from('clients').select('id,nom,specialite,centre').in('id', ids)
        : { data: [] as VadClient[] }
      const byId = Object.fromEntries((clientRows ?? []).map((x: any) => [x.id, x]))
      const clientMap: Record<string, VadClient[]> = {}
      rows.forEach(s => { clientMap[s.id] = (s.medecins_vus_ids ?? []).map(id => byId[id]).filter(Boolean) })
      const routeMap: Record<string, PointTrajet[]> = {}
      await Promise.all(rows.map(async s => {
        const pts: PointTrajet[] = []
        if (s.start_latitude != null && s.start_longitude != null) pts.push({ id: s.id+'-start', lat: s.start_latitude, lng: s.start_longitude, label: 'Départ du superviseur', heure: s.started_at ? dayjs(s.started_at).format('HH:mm') : '', type: 'visite' })
        const selectedIds = s.medecins_vus_ids ?? []
        if (selectedIds.length) {
          const { data: visitRows } = await (supabase.from('visites').select('id,client_id,latitude,longitude,horodatage,clients(nom,centre)').eq('vm_id',s.vm_id).eq('jour',s.jour).in('client_id',selectedIds).not('latitude','is',null).not('longitude','is',null).order('horodatage') as any)
          ;(visitRows ?? []).forEach((v: any) => {
            if (v.latitude != null && v.longitude != null) pts.push({ id:v.id,lat:v.latitude,lng:v.longitude,label:[v.clients?.nom,v.clients?.centre].filter(Boolean).join(' · ') || 'Client visité avec le VM',heure:v.horodatage?dayjs(v.horodatage).format('HH:mm'):'',type:'visite' })
          })
        }
        if (s.end_latitude != null && s.end_longitude != null) pts.push({ id:s.id+'-end',lat:s.end_latitude,lng:s.end_longitude,label:'Fin du VAD',heure:s.ended_at?dayjs(s.ended_at).format('HH:mm'):'',type:'cloture' })
        routeMap[s.id] = pts
      }))
      if (active) { setClients(clientMap); setTrajets(routeMap); setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [mois])
  return <Card className="space-y-4">
    <div><p className="text-sm font-bold text-ink-800">VAD effectuées · {dayjs(mois).format('MMMM YYYY')}</p><p className="text-xs text-ink-400 mt-1">Historique réel des journées VAD, médecins accompagnés, itinéraire GPS et observations.</p></div>
    {loading ? <Skeleton className="h-40" /> : sessions.length === 0 ? <p className="py-6 text-center text-sm text-ink-400">Aucun VAD terminé ou enregistré pour ce mois.</p> : sessions.map(s => <div key={s.id} className="rounded-2xl border border-ink-100 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-ink-800">{s.supervisor?.full_name ?? 'Superviseur'} · {s.vm?.full_name ?? 'VM'}</p><p className="text-xs text-ink-400 mt-1">{dayjs(s.jour).format('DD/MM/YYYY')} · {s.mode === 'COTONOU' ? 'Cotonou' : 'Hors Cotonou'}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{s.statut === 'TERMINE' ? 'Terminé' : s.statut === 'EN_COURS' ? 'En cours' : 'Programmé'}</span></div>
      <div><p className="text-xs font-bold text-ink-600 mb-2">Médecins vus avec le VM ({clients[s.id]?.length ?? 0})</p>{(clients[s.id] ?? []).length ? <div className="grid gap-2 sm:grid-cols-2">{clients[s.id].map(cl => <div key={cl.id} className="rounded-xl bg-ink-50 p-3"><p className="text-sm font-semibold text-ink-800">{cl.nom}</p><p className="text-xs text-ink-500">{[cl.specialite,cl.centre].filter(Boolean).join(' · ')}</p></div>)}</div> : <p className="text-xs text-ink-400">Aucun médecin sélectionné dans le compte rendu.</p>}</div>
      {(s.observations || s.compte_rendu) && <div className="grid gap-3 sm:grid-cols-2">{s.observations && <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold text-amber-800">Observations</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{s.observations}</p></div>}{s.compte_rendu && <div className="rounded-xl bg-ink-50 p-3"><p className="text-xs font-bold text-ink-600">Compte rendu</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{s.compte_rendu}</p></div>}</div>}
      {(trajets[s.id] ?? []).length > 0 ? <div><p className="text-xs font-bold text-ink-600 mb-2">Itinéraire GPS du superviseur</p><TrajetCarte points={trajets[s.id]} /></div> : <p className="rounded-xl bg-ink-50 p-3 text-xs text-ink-500">Aucune coordonnée GPS exploitable pour tracer cet itinéraire. Les positions de départ/fin et les positions GPS des visites du VM apparaîtront lorsqu'elles auront été enregistrées.</p>}
    </div>)}
  </Card>
}

export default function EvaluationSuperviseurs() {
  const [rows, setRows] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Evaluation | null>(null)
  const [staffs, setStaffs] = useState(0)
  const [rapportScore, setRapportScore] = useState(0)
  const [appreciation, setAppreciation] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await (supabase.from('v_evaluation_superviseurs_mensuelle' as never) as any).select('*').order('full_name')
    setRows((data ?? []) as Evaluation[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openEvaluation(row: Evaluation) {
    setSelected(row)
    setStaffs(row.staffs_realises ?? 0)
    setRapportScore(row.rapport_mensuel_score ?? 0)
    setAppreciation(row.appreciation ?? '')
    setRecommendations(row.recommandations ?? '')
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    const mois = selected.mois
    await (supabase.from('evaluations_superviseurs_mensuelles' as never) as any).upsert({
      superviseur_id: selected.superviseur_id,
      mois,
      staffs_realises: staffs,
      rapport_mensuel_score: rapportScore,
      appreciation: appreciation || null,
      recommandations: recommendations || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'superviseur_id,mois' })
    setSaving(false)
    setSelected(null)
    load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Évaluation des superviseurs</h1>
        <p className="text-sm text-ink-400">Suivi mensuel de la performance managériale selon les règles du cahier des charges.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><p className="text-[11px] text-ink-400">Superviseurs</p><p className="text-2xl font-bold text-ink-800 mt-1">{rows.length}</p></Card>
        <Card><p className="text-[11px] text-ink-400">VAD réalisées</p><p className="text-2xl font-bold text-ink-800 mt-1">{rows.reduce((s,r)=>s+r.vad_realises,0)}</p></Card>
        <Card><p className="text-[11px] text-ink-400">Qualité duo</p><p className="text-2xl font-bold text-ink-800 mt-1">{rows.length ? Math.round(rows.reduce((s,r)=>s+r.qualite_duo_pct,0)/rows.length) : 0}%</p></Card>
        <Card><p className="text-[11px] text-ink-400">Base prospection</p><p className="text-2xl font-bold text-ink-800 mt-1">{rows.length ? Math.round(rows.reduce((s,r)=>s+r.prospection_pct,0)/rows.length) : 0}%</p></Card>
        <Card><p className="text-[11px] text-ink-400">Note moyenne</p><p className="text-2xl font-bold text-royal-700 mt-1">{rows.length ? Math.round(rows.reduce((s,r)=>s+r.note_finale,0)/rows.length) : 0}/100</p></Card>
      </div>

      <VadsDuMois mois={rows[0]?.mois ?? dayjs().startOf('month').format('YYYY-MM-DD')} />

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100">
          <p className="text-sm font-bold text-ink-800">Évaluation du mois</p>
          <p className="text-xs text-ink-400 mt-1">VAD, qualité des retours, base de prospection, staffs et rapports mensuels.</p>
        </div>
        <div className="divide-y divide-ink-100">
          {rows.map((r) => (
            <div key={r.superviseur_id} className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 min-w-0"><p className="text-sm font-bold text-ink-800">{r.full_name}</p><p className="text-xs text-ink-400 mt-1">{r.vm_count} VM · objectif {r.vad_objectif} VAD · {r.vad_realises} réalisées</p></div>
              <div className="grid grid-cols-3 gap-3 text-center text-xs min-w-[260px]">
                <div><p className="text-ink-400">Quota VAD</p><p className="font-bold text-ink-800">{Math.round(r.vad_quota_pct)}%</p></div>
                <div><p className="text-ink-400">Qualité duo</p><p className="font-bold text-ink-800">{Math.round(r.qualite_duo_pct)}%</p></div>
                <div><p className="text-ink-400">Prospection</p><p className="font-bold text-ink-800">{Math.round(r.prospection_pct)}%</p></div>
              </div>
              <div className="text-right"><p className="text-lg font-extrabold text-royal-700">{Math.round(r.note_finale)}/100</p><Button size="sm" variant="secondary" onClick={() => openEvaluation(r)}>Noter</Button></div>
            </div>
          ))}
          {rows.length === 0 && <div className="p-8 text-center text-sm text-ink-400">Aucun superviseur actif à évaluer.</div>}
        </div>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Évaluer ${selected.full_name}` : 'Évaluer'} description="Les indicateurs VAD, qualité duo et prospection sont calculés automatiquement." maxWidth="max-w-2xl">
        {selected && <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><p className="text-[10px] text-ink-400">VAD</p><p className="font-bold">{selected.vad_realises}/{selected.vad_objectif}</p></Card>
            <Card><p className="text-[10px] text-ink-400">Qualité duo</p><p className="font-bold">{Math.round(selected.qualite_duo_pct)}%</p></Card>
            <Card><p className="text-[10px] text-ink-400">Base</p><p className="font-bold">{Math.round(selected.prospection_pct)}%</p></Card>
            <Card><p className="text-[10px] text-ink-400">Note</p><p className="font-bold text-royal-700">{Math.round(selected.note_finale)}/100</p></Card>
          </div>
          <div><label className="block text-xs font-semibold text-ink-500 mb-1.5">Staffs réalisés ce mois</label><input type="number" min={0} value={staffs} onChange={e=>setStaffs(Number(e.target.value))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" /><p className="text-[10px] text-ink-400 mt-1">Objectif calculé à 3 staffs par semaine.</p></div>
          <div><label className="block text-xs font-semibold text-ink-500 mb-1.5">Régularité / qualité des rapports mensuels</label><select value={rapportScore} onChange={e=>setRapportScore(Number(e.target.value))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm">{[0,1,2,3,4,5].map(n=><option key={n} value={n}>{n}/5</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-ink-500 mb-1.5">Appréciation</label><textarea rows={3} value={appreciation} onChange={e=>setAppreciation(e.target.value)} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" /></div>
          <div><label className="block text-xs font-semibold text-ink-500 mb-1.5">Recommandations</label><textarea rows={3} value={recommendations} onChange={e=>setRecommendations(e.target.value)} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm" /></div>
          <Button loading={saving} onClick={save}>Enregistrer l'évaluation</Button>
        </div>}
      </Modal>
    </div>
  )
}
