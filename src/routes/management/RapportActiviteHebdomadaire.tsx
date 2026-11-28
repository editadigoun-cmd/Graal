import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { IconPlus } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

export default function RapportActiviteHebdomadaire() {
  const { profile } = useAuth()
  const [semaine, setSemaine] = useState(dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'))
  const [vmId, setVmId] = useState('')
  const [vms, setVms] = useState<any[]>([])
  const [supervisedIds, setSupervisedIds] = useState<string[]>([])
  const [rapports, setRapports] = useState<any[]>([])
  const [form, setForm] = useState({ forts: '', faibles: '', commandes: '', negociation: '', objectifs: '', commentaires: '' })
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  async function load() {
    if (profile?.role === 'superviseur') { setLoading(false); return }
    const [{ data: v }, { data: r }, teams] = await Promise.all([
      supabase.from('profiles').select('id,full_name').eq('role','vm').eq('actif',true).order('full_name'),
      supabase.from('rapports_activite_hebdomadaires' as any).select('*').order('semaine_debut',{ascending:false}).limit(100) as any,
      profile?.role === 'superviseur' ? supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id',profile.id) : Promise.resolve({data:[] as {equipe_id:string}[]})
    ])
    const teamIds=(teams.data??[]).map((x:any)=>x.equipe_id)
    const allowedVmIds=new Set((v??[]).filter((x:any)=>profile?.role==='admin'||teamIds.includes(x.equipe_id)).map((x:any)=>x.id))
    setSupervisedIds(teamIds)
    setVms((v??[]).filter((x:any)=>allowedVmIds.has(x.id)))
    setRapports((r??[]).filter((x:any)=>profile?.role==='admin'||allowedVmIds.has(x.vm_id)))
    if (v?.[0] && !vmId) setVmId(v[0].id)
  }
  useEffect(() => { load() }, [profile?.id])

  function nouveau() {
    setNotice('')
    setForm({ forts:'', faibles:'', commandes:'', negociation:'', objectifs:'', commentaires:'' })
    setFormOpen(true)
  }

  function modifier(r:any) {
    setVmId(r.vm_id); setSemaine(r.semaine_debut)
    setForm({
      forts:r.points_forts ?? '', faibles:r.points_faibles ?? '', commandes:r.commandes_obtenues ?? '',
      negociation:r.commandes_negociation ?? '', objectifs:r.objectifs_semaine_suivante ?? '', commentaires:r.commentaires ?? ''
    })
    setNotice('')
    setFormOpen(true)
  }

  async function save() {
    if (!profile || !vmId) return
    const { error } = await (supabase.from('rapports_activite_hebdomadaires' as any).upsert({
      superviseur_id:profile.id, vm_id:vmId, equipe_id:vms.find((v:any)=>v.id===vmId)?.equipe_id ?? null, semaine_debut:semaine, points_forts:form.forts, points_faibles:form.faibles,
      commandes_obtenues:form.commandes, commandes_negociation:form.negociation,
      objectifs_semaine_suivante:form.objectifs, commentaires:form.commentaires
    }, { onConflict:'vm_id,semaine_debut' }) as any)
    setNotice(error ? error.message : 'Rapport enregistré.')
    if (!error) { setFormOpen(false); load() }
  }

  return <div className="space-y-5 pb-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-extrabold text-ink-800 font-display">Rapport d'activité hebdomadaire</h1><p className="text-sm text-ink-400">Statistiques et liste. Le formulaire s'ouvre uniquement à la création ou modification.</p></div>
      <Button size="sm" icon={<IconPlus className="h-4 w-4"/>} onClick={nouveau}>Nouveau rapport</Button>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Card><p className="text-xs text-ink-400">Rapports</p><p className="mt-1 text-2xl font-extrabold text-ink-800">{rapports.length}</p></Card>
      <Card><p className="text-xs text-ink-400">VM suivis</p><p className="mt-1 text-2xl font-extrabold text-ink-800">{new Set(rapports.map(r=>r.vm_id)).size}</p></Card>
      <Card><p className="text-xs text-ink-400">Dernière semaine</p><p className="mt-1 text-sm font-extrabold text-ink-800">{rapports[0] ? dayjs(rapports[0].semaine_debut).format('DD/MM/YYYY') : '—'}</p></Card>
    </div>
    <Card className="overflow-hidden"><div className="divide-y divide-ink-100">
      {rapports.length===0 ? <p className="p-8 text-center text-sm text-ink-400">Aucun rapport enregistré.</p> :
        rapports.map(r=><div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><p className="text-sm font-bold text-ink-800">{vms.find(v=>v.id===r.vm_id)?.full_name ?? 'VM'}</p><p className="text-xs text-ink-400">Semaine du {dayjs(r.semaine_debut).format('DD/MM/YYYY')}</p></div>
          <Button size="sm" variant="secondary" onClick={()=>modifier(r)}>Modifier</Button>
        </div>)
      }
    </div></Card>
    <Modal open={formOpen} onClose={()=>setFormOpen(false)} title="Rapport d'activité hebdomadaire" description="Renseignez les éléments du rapport." maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><input type="date" value={semaine} onChange={e=>setSemaine(e.target.value)} className="rounded-xl border border-ink-100 px-3 py-2"/><select value={vmId} onChange={e=>setVmId(e.target.value)} className="rounded-xl border border-ink-100 px-3 py-2">{vms.map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select></div>
        {([['forts','POINTS FORTS DE LA SEMAINE'],['faibles','POINTS FAIBLES DE LA SEMAINE'],['commandes','COMMANDES OBTENUES'],['negociation','COMMANDES EN COURS DE NÉGOCIATION'],['objectifs','OBJECTIFS SEMAINE PROCHAINE'],['commentaires','COMMENTAIRES']] as const).map(([k,l])=><label key={k} className="block text-sm font-semibold">{l}<textarea value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} className="mt-1 min-h-20 w-full rounded-xl border border-ink-100 p-3 font-normal"/></label>)}
        {notice && <p className="text-sm text-ink-500">{notice}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setFormOpen(false)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></div>
      </div>
    </Modal>
  </div>
}


type SupervisorObjective = {
  id: string
  libelle: string
  statut_realisation: 'ATTEINT' | 'PARTIELLEMENT_ATTEINT' | 'NON_ATTEINT' | null
}

function SupervisorPersonalWeeklyReport() {
  const { profile } = useAuth()
  const [semaine] = useState(() => dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'))
  const [objectifs, setObjectifs] = useState<SupervisorObjective[]>([])
  const [form, setForm] = useState({ forts: '', faibles: '', commandes: '', negociation: '', commentaires: '', appreciation: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    ;(async () => {
      const [{ data: report, error: reportError }, { data: goals, error: goalsError }] = await Promise.all([
        (supabase.from('rapports_hebdomadaires_superviseurs' as any).select('*').eq('superviseur_id', profile.id).eq('semaine_debut', semaine).maybeSingle() as any),
        (supabase.from('objectifs_semaine_superviseurs' as any).select('id,libelle,statut_realisation').eq('superviseur_id', profile.id).eq('semaine_debut', semaine).order('created_at') as any)
      ])
      if (!active) return
      if (reportError || goalsError) setNotice(reportError?.message ?? goalsError?.message ?? 'Erreur de chargement.')
      if (report) setForm({
        forts: report.points_forts ?? '',
        faibles: report.points_faibles ?? '',
        commandes: report.commandes_obtenues ?? '',
        negociation: report.commandes_negociation ?? '',
        commentaires: report.commentaires ?? '',
        appreciation: report.appreciation ?? ''
      })
      setObjectifs((goals ?? []) as SupervisorObjective[])
      setLoading(false)
    })()
    return () => { active = false }
  }, [profile?.id, semaine])

  async function enregistrer() {
    if (!profile?.id) return
    setSaving(true); setNotice('')
    const { error } = await (supabase.from('rapports_hebdomadaires_superviseurs' as any).upsert({
      superviseur_id: profile.id,
      semaine_debut: semaine,
      points_forts: form.forts,
      points_faibles: form.faibles,
      commandes_obtenues: form.commandes,
      commandes_negociation: form.negociation,
      commentaires: form.commentaires,
      appreciation: form.appreciation,
      soumis_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'superviseur_id,semaine_debut' }) as any)
    setSaving(false)
    setNotice(error ? error.message : 'Votre rapport hebdomadaire a été enregistré.')
  }

  async function evaluer(id: string, statut_realisation: 'ATTEINT' | 'PARTIELLEMENT_ATTEINT' | 'NON_ATTEINT') {
    const { error } = await (supabase.from('objectifs_semaine_superviseurs' as any).update({ statut_realisation }).eq('id', id) as any)
    if (error) { setNotice(error.message); return }
    setObjectifs(current => current.map(o => o.id === id ? { ...o, statut_realisation } : o))
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const textField = (key: keyof typeof form, label: string, placeholder: string) => (
    <label className="block text-sm font-semibold text-ink-700">{label}
      <textarea value={form[key]} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} rows={3} placeholder={placeholder} className="mt-1.5 w-full rounded-xl border border-ink-200 p-3 text-sm font-normal" />
    </label>
  )

  return <div className="space-y-5 pb-6">
    <div>
      <h1 className="text-xl font-extrabold text-ink-800 font-display">Mon rapport hebdomadaire</h1>
      <p className="text-sm text-ink-400">Votre bilan personnel · Semaine du {dayjs(semaine).format('DD/MM/YYYY')}</p>
    </div>
    {notice && <p role="status" className="rounded-xl bg-ink-50 p-3 text-sm">{notice}</p>}
    <Card className="space-y-4">
      <div><h2 className="text-sm font-bold text-ink-800">Évaluation de mes objectifs</h2><p className="text-xs text-ink-400">Retrouvez les objectifs définis lors de votre programmation et évaluez chacun d'eux.</p></div>
      {objectifs.length === 0 ? <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-500">Aucun objectif spécifique n'a été défini pour cette semaine dans votre planning.</p> : objectifs.map((o, i) => <div key={o.id} className="space-y-2 border-t border-ink-100 pt-3">
        <p className="text-sm font-semibold text-ink-800">{i + 1}. {o.libelle}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(['ATTEINT','PARTIELLEMENT_ATTEINT','NON_ATTEINT'] as const).map(status => {
            const label = status === 'ATTEINT' ? 'Atteint' : status === 'PARTIELLEMENT_ATTEINT' ? 'Partiellement atteint' : 'Non atteint'
            const selected = o.statut_realisation === status
            const style = selected ? (status === 'ATTEINT' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : status === 'PARTIELLEMENT_ATTEINT' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-red-500 bg-red-50 text-red-700') : 'border-ink-200 text-ink-600'
            return <button key={status} type="button" onClick={() => void evaluer(o.id, status)} className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${style}`}>{label}</button>
          })}
        </div>
      </div>)}
    </Card>
    <Card className="space-y-4">
      <div><h2 className="text-sm font-bold text-ink-800">Mon bilan de la semaine</h2><p className="text-xs text-ink-400">Renseignez votre propre activité, sans sélectionner de VM.</p></div>
      {textField('forts','Points forts de la semaine','Résultats positifs, actions réussies…')}
      {textField('faibles','Points faibles de la semaine','Difficultés rencontrées, points à améliorer…')}
      {textField('commandes','Commandes obtenues','Résultats ou commandes obtenus…')}
      {textField('negociation','Commandes en cours de négociation','Dossiers ou opportunités en cours…')}
      {textField('commentaires','Commentaires','Informations complémentaires…')}
      {textField('appreciation','Appréciation personnelle','Votre appréciation globale de la semaine…')}
      <Button fullWidth loading={saving} onClick={() => void enregistrer()}>Enregistrer mon rapport hebdomadaire</Button>
    </Card>
  </div>
}
