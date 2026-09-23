import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

export default function VadPlan(){
 const {profile}=useAuth(); const [mois,setMois]=useState(dayjs().add(1,'month').format('YYYY-MM')); const [rows,setRows]=useState<any[]>([]); const [loading,setLoading]=useState(false); const [notice,setNotice]=useState('')
 async function load(){setLoading(true); const {data,error}=await (supabase.from('vad_plans_mensuels' as any).select('*').eq('mois',mois+'-01').order('created_at',{ascending:false}) as any); setRows(data??[]); if(error)setNotice(error.message); setLoading(false)}
 useEffect(()=>{load()},[mois])
 async function add(){if(!profile)return; const {error}=await (supabase.from('vad_plans_mensuels' as any).insert({mois:mois+'-01',superviseur_id:profile.id,contenu:'Plan VAD/Duo à compléter'} ) as any); setNotice(error?error.message:'Plan enregistré.'); if(!error)load()}
 return <div className="space-y-6"><div><h1 className="text-xl font-extrabold text-ink-800 font-display">VAD – Plan de Duo</h1><p className="text-sm text-ink-400">Planification des VAD/Duo du mois suivant.</p></div><Card className="p-4 flex flex-wrap items-center gap-3"><label className="text-sm font-semibold">Mois</label><input type="month" value={mois} onChange={e=>setMois(e.target.value)} className="rounded-xl border border-ink-100 px-3 py-2"/><Button onClick={add}>Enregistrer le plan</Button></Card>{notice&&<p className="text-sm text-ink-500">{notice}</p>}<Card className="p-4">{loading?'Chargement...':rows.length?rows.map(r=><div key={r.id} className="border-b border-ink-100 py-3 text-sm">{r.contenu||'Plan VAD/Duo'}</div>):<p className="text-sm text-ink-400">Aucun plan pour ce mois.</p>}</Card></div>
}