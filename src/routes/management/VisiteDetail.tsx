import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChevronLeft, IconMapPin } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGeolocation } from '@/hooks/useGeolocation'
import { supabase } from '@/lib/supabase'
import { todayBenin } from '@/lib/time'
import { MedicalFields, PharmacieFields, ErrorBanner } from '@/routes/vm/VisiteDetail'

type Ligne = { id:string; client_id:string; jour:string; type_visite:string; clients:{id:string;nom:string;centre:string|null;specialite:string|null;potentiel:string|null}|null }

export default function SupervisorVisiteDetail() {
 const { ligneId } = useParams()
 const navigate = useNavigate()
 const { profile } = useAuth()
 const geo = useGeolocation()
 const [ligne,setLigne] = useState<Ligne|null>(null)
 const [loading,setLoading] = useState(true)
 const [saving,setSaving] = useState(false)
 const [error,setError] = useState<string|null>(null)

 useEffect(()=>{
  let active=true
  async function load(){
   if(!profile?.id||!ligneId)return
   const {data,error}=await (supabase as any).from('programme_visites_superviseur_lignes')
    .select('id,client_id,jour,type_visite,clients(id,nom,centre,specialite,potentiel)')
    .eq('id',ligneId).single()
   if(!active)return
   if(error)setError(error.message)
   else setLigne(data as Ligne)
   setLoading(false)
  }
  void load()
  return ()=>{active=false}
 },[profile?.id,ligneId])

 async function save(fields:Record<string,unknown>,products:string[]){
  if(!profile?.id||!ligne)return
  if(geo.status!=='ok'||geo.latitude===null||geo.longitude===null){setError('Position GPS requise pour enregistrer la visite.');return}
  setSaving(true);setError(null)
  const jour=todayBenin().format('YYYY-MM-DD')
  const payload={
   programme_ligne_id:ligne.id,client_id:ligne.client_id,vm_id:profile.id,jour,
   type_visite:ligne.type_visite,statut:'REALISEE' as const,latitude:geo.latitude,longitude:geo.longitude,...fields
  }
  const {data:existing,error:findError}=await supabase.from('visites').select('id')
   .eq('programme_ligne_id',ligne.id).eq('vm_id',profile.id).maybeSingle()
  if(findError){setError(findError.message);setSaving(false);return}
  const result=existing
   ? await supabase.from('visites').update(payload).eq('id',existing.id).select('id').single()
   : await supabase.from('visites').insert(payload).select('id').single()
  if(result.error||!result.data){setError(result.error?.message??'Impossible d’enregistrer la visite.');setSaving(false);return}
  const visitId=result.data.id
  if(existing){
   const {error:deleteError}=await supabase.from('visite_produits').delete().eq('visite_id',visitId)
   if(deleteError){setError(deleteError.message);setSaving(false);return}
  }
  if(products.length){
   const {error:productsError}=await supabase.from('visite_produits').insert(products.map(produit_id=>({visite_id:visitId,produit_id})))
   if(productsError){setError(productsError.message);setSaving(false);return}
  }
  setSaving(false)
  navigate('/admin/visites',{replace:true})
 }

 if(loading)return <div className="space-y-3 py-8"><Skeleton className="h-20"/><Skeleton className="h-64"/></div>
 if(!ligne)return <div className="space-y-3"><button onClick={()=>navigate('/admin/visites')} className="text-sm text-royal-700">← Retour aux visites</button><ErrorBanner message={error??'Visite introuvable.'}/></div>
 return <div className="space-y-5 pb-8">
  <button onClick={()=>navigate('/admin/visites')} className="flex items-center gap-2 text-sm font-semibold text-royal-700"><IconChevronLeft className="h-4 w-4"/>Retour aux visites</button>
  <Card><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-royal-600">Visite programmée</p><h1 className="text-lg font-extrabold text-ink-800">{ligne.clients?.nom}</h1><p className="text-xs text-ink-400">{ligne.clients?.centre??'Centre non renseigné'} · {ligne.clients?.specialite??'Spécialité non renseignée'}</p></div>{ligne.clients?.potentiel&&<PotentielBadge potentiel={ligne.clients.potentiel} compact/>}</div></Card>
  <div className="flex items-center gap-2 rounded-xl border border-ink-100 px-3 py-2 text-xs"><IconMapPin className="h-4 w-4 text-royal-600"/>{geo.status==='ok'?'Position GPS acquise':geo.status==='locating'?'Acquisition GPS…':'Position GPS requise'}</div>
  {error&&<ErrorBanner message={error}/>}
  {ligne.type_visite==='MEDICAL'?<MedicalFields onSubmit={save} saving={saving}/>:<PharmacieFields onSubmit={save} saving={saving}/>}
 </div>
}
