import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

type Vm = { id: string; full_name: string; equipe_id: string | null }
type Quota = { id: string; superviseur_id: string; vm_id: string; mois: string; jours: number; statut: string; commentaire_superviseur: string | null; commentaire_admin: string | null; profiles?: { full_name: string } | null; vm?: { full_name: string } | null }

export default function QuotasVad() {
 const { profile } = useAuth()
 const db = supabase as any
 const mois = dayjs().add(1,'month').startOf('month').format('YYYY-MM-DD')
 const [vms,setVms] = useState<Vm[]>([])
 const [rows,setRows] = useState<Quota[]>([])
 const [values,setValues] = useState<Record<string,number>>({})
 const [comments,setComments] = useState('')
 const [adminReasons,setAdminReasons] = useState<Record<string,string>>({})
 const [loading,setLoading] = useState(true)
 const [saving,setSaving] = useState(false)
 const [notice,setNotice] = useState('')
 const [clock,setClock] = useState(Date.now())
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer)},[])
 const deadline=new Date(dayjs(mois).subtract(1,'month').date(25).hour(23).minute(59).second(59).millisecond(0).format('YYYY-MM-DDTHH:mm:ss')+'+01:00')
 const remaining=Math.max(0,deadline.getTime()-clock)
 const countdown=remaining>0?`${Math.floor(remaining/86400000)} j ${Math.floor(remaining%86400000/3600000)} h ${Math.floor(remaining%3600000/60000)} min ${Math.floor(remaining%60000/1000)} s`:'Délai dépassé'
 const late=clock>deadline.getTime()

 async function load() {
  if (!profile?.id) return
  setLoading(true)
  const [{data: teams},{data: allVms},{data: quotas}] = await Promise.all([
   supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id',profile.id),
   supabase.from('profiles').select('id,full_name,equipe_id').eq('role','vm').eq('actif',true).order('full_name'),
   db.from('vad_duo_quotas_mensuels').select('*, profiles!vad_duo_quotas_mensuels_superviseur_id_fkey(full_name), vm:profiles!vad_duo_quotas_mensuels_vm_id_fkey(full_name)').eq('mois',mois).order('created_at')
  ])
  const teamIds=(teams??[]).map((x:any)=>x.equipe_id)
  const visible=(profile.role==='admin'?(allVms??[]):(allVms??[]).filter((v:any)=>v.equipe_id && teamIds.includes(v.equipe_id))) as Vm[]
  setVms(visible)
  const filtered=(quotas??[]) as Quota[]
  setRows(filtered)
  setValues(Object.fromEntries(filtered.map(q=>[q.vm_id,q.jours])))
  setLoading(false)
 }
 useEffect(()=>{void load()},[profile?.id,profile?.role])
 const isAdmin=profile?.role==='admin'
 const pending=rows.filter(r=>r.statut==='SOUMIS')
 const mine=rows.filter(r=>r.superviseur_id===profile?.id)
 const statusLabel=(s:string)=>s==='VALIDE'?'Validé':s==='SOUMIS'?'En attente de validation':s==='REFUSE'?'Refusé':'Brouillon'
 async function submit() {
  if(!profile?.id)return
  if(late&&profile.role!=='admin'){setNotice('Délai dépassé : la proposition est verrouillée. Contactez l’administrateur.');return}
  if(!vms.length||vms.some(v=>values[v.id]===undefined||Number(values[v.id])<0||Number(values[v.id])>31)){setNotice('Complétez les quotas de tous les VM avant soumission.');return}
  setSaving(true);setNotice('')
  const payload=vms.map(v=>({superviseur_id:profile.id,vm_id:v.id,mois,jours:Math.max(0,Math.min(31,Number(values[v.id]??3))),statut:'SOUMIS',commentaire_superviseur:comments||null,commentaire_admin:null,valide_par:null,valide_le:null,soumis_le:new Date().toISOString()}))
  const {error}=await db.from('vad_duo_quotas_mensuels').upsert(payload,{onConflict:'superviseur_id,vm_id,mois'})
  setSaving(false)
  if(error){setNotice(error.message);return}
  setNotice('Proposition soumise à l’administrateur pour validation.')
  await load()
 }
 async function decide(row:Quota,statut:'VALIDE'|'REFUSE') {
  const reason=(adminReasons[row.id]??'').trim()
  if(statut==='REFUSE'&&!reason){setNotice('Le motif du refus est obligatoire.');return}
  setSaving(true);setNotice('')
  const {error}=await db.from('vad_duo_quotas_mensuels').update({statut,commentaire_admin:statut==='REFUSE'?reason:null,valide_par:profile?.id,valide_le:new Date().toISOString()}).eq('id',row.id)
  setSaving(false)
  if(error){setNotice(error.message);return}
  setNotice(statut==='VALIDE'?'Quota validé. Il sera appliqué pour le mois concerné.':'Proposition refusée. Le superviseur peut consulter le motif et corriger sa proposition.')
  await load()
 }
 if(loading)return <div className="py-10 text-center text-sm text-ink-400">Chargement des quotas mensuels…</div>
 return <div className="space-y-5 pb-8">
  <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Terrain · TIL</p><h1 className="mt-1 text-xl font-extrabold text-ink-800 font-display">Quotas mensuels VAD</h1><p className="mt-1 text-sm text-ink-400">Proposition du superviseur et validation administrative avant application.</p></div>
  <Card className={`space-y-2 border ${late?'border-red-200 bg-red-50':'border-amber-100 bg-amber-50'}`}><p className="text-sm font-bold text-ink-800">Mois concerné : {dayjs(mois).format('MMMM YYYY')}</p><p className="text-xs text-ink-500">{isAdmin?'Examinez les propositions soumises par les superviseurs.':'Définissez les quotas VAD pour chaque VM, puis soumettez la proposition à l’administrateur.'}</p><p className="text-xs font-semibold">Échéance : 25 du mois précédent à 23h59 (Bénin)</p><p className="text-sm font-bold">{countdown}</p>{late&&!isAdmin&&<p className="text-xs text-red-700">Soumission verrouillée après l’échéance.</p>}</Card>
  {isAdmin ? <div className="space-y-3">{pending.length===0?<Card className="py-8 text-center text-sm text-ink-400">Aucune proposition en attente pour ce mois.</Card>:pending.map(q=><Card key={q.id} className="space-y-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-ink-800">{q.vm?.full_name??q.vm_id}</p><p className="text-xs text-ink-400">Proposé par {q.profiles?.full_name??'Superviseur'}</p></div><strong className="text-lg text-royal-700">{q.jours} jour(s)</strong></div>{q.commentaire_superviseur&&<p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">{q.commentaire_superviseur}</p>}<div><label className="mb-1 block text-xs font-semibold text-ink-500">Commentaire de l’administrateur</label><textarea value={adminReasons[q.id]??''} onChange={e=>setAdminReasons(old=>({...old,[q.id]:e.target.value}))} rows={2} className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" placeholder="Motif obligatoire si vous refusez la proposition…"/></div><div className="flex gap-2"><Button onClick={()=>void decide(q,'VALIDE')} loading={saving}>Valider</Button><Button variant="danger" onClick={()=>void decide(q,'REFUSE')} loading={saving} disabled={!(adminReasons[q.id]??'').trim()}>Refuser</Button></div></Card>)}</div>
  : <><Card className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">{vms.map(v=>{const existing=mine.find(q=>q.vm_id===v.id);const locked=existing?.statut==='SOUMIS'||existing?.statut==='VALIDE';return <label key={v.id} className="block rounded-xl border border-ink-100 p-3"><span className="block text-sm font-semibold text-ink-700">{v.full_name}</span><span className="mt-2 flex items-center gap-2"><input type="number" min="0" max="31" disabled={locked} value={values[v.id]??3} onChange={e=>setValues(old=>({...old,[v.id]:Number(e.target.value)}))} className="w-20 rounded-lg border border-ink-200 px-2 py-2 text-sm"/><span className="text-xs text-ink-400">jour(s) · {existing?statusLabel(existing.statut):'À préparer'}</span></span>{existing?.statut==='REFUSE'&&existing.commentaire_admin&&<span className="mt-2 block text-xs text-red-600">Motif : {existing.commentaire_admin}</span>}</label>})}</div><div><label className="mb-1 block text-xs font-semibold text-ink-500">Commentaire général (facultatif)</label><textarea value={comments} onChange={e=>setComments(e.target.value)} rows={3} className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm" placeholder="Justification des quotas proposés…"/></div><Button onClick={()=>void submit()} loading={saving} disabled={!vms.length||late||mine.some(q=>q.statut==='SOUMIS'||q.statut==='VALIDE')}>Soumettre la proposition du mois prochain</Button></Card><Card><p className="mb-2 text-sm font-bold text-ink-800">État de la proposition</p>{mine.length?mine.map(q=><div key={q.id} className="flex justify-between border-b border-ink-100 py-2 text-xs"><span>{vms.find(v=>v.id===q.vm_id)?.full_name??q.vm_id} · {q.jours} jour(s)</span><strong>{statusLabel(q.statut)}</strong></div>):<p className="text-xs text-ink-400">Aucune proposition enregistrée pour ce mois.</p>}</Card></>}
  {notice&&<p role="status" className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">{notice}</p>}
 </div>
}
