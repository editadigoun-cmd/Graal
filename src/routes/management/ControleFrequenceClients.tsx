import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'

export default function ControleFrequenceClients(){
 const [rows,setRows]=useState<any[]>([]); const [loading,setLoading]=useState(true)
 async function load(){setLoading(true);const {data}=await (supabase.from('v_clients_programmes_frequents' as any).select('*').order('nb_programmations_mois',{ascending:false}) as any);setRows(data??[]);setLoading(false)}
 useEffect(()=>{load()},[])
 return <div className="space-y-6"><div><h1 className="text-xl font-extrabold text-ink-800 font-display">Fréquence des clients</h1><p className="text-sm text-ink-400">Vigilance sur les programmations répétées d'un même client.</p></div><Card className="overflow-hidden">{loading?<p className="p-5 text-sm text-ink-400">Chargement...</p>:rows.length===0?<p className="p-5 text-sm text-ink-400">Aucune fréquence excessive détectée.</p>:<div className="divide-y divide-ink-100">{rows.map(r=><div key={r.client_id+'-'+r.vm_id+'-'+r.mois} className="p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-ink-700">{r.client_nom}</p><p className="text-xs text-ink-400">{r.vm_nom}</p></div><span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold">{r.nb_programmations_mois} programmation(s) · {r.niveau}</span></div>)}</div>}</Card></div>
}