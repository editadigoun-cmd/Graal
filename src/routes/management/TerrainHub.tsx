import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { IconMapPin, IconStethoscope, IconClipboard, IconAlert, IconTrendingUp, IconBarChart, IconUsers } from '@/components/ui/icons'

type Item={path:string;title:string;description:string;icon:any;label:string;adminOnly?:boolean}
const items:Item[]=[
 {path:'/admin/suivi-terrain',title:'Suivi terrain',description:'Suivre l’activité et les interventions sur le terrain.',icon:IconMapPin,label:'Suivi'},
 {path:'/admin/vad-plan',title:'VAD & Duo',description:'Planifier les VAD/Duo du mois et préparer les actions terrain.',icon:IconStethoscope,label:'Planification'},
 {path:'/admin/rapport-activite-hebdo',title:'Rapport hebdomadaire',description:'Consolider les points forts, difficultés, commandes et objectifs de chaque VM.',icon:IconClipboard,label:'Rapports'},
 {path:'/admin/controle-frequence',title:'Fréquence clients',description:'Surveiller les programmations répétées et les exceptions marketing.',icon:IconAlert,label:'Contrôle'},
 {path:'/admin/rapports-duo',title:'Duo terrain',description:'Consulter et suivre les activités réalisées en duo.',icon:IconUsers,label:'Duo'},
 {path:'/admin/animation-equipe',title:'Animation d’équipe',description:'Piloter les actions d’animation et l’accompagnement des équipes.',icon:IconTrendingUp,label:'Animation'},
 {path:'/admin/indicateurs-animation',title:'Indicateurs d’animation',description:'Analyser les indicateurs liés à l’animation des équipes.',icon:IconBarChart,label:'Indicateurs',adminOnly:true}
]
export default function TerrainHub(){
 const nav=useNavigate(); const {profile}=useAuth(); const [filter,setFilter]=useState('Tous')
 const visible=items.filter(x=>!x.adminOnly||profile?.role==='admin'); const shown=filter==='Tous'?visible:visible.filter(x=>x.label===filter)
 const filters=['Tous','Suivi','Planification','Rapports','Contrôle','Duo','Animation','Indicateurs']
 return <div className="space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-xs font-bold uppercase tracking-[.16em] text-royal-600">Pilotage opérationnel</p><h1 className="mt-1 text-2xl font-extrabold text-ink-800 font-display">Terrain & activité</h1><p className="mt-1 max-w-2xl text-sm text-ink-400">Un seul espace pour retrouver le suivi terrain, les VAD/Duo, les rapports, les contrôles et l’animation des équipes.</p></div>
  </div>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
   <StatCard label="Modules terrain" value={visible.length} tone="royal" icon={<IconMapPin className="h-4 w-4"/>}/>
   <StatCard label="Planification" value={visible.filter(x=>x.label==="Planification").length} tone="emerald" icon={<IconStethoscope className="h-4 w-4"/>}/>
   <StatCard label="Rapports" value={visible.filter(x=>x.label==="Rapports").length} tone="flame" icon={<IconClipboard className="h-4 w-4"/>}/>
   <StatCard label="Contrôle" value={visible.filter(x=>x.label==="Contrôle").length} tone="royal" icon={<IconAlert className="h-4 w-4"/>}/>
  </div>
  <div className="flex gap-2 overflow-x-auto pb-1">{filters.map(f=><button key={f} onClick={()=>setFilter(f)} className={'whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold '+(filter===f?'bg-royal-600 text-white':'bg-ink-100 text-ink-500 hover:bg-ink-200')}>{f}</button>)}</div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
   {shown.map(x=>{const Icon=x.icon; return <Card key={x.path} className="group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-soft">
    <div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-royal-50 text-royal-600"><Icon className="h-5 w-5"/></div><span className="rounded-full bg-ink-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">{x.label}</span></div>
    <h2 className="mt-4 text-base font-bold text-ink-800">{x.title}</h2><p className="mt-1 min-h-10 text-xs leading-5 text-ink-400">{x.description}</p>
    <Button size="sm" variant="secondary" className="mt-5 w-full" onClick={()=>nav(x.path)}>Ouvrir</Button>
   </Card>})}
  </div>
 </div>
}