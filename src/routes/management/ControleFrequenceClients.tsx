import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

export default function ControleFrequenceClients(){
 const { profile } = useAuth()
 const [rows,setRows]=useState<any[]>([]); const [loading,setLoading]=useState(true)
 async function load(){setLoading(true);let query=(supabase.from('v_clients_programmes_frequents' as any).select('*').order('nb_programmations_mois',{ascending:false}) as any);if(profile?.role==='superviseur'){const {data:teams}=await supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id',profile.id);const teamIds=(teams??[]).map(x=>x.equipe_id);const {data:vms}=await supabase.from('profiles').select('id').eq('role','vm').in('equipe_id',teamIds.length?teamIds:['00000000-0000-0000-0000-000000000000']);const ids=(vms??[]).map(x=>x.id);query=query.in('vm_id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])}const {data,error}=await query;setRows(data??[]);if(error)console.error(error);setLoading(false)}
 useEffect(()=>{if(profile?.id)void load()},[profile?.id,profile?.role])
 return <div className="space-y-6"><div><h1 className="text-xl font-extrabold text-ink-800 font-display">Fréquence des clients</h1><p className="text-sm text-ink-400">Fréquence de programmation des clients des VM de votre équipe.</p></div><Card className="overflow-hidden">{loading?<p className="p-5 text-sm text-ink-400">Chargement...</p>:rows.length===0?<p className="p-5 text-sm text-ink-400">Aucune fréquence excessive détectée.</p>:<div className="divide-y divide-ink-100">{rows.map(r=><div key={r.client_id+'-'+r.vm_id+'-'+r.mois} className="p-4 flex items-center justify-between gap-3"><div><p className="font-semibold text-ink-700">{r.client_nom}</p><p className="text-xs text-ink-400">{r.vm_nom}</p></div><span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold">{r.nb_programmations_mois} programmation(s) · {r.niveau}</span></div>)}</div>}</Card></div>
}