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
