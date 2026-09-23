import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { IconPlus } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

export default function VadPlan(){
 const {profile}=useAuth(); const [mois,setMois]=useState(dayjs().add(1,'month').format('YYYY-MM')); const [rows,setRows]=useState<any[]>([]); const [loading,setLoading]=useState(false); const [notice,setNotice]=useState(''); const [formOpen,setFormOpen]=useState(false)
 async function load(){setLoading(true); const {data,error}=await (supabase.from('vad_plans_mensuels' as any).select('*').eq('mois',mois+'-01').order('created_at',{ascending:false}) as any); setRows(data??[]); if(error)setNotice(error.message); setLoading(false)}
 useEffect(()=>{load()},[mois])
 async function add(){if(!profile)return; const {error}=await (supabase.from('vad_plans_mensuels' as any).insert({mois:mois+'-01',superviseur_id:profile.id,contenu:'Plan VAD/Duo à compléter'} ) as any); setNotice(error?error.message:'Plan enregistré.'); if(!error){setFormOpen(false);load()}}}
 return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-extrabold text-ink-800 font-display">VAD – Plan de Duo</h1><p className="text-sm text-ink-400">Planification des VAD/Duo du mois suivant. Le formulaire s'ouvre uniquement lors de la création.</p></div><Button size="sm" icon={<IconPlus className="h-4 w-4"/>} onClick={()=>setFormOpen(true)}>Nouveau plan</Button></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><Card><p className="text-xs text-ink-400">Plans</p><p className="mt-1 text-2xl font-extrabold text-ink-800">{rows.length}</p></Card><Card><p className="text-xs text-ink-400">Mois affiché</p><p className="mt-1 text-sm font-extrabold text-ink-800">{dayjs(mois+'-01').format('MMMM YYYY')}</p></Card><Card><p className="text-xs text-ink-400">Statut</p><p className="mt-1 text-sm font-extrabold text-ink-800">{rows.length?'Plan présent':'À créer'}</p></Card></div>{notice&&<p className="text-sm text-ink-500">{notice}</p>}<Card className="p-4">{loading?'Chargement...':rows.length?rows.map(r=><div key={r.id} className="border-b border-ink-100 py-3 text-sm">{r.contenu||'Plan VAD/Duo'}</div>):<p className="text-sm text-ink-400">Aucun plan pour ce mois.</p>}</Card></div>
}