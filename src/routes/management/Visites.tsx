import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCheckCircle, IconChevronRight } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { todayBenin, isoWeekMonday } from '@/lib/time'

type LigneJour = { id:string; client_id:string; jour:string; type_visite:string; ordre:number; clients:{id:string;nom:string;centre:string|null;specialite:string|null;potentiel:string|null}|null }
type VisiteRealisee = { id:string; programme_ligne_id:string|null; statut:string }

export default function SupervisorVisites() {
 const {profile}=useAuth()
 const [lignes,setLignes]=useState<LigneJour[]>([])
 const [realisees,setRealisees]=useState<VisiteRealisee[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState<string|null>(null)
 async function load(){
  if(!profile?.id)return
  setLoading(true);setError(null)
  const jour=todayBenin().format('YYYY-MM-DD')
  const debut=isoWeekMonday().format('YYYY-MM-DD')
  const {data:programme,error:programmeError}=await (supabase as any).from('programmes_visites_superviseurs').select('id,statut').eq('superviseur_id',profile.id).eq('semaine_debut',debut).maybeSingle()
  if(programmeError){setError('Impossible de charger le planning : '+programmeError.message);setLoading(false);return}
  const weekday=['DIMANCHE','LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI'][todayBenin().day()]
  if(!programme||programme.statut!=='VALIDE'||weekday==='DIMANCHE'){setLignes([]);setRealisees([]);setLoading(false);return}
  const [{data:rows,error:rowsError},{data:visits,error:visitsError}]=await Promise.all([
   (supabase as any).from('programme_visites_superviseur_lignes').select('id,client_id,jour,type_visite,ordre,clients(id,nom,centre,specialite,potentiel)').eq('programme_id',programme.id).eq('jour',weekday).order('ordre'),
   supabase.from('visites').select('id,programme_ligne_id,statut').eq('vm_id',profile.id).eq('jour',jour).not('programme_ligne_id','is',null)
  ])
  if(rowsError||visitsError)setError('Impossible de charger les visites : '+(rowsError?.message??visitsError?.message))
  setLignes((rows??[]) as LigneJour[]);setRealisees((visits??[]) as VisiteRealisee[]);setLoading(false)
 }
 useEffect(()=>{void load()},[profile?.id])
 const faites=new Set(realisees.filter(v=>v.statut==='REALISEE').map(v=>v.programme_ligne_id))
 const restantes=lignes.filter(l=>!faites.has(l.id))
 const terminees=lignes.filter(l=>faites.has(l.id))
 const medical=lignes.filter(l=>l.type_visite==='MEDICAL').length
 const pharma=lignes.filter(l=>l.type_visite==='PHARMACIE').length
 if(loading)return <div className="space-y-3 py-8"><Skeleton className="h-20"/><Skeleton className="h-28"/><Skeleton className="h-28"/></div>
 return <div className="space-y-5 pb-8">
  <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Espace superviseur</p><h1 className="provisit-page-title mt-1">Visites du jour</h1><p className="mt-1 text-xs capitalize text-ink-400">{todayBenin().format('dddd D MMMM YYYY')}</p></div>
  {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
  <div className="grid grid-cols-2 gap-3"><Card><p className="text-xs font-semibold text-royal-700">Visites médicales programmées</p><p className="mt-1 text-2xl font-extrabold">{medical}</p></Card><Card><p className="text-xs font-semibold text-emerald-700">Visites pharmacie programmées</p><p className="mt-1 text-2xl font-extrabold">{pharma}</p></Card></div>
  {!error&&lignes.length===0&&<Card className="py-10 text-center"><p className="text-sm font-semibold text-ink-600">Aucune visite programmée pour aujourd’hui</p><p className="mt-1 text-xs text-ink-400">Les visites apparaissent ici lorsque le planning hebdomadaire est validé.</p><Link to="/admin/planning-visites-superviseurs"><Button className="mt-4" variant="secondary">Consulter mon planning</Button></Link></Card>}
  {restantes.length>0&&<section className="space-y-2.5"><h2 className="text-sm font-bold text-ink-700">À effectuer · {restantes.length}</h2>{restantes.map((l,i)=><Link key={l.id} to={`/admin/visites/${l.id}`} className="block"><Card className="flex items-center gap-3 py-3.5"><div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-700"><span className="text-sm font-bold">{i+1}</span></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-800">{l.clients?.nom??'Client'}</p><div className="mt-1 flex flex-wrap items-center gap-2">{l.clients?.potentiel&&<PotentielBadge potentiel={l.clients.potentiel} compact/>}<span className="text-[11px] text-ink-400">{l.type_visite==='PHARMACIE'?'Pharmacie':'Médicale'} · {l.clients?.centre??'Centre non renseigné'}</span></div></div><IconChevronRight className="h-4 w-4 flex-shrink-0 text-ink-300"/></Card></Link>)}</section>}
  {terminees.length>0&&<section className="space-y-2.5"><h2 className="text-sm font-bold text-ink-400">Traitées · {terminees.length}</h2>{terminees.map(l=><Card key={l.id} className="flex items-center gap-3 py-3 opacity-70"><IconCheckCircle className="h-5 w-5 text-emerald-600"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-700">{l.clients?.nom??'Client'}</p><p className="text-[11px] text-ink-400">{l.type_visite==='PHARMACIE'?'Pharmacie':'Médicale'}</p></div></Card>)}</section>}
 </div>
}
