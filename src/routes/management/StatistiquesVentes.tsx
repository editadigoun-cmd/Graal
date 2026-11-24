import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { supabase } from '@/lib/supabase'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

type Lab={id:string;nom:string}; type Grossiste={id:string;nom:string}; type Product={id:string;nom:string;pght:number}
type Sale={produit_id:string;grossiste_id:string;semaine_debut:string;quantite:number}
type Stock={produit_id:string;grossiste_id:string;semaine_debut:string;quantite:number}
function fmt(n:number){return n.toLocaleString('fr-FR',{maximumFractionDigits:1})}
export default function StatistiquesVentes(){
 const today=dayjs(),todayKey=today.format('YYYY-MM-DD'),monthStart=today.startOf('month').format('YYYY-MM-DD'),monthEnd=today.endOf('month').format('YYYY-MM-DD'),weekStart=today.subtract((today.day()+6)%7,'day').format('YYYY-MM-DD'),elapsedDays=today.date(),daysInMonth=today.daysInMonth()
 const [labs,setLabs]=useState<Lab[]>([]),[lab,setLab]=useState(''),[grossistes,setGrossistes]=useState<Grossiste[]>([]),[grossiste,setGrossiste]=useState(''),[products,setProducts]=useState<Product[]>([]),[sales,setSales]=useState<Sale[]>([]),[stocks,setStocks]=useState<Stock[]>([]),[monthlyGoals,setMonthlyGoals]=useState<Record<string,number>>({}),[loading,setLoading]=useState(false)
 useEffect(()=>{supabase.from('laboratoires').select('id,nom').order('nom').then(({data})=>{setLabs(data??[]);if(data?.length)setLab(v=>v||data[0].id)});supabase.from('grossistes').select('id,nom').order('nom').then(({data})=>setGrossistes(data??[]))},[])
 useEffect(()=>{if(!lab)return;let alive=true;async function load(){setLoading(true);const {data:cat,error}=await (supabase as any).from('produits_pilotage').select('produit_id,pght').eq('laboratoire_id',lab) as {data:Array<{produit_id:string;pght:number|string}>|null;error:{message:string}|null};if(error){if(alive)setLoading(false);return};const ids=(cat??[]).map(x=>x.produit_id);if(!ids.length){if(alive){setProducts([]);setSales([]);setStocks([]);setLoading(false)}return};const {data:names}=await supabase.from('produits').select('id,nom').in('id',ids);const map=new Map((names??[]).map(p=>[p.id,p.nom]));const p:Product[]=(cat??[]).map(x=>({id:x.produit_id,nom:map.get(x.produit_id)??'—',pght:Number(x.pght)})).sort((a,b)=>a.nom.localeCompare(b.nom));const [{data:s},{data:monthly},{data:st}]=await Promise.all([supabase.from('ventes_hebdomadaires').select('produit_id,grossiste_id,semaine_debut,quantite').in('produit_id',ids).gte('semaine_debut',monthStart).lte('semaine_debut',todayKey),(supabase as any).from('grossiste_ventes_mensuelles').select('produit_id,grossiste_id,report_month,quantite_cumulee').in('produit_id',ids).eq('report_month',monthStart),supabase.from('stocks_hebdomadaires').select('produit_id,grossiste_id,semaine_debut,quantite').in('produit_id',ids).lte('semaine_debut',todayKey).order('semaine_debut',{ascending:false})]);const {data:goals}=await supabase.from('objectifs_mensuels_produits').select('produit_id,mois,objectif_quantite').in('produit_id',ids).eq('mois',monthStart);const snapshots=(monthly??[]).map((v:{produit_id:string;grossiste_id:string;report_month:string;quantite_cumulee:number|string})=>({...v,key:v.produit_id+'|'+v.grossiste_id}));const snapshotKeys=new Set(snapshots.map(v=>v.key));const weekly=(s??[]).filter(v=>!snapshotKeys.has(v.produit_id+'|'+v.grossiste_id)).map(v=>({...v,quantite:Number(v.quantite)}));const cumulative:Sale[]=snapshots.map(v=>({produit_id:v.produit_id,grossiste_id:v.grossiste_id,semaine_debut:v.report_month,quantite:Number(v.quantite_cumulee)}));if(alive){setProducts(p);setSales([...weekly,...cumulative]);setStocks((st??[]).map(x=>({...x,quantite:Number(x.quantite)})));setMonthlyGoals(Object.fromEntries((goals??[]).map(x=>[x.produit_id,Number(x.objectif_quantite)])));setLoading(false)}}load();return()=>{alive=false}},[lab,weekStart,monthStart,todayKey])
 const filtered=sales.filter(x=>(!grossiste||x.grossiste_id===grossiste)&&x.semaine_debut>=monthStart&&x.semaine_debut<=todayKey)
 const monthlyUnits=filtered.reduce((s,x)=>s+x.quantite,0),monthlyCa=filtered.reduce((s,x)=>s+x.quantite*(products.find(p=>p.id===x.produit_id)?.pght??0),0),monthlyCaAll=sales.filter(x=>x.semaine_debut>=monthStart&&x.semaine_debut<=todayKey).reduce((s,x)=>s+x.quantite*(products.find(p=>p.id===x.produit_id)?.pght??0),0),monthlyObjective=products.reduce((s,p)=>s+(monthlyGoals[p.id]??0)*p.pght,0),objectiveToDate=monthlyObjective*elapsedDays/daysInMonth,objectiveRate=objectiveToDate?monthlyCaAll/objectiveToDate*100:0,monthlyRate=monthlyObjective?monthlyCaAll/monthlyObjective*100:0,variance=monthlyCaAll-objectiveToDate,unitGoal=products.reduce((s,p)=>s+(monthlyGoals[p.id]??0),0),unitsObjectiveToDate=unitGoal*elapsedDays/daysInMonth
 const grossisteTotals=grossistes.map(g=>({name:g.nom,qty:filtered.filter(s=>s.grossiste_id===g.id).reduce((a,x)=>a+x.quantite,0),ca:filtered.filter(s=>s.grossiste_id===g.id).reduce((a,x)=>a+x.quantite*(products.find(p=>p.id===x.produit_id)?.pght??0),0)})).filter(x=>x.ca>0)
 const latestStock=new Map<string,number>();for(const s of stocks){if(grossiste&&s.grossiste_id!==grossiste)continue;const key=s.produit_id+'|'+s.grossiste_id;if(!latestStock.has(key))latestStock.set(key,s.quantite)}
 const stockTotal=Array.from(latestStock.values()).reduce((s,x)=>s+x,0)
 const rows=products.map(p=>{const qty=filtered.filter(s=>s.produit_id===p.id).reduce((s,x)=>s+x.quantite,0),stock=Array.from(latestStock.entries()).filter(([k])=>k.startsWith(p.id+'|')).reduce((s,[,v])=>s+v,0);return{...p,qty,ca:qty*p.pght,stock}}).filter(p=>p.qty||p.stock)
 const mix=grossisteTotals.map(x=>({name:x.name,value:x.ca}))
 function exportCsv(){const out=[['Produit','PGHT (€)','Ventes mois (quantité)','CA mois (€)','Stock dernier relevé'],...rows.map(p=>[p.nom,p.pght,p.qty,p.ca,p.stock])];const csv=out.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob([new Uint8Array([239,187,191]),csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='statistiques-ventes-'+weekStart+'.csv';a.click();URL.revokeObjectURL(url)}
 return <div className="space-y-5"><header><h1 className="text-xl font-extrabold text-ink-800">Statistiques des ventes · suivi mensuel</h1><p className="text-sm text-ink-400">Suivi mensuel automatique, arrêté à la date du jour.</p></header>
 <Card className="p-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-ink-500">Laboratoire<select value={lab} onChange={e=>setLab(e.target.value)} className="mt-1 block w-full rounded-xl border p-2.5 text-sm">{labs.map(x=><option key={x.id} value={x.id}>{x.nom}</option>)}</select></label><label className="text-xs font-semibold text-ink-500">Grossiste<select value={grossiste} onChange={e=>setGrossiste(e.target.value)} className="mt-1 block w-full rounded-xl border p-2.5 text-sm"><option value="">Tous les grossistes</option>{grossistes.map(x=><option key={x.id} value={x.id}>{x.nom}</option>)}</select></label><div className="rounded-xl border bg-slate-50 p-2.5 text-sm"><span className="text-xs text-slate-500">Date automatique</span><div className="font-semibold">{today.format("DD/MM/YYYY")}</div><div className="text-xs text-slate-500">{elapsedDays}/{daysInMonth} jours</div></div></div><div className="mt-3 flex justify-end"><button onClick={exportCsv} className="rounded-xl border px-3 py-2 text-sm">Exporter CSV</button></div></Card>
 <div className="grid grid-cols-2 gap-3"><Card className="p-4"><p className="text-xs text-ink-400">Unités vendues · mois</p><p className="mt-1 text-2xl font-bold">{fmt(monthlyUnits)} <span className="text-sm font-normal">u.</span></p></Card><Card className="p-4"><p className="text-xs text-ink-400">CA cumulé du mois</p><p className="mt-1 text-2xl font-bold">{fmt(monthlyCa)} €</p></Card></div>
 <Card className="p-4">
  <h2 className="font-bold">Objectif commercial · {today.format("MMMM YYYY")}</h2>
  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
   <div className="rounded-xl border bg-slate-50 p-3">
    <p className="text-xs text-ink-500">Objectif mensuel</p><p className="text-xl font-bold">{fmt(monthlyObjective)} €</p>
   </div>
   <div className="rounded-xl border bg-slate-50 p-3">
    <p className="text-xs text-ink-500">Objectif à date</p><p className="text-xl font-bold">{fmt(objectiveToDate)} €</p>
   </div>
   <div className="rounded-xl border bg-slate-50 p-3">
    <p className="text-xs text-ink-500">CA cumulé</p><p className="text-xl font-bold">{fmt(monthlyCaAll)} €</p>
   </div>
  </div>
  <div className="mt-4 flex flex-wrap items-center gap-4">
   <div className="relative h-36 w-36 shrink-0">
    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
     <circle cx="60" cy="60" r="48" stroke="#e2e8f0" strokeWidth="12" fill="none"/>
     <circle cx="60" cy="60" r="48" stroke={objectiveRate>=100?"#059669":objectiveRate>=80?"#f59e0b":"#dc2626"} strokeWidth="12" fill="none" strokeDasharray="301.6" strokeDashoffset={301.6*(1-Math.min(objectiveRate,100)/100)} strokeLinecap="round"/>
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
     <span className="text-xl font-extrabold">{fmt(objectiveRate)}%</span><span className="text-[10px] text-slate-500">objectif à date</span>
    </div>
   </div>
   <div className="min-w-0 flex-1 space-y-2">
    <div className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">Réalisation objectif mensuel</p><p className="font-bold">{fmt(monthlyRate)}%</p></div>
    <div className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">Réalisation objectif à date</p><p className="font-bold">{fmt(objectiveRate)}%</p></div>
    <div className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">Écart à date</p><p className={"font-bold "+(variance>=0?"text-emerald-700":"text-red-600")}>{variance>=0?"Avance":"Retard"} : {fmt(Math.abs(variance))} €</p></div>
   </div>
  </div>
 </Card>
 <Card className="p-4">
  <h2 className="font-bold">Répartition du CA par grossiste</h2>
  {mix.length>0 ? <div className="mt-3 h-64">
   <ResponsiveContainer width="100%" height="100%">
    <PieChart>
     <Pie data={mix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({name,percent})=>name+" "+(percent*100).toFixed(0)+"%"}>
      {mix.map((x,i)=><Cell key={x.name} fill={["#0f766e","#0891b2","#6366f1","#f59e0b","#e11d48","#8b5cf6","#14b8a6"][i%7]}/>)}
     </Pie>
     <Tooltip formatter={(v:any)=>fmt(Number(v))+" €"}/>
    </PieChart>
   </ResponsiveContainer>
  </div> : <p className="mt-4 text-sm text-ink-400">—</p>}
 </Card>
 <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><Card className="p-4"><p className="text-xs text-ink-400">Stock total</p><p className="mt-1 text-2xl font-extrabold">{fmt(stockTotal)} unités</p></Card><Card className="p-4"><p className="text-xs text-ink-400">Lignes produit</p><p className="mt-1 text-2xl font-extrabold">{rows.length}</p></Card></div>
 <Card className="overflow-x-auto"><div className="p-4"><h2 className="font-bold">Détail par produit</h2>{loading&&<p className="mt-2 text-sm text-ink-400">Chargement…</p>}</div><table className="min-w-full text-xs"><thead><tr className="bg-ink-50"><th className="p-3 text-left">Produit</th><th className="p-3 text-right">Stock</th><th className="p-3 text-right">PGHT (€)</th><th className="p-3 text-right">Quantité</th><th className="p-3 text-right">CA (€)</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} className="border-t"><td className="p-3">{p.nom}</td><td className="p-3 text-right">{fmt(p.stock)}</td><td className="p-3 text-right">{fmt(p.pght)}</td><td className="p-3 text-right">{fmt(p.qty)}</td><td className="p-3 text-right font-semibold">{fmt(p.ca)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 bg-ink-50 font-bold"><td className="p-3">TOTAL</td><td className="p-3 text-right">{fmt(stockTotal)}</td><td></td><td className="p-3 text-right">{fmt(monthlyUnits)}</td><td className="p-3 text-right">{fmt(monthlyCa)} €</td></tr></tfoot></table></Card></div>
}
