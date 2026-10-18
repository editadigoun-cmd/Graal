import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconClipboard, IconCheckCircle, IconClock } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

type Profile={id:string;full_name:string;role:string;equipe_id:string|null}
type Report={id?:string;vm_id:string;semaine_debut:string;points_forts:string;points_faibles:string;commandes_obtenues:string;commandes_negociation:string;objectifs_semaine_prochaine:string;commentaires:string;couverture_prevue:number;couverture_realisee:number;taux_couverture:number;appreciation:string;soumis_at?:string}

const monday=(d=dayjs())=>d.startOf('week').add(1,'day')
const weekOptions=()=>Array.from({length:8},(_,i)=>monday().subtract(i,'week').format('YYYY-MM-DD'))

export default function RapportActiviteHebdomadaire(){
 const {profile}=useAuth(); const db=supabase as any
 const [vms,setVms]=useState<Profile[]>([]); const [reports,setReports]=useState<Report[]>([])
 const [week,setWeek]=useState(weekOptions()[0]); const [vmId,setVmId]=useState('')
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [coverage,setCoverage]=useState({prevue:0,realisee:0,taux:0})
 const [form,setForm]=useState({points_forts:'',points_faibles:'',commandes_obtenues:'',commandes_negociation:'',objectifs_semaine_prochaine:'',commentaires:'',appreciation:'',})
 const isAdmin=profile?.role==='admin'

 async function load(){
  if(!profile)return
  setLoading(true)
  const {data:all}=await db.from('profiles').select('id,full_name,role,equipe_id').eq('role','vm').eq('actif',true).order('full_name')
  const {data:rs}=await db.from('rapports_activite_hebdomadaires').select('*').eq('semaine_debut',week)
  let list=all??[]
  if(!isAdmin) list=list.filter((x:Profile)=>x.equipe_id===profile.equipe_id)
  setVms(list); setReports(rs??[])
  if(!vmId && list[0])setVmId(list[0].id)
  setLoading(false)
 }
 useEffect(()=>{load()},[profile?.id,week])
 useEffect(()=>{
  if(!vmId)return
  const r=reports.find(x=>x.vm_id===vmId)
  setForm({points_forts:r?.points_forts??'',points_faibles:r?.points_faibles??'',commandes_obtenues:r?.commandes_obtenues??'',commandes_negociation:r?.commandes_negociation??'',objectifs_semaine_prochaine:r?.objectifs_semaine_prochaine??'',commentaires:r?.commentaires??'',appreciation:r?.appreciation??''})
  db.rpc('calculer_couverture_vm_hebdo',{p_vm:vmId,p_semaine:week}).then(({data}:any)=>setCoverage(data??{prevue:0,realisee:0,taux:0}))
 },[vmId,week,reports])
 async function save(e:any){
  e.preventDefault(); if(!profile||!vmId)return
  setSaving(true)
  const vm=vms.find(x=>x.id===vmId)
  const {error}=await db.from('rapports_activite_hebdomadaires').upsert({...form,superviseur_id:profile.id,equipe_id:vm?.equipe_id??profile.equipe_id,semaine_debut:week,vm_id:vmId,couverture_prevue:coverage.prevue,couverture_realisee:coverage.realisee,taux_couverture:coverage.taux,soumis_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'superviseur_id,semaine_debut,vm_id'})
  setSaving(false); if(!error)load()
 }
 if(!profile||(profile.role!=='admin'&&profile.role!=='superviseur'))return <Card className="py-10 text-center">Accès réservé aux superviseurs et managers.</Card>
 if(loading)return <div className="space-y-3"><Skeleton className="h-24"/><Skeleton className="h-64"/></div>
 const taux=coverage.taux
 return <div className="space-y-6">
  <div><h1 className="text-xl font-bold text-ink-800 font-display">Rapport d'activité hebdomadaire</h1><p className="text-sm text-ink-400">Appréciation de la couverture et du travail de chaque VM à la fin de la semaine.</p></div>
  <Card><div className="grid sm:grid-cols-2 gap-4">
   <div><label className="block text-xs font-semibold text-ink-500 mb-1.5">Semaine</label><select className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" value={week} onChange={e=>setWeek(e.target.value)}>{weekOptions().map(w=><option key={w} value={w}>Semaine du {dayjs(w).format('DD/MM/YYYY')}</option>)}</select></div>
   <div><label className="block text-xs font-semibold text-ink-500 mb-1.5">VM à apprécier</label><select className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm" value={vmId} onChange={e=>setVmId(e.target.value)}>{vms.map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select></div>
  </div></Card>
  <div className="grid grid-cols-3 gap-3"><Card><p className="text-xs text-ink-400">Couverture prévue</p><p className="text-2xl font-bold">{coverage.prevue}</p></Card><Card><p className="text-xs text-ink-400">Visites réalisées</p><p className="text-2xl font-bold">{coverage.realisee}</p></Card><Card><p className="text-xs text-ink-400">Taux de couverture</p><p className="text-2xl font-bold">{taux}%</p><Badge tone={taux>=100?'success':taux>=80?'warning':'danger'}>{taux>=100?'Objectif couvert':taux>=80?'À surveiller':'Insuffisant'}</Badge></Card></div>
  <Card><form onSubmit={save} className="space-y-4">
   {[
    ['points_forts','POINTS FORTS DE LA SEMAINE','Points forts constatés dans le travail du VM.'],
    ['points_faibles','POINTS FAIBLES DE LA SEMAINE','Difficultés, écarts ou points à corriger.'],
    ['commandes_obtenues','COMMANDES OBTENUES','Commandes obtenues pendant la semaine.'],
    ['commandes_negociation','COMMANDES EN COURS DE NÉGOCIATION','Opportunités et commandes encore en négociation.'],
    ['objectifs_semaine_prochaine','OBJECTIFS SEMAINE PROCHAINE','Objectifs précis fixés pour la prochaine semaine.'],
    ['commentaires','COMMENTAIRES','Observations complémentaires du superviseur.']
   ].map(([key,label,placeholder])=><div key={key}><label className="block text-xs font-bold text-ink-600 mb-1.5">{label}</label><textarea rows={3} value={(form as any)[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={placeholder} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm"/></div>)}
   <div><label className="block text-xs font-bold text-ink-600 mb-1.5">APPRÉCIATION DE LA COUVERTURE</label><select value={form.appreciation} onChange={e=>setForm(f=>({...f,appreciation:e.target.value}))} className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm"><option value="">Sélectionner</option><option>Très bonne couverture</option><option>Bonne couverture</option><option>Couverture à améliorer</option><option>Couverture insuffisante</option></select></div>
   <Button type="submit" loading={saving}><IconCheckCircle className="h-4 w-4"/> Enregistrer le rapport</Button>
  </form></Card>
  <Card><p className="text-sm font-bold text-ink-700 mb-3">Suivi de la semaine</p><div className="space-y-2">{vms.map(vm=>{const r=reports.find(x=>x.vm_id===vm.id);return <div key={vm.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 p-3"><span className="text-sm font-medium">{vm.full_name}</span>{r?.soumis_at?<Badge tone="success">Rapport soumis</Badge>:<Badge tone="warning"><IconClock className="h-3 w-3 inline mr-1"/>À apprécier</Badge>}</div>})}</div></Card>
 </div>
}
