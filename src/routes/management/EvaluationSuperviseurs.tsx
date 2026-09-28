import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'

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
