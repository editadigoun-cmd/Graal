import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { isoWeekMonday, nowBenin } from '@/lib/time'

type Client = { id:string; nom:string; centre:string|null; specialite:string|null; potentiel:string|null }
type Ligne = { id:string; client_id:string; jour:string; type_visite:string; clients:Client|null }
type Programme = { id:string; superviseur_id:string; semaine_debut:string; statut:string; soumis_at:string|null; motif_rejet?:string|null; profiles?:{full_name:string}|null }
const JOURS=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI'] as const
const LABELS:Record<string,string>={LUNDI:'Lundi',MARDI:'Mardi',MERCREDI:'Mercredi',JEUDI:'Jeudi',VENDREDI:'Vendredi'}
const statusLabel=(s:string)=>s==='SOUMIS'?'Soumis':s==='VALIDE'?'Validé':s==='REFUSE'?'À corriger':'Brouillon'

export default function PlanningVisitesSuperviseurs(){
 const {profile}=useAuth()
 const isAdmin=profile?.role==='admin'
 const semaine=isoWeekMonday(nowBenin().add(1,'week')).format('YYYY-MM-DD')
 const [programme,setProgramme]=useState<Programme|null>(null)
 const [lignes,setLignes]=useState<Ligne[]>([])
 const [clients,setClients]=useState<Client[]>([])
 const [jour,setJour]=useState<string>('LUNDI')
 const [type,setType]=useState<'MEDICAL'|'PHARMACIE'>('MEDICAL')
 const [clientId,setClientId]=useState('')
 const [search,setSearch]=useState('')
 const [showMore,setShowMore]=useState(false)
 const [adminRows,setAdminRows]=useState<(Programme & {lignes:Ligne[]})[]>([])
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [notice,setNoticeState]=useState('')
 const setNotice=(message:string)=>{setNoticeState(message);if(message)window.dispatchEvent(new CustomEvent('platform-feedback',{detail:{title:message.toLowerCase().includes('erreur')?'Erreur':'Information',message,kind:message.toLowerCase().includes('erreur')?'error':'info'}}))}
 const [motifRejet,setMotifRejet]=useState<Record<string,string>>({})
 const [clock,setClock]=useState(Date.now())
 useEffect(()=>{const t=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(t)},[])
 const deadline=new Date(new Date(semaine+'T00:00:00+01:00').getTime()-2*86400000+14*3600000)
 const deadlineLeft=Math.max(0,deadline.getTime()-clock)
 const deadlineText=deadlineLeft>0?`${Math.floor(deadlineLeft/86400000)} j ${Math.floor(deadlineLeft%86400000/3600000)} h ${Math.floor(deadlineLeft%3600000/60000)} min ${Math.floor(deadlineLeft%60000/1000)} s`:'Délai dépassé'
 const deadlineExpired=clock>deadline.getTime()

 async function load(){
  if(!profile?.id)return
  setLoading(true);setNotice('')
  if(isAdmin){
   const {data,error}=await (supabase as any).from('programmes_visites_superviseurs').select('*, profiles:profiles!programmes_visites_superviseurs_superviseur_id_fkey(full_name), lignes:programme_visites_superviseur_lignes(*,clients(id,nom,centre,specialite,potentiel))').in('statut',['SOUMIS','VALIDE','REFUSE']).order('semaine_debut',{ascending:false}).limit(100)
   if(error)setNotice(error.message)
   setAdminRows((data??[]) as (Programme & {lignes:Ligne[]})[])
   setLoading(false);return
  }
  const db=supabase as any
  const [{data:portfolio,error:portfolioError},{data:existing,error:programmeError}]=await Promise.all([
   db.from('portefeuille_superviseurs').select('client_id').eq('superviseur_id',profile.id),
   db.from('programmes_visites_superviseurs').select('*').eq('superviseur_id',profile.id).eq('semaine_debut',semaine).maybeSingle()
  ])
  if(portfolioError||programmeError){setNotice(portfolioError?.message??programmeError?.message??'Erreur de chargement');setLoading(false);return}
  const ids=(portfolio??[]).map((x:any)=>x.client_id)
  if(ids.length){const {data,error}=await db.from('clients').select('id,nom,centre,specialite,potentiel').in('id',ids).order('nom');if(error)setNotice(error.message);setClients((data??[]) as Client[])}else setClients([])
  let prog=existing as Programme|null
  if(!prog){const {data,error}=await db.from('programmes_visites_superviseurs').insert({superviseur_id:profile.id,semaine_debut:semaine}).select('*').single();if(error){setNotice(error.message);setLoading(false);return}prog=data as Programme}
  setProgramme(prog)
  const {data,error}=await db.from('programme_visites_superviseur_lignes').select('id,client_id,jour,type_visite,clients(id,nom,centre,specialite,potentiel)').eq('programme_id',prog.id).order('ordre')
  if(error)setNotice(error.message)
  setLignes((data??[]) as Ligne[])
  setLoading(false)
 }
 useEffect(()=>{void load()},[profile?.id,profile?.role])
 const isEditable=!!programme&&['BROUILLON','REFUSE'].includes(programme.statut)
 const clientsProgrammes=new Set(lignes.map(l=>l.client_id))
 const filtered=useMemo(()=>clients.filter(c=>{
  if(clientsProgrammes.has(c.id))return false
  const pharmacy=c.specialite==='PHARMACIE'
  if(type==='PHARMACIE'&&!pharmacy)return false
  if(type==='MEDICAL'&&pharmacy)return false
  const q=search.trim().toLocaleLowerCase('fr')
  return q.length>=2&&(c.nom.toLocaleLowerCase('fr').includes(q)||(c.centre??'').toLocaleLowerCase('fr').includes(q)||(c.specialite??'').toLocaleLowerCase('fr').includes(q))
 }),[clients,type,search,clientsProgrammes])
 const resultatsVisibles=filtered.slice(0,showMore?30:8)
 const jourLignes=lignes.filter(l=>l.jour===jour)
 const med=jourLignes.filter(l=>l.type_visite==='MEDICAL').length
 const pharma=jourLignes.filter(l=>l.type_visite==='PHARMACIE').length
 async function ajouter(){
  if(!programme||!clientId)return
  setBusy(true);setNotice('')
  const {data,error}=await (supabase as any).from('programme_visites_superviseur_lignes').insert({programme_id:programme.id,client_id:clientId,jour,type_visite:type,ordre:jourLignes.length}).select('id,client_id,jour,type_visite,clients(id,nom,centre,specialite,potentiel)').single()
  setBusy(false)
  if(error){setNotice(error.message);return}
  setLignes(old=>[...old,data as Ligne]);setClientId('')
 }
 async function retirer(id:string){
  setBusy(true);const {error}=await (supabase as any).from('programme_visites_superviseur_lignes').delete().eq('id',id);setBusy(false)
  if(error){setNotice(error.message);return}setLignes(old=>old.filter(x=>x.id!==id))
 }
 async function soumettre(){
  if(!programme)return
  const parJour=JOURS.map(d=>({jour:d,medical:lignes.filter(l=>l.jour===d&&l.type_visite==='MEDICAL').length,pharma:lignes.filter(l=>l.jour===d&&l.type_visite==='PHARMACIE').length}))
  const jourVide=parJour.find(x=>x.medical+x.pharma===0)
  if(jourVide){setNotice(`Le quota de programmation n’est pas couvert : ajoutez au moins une visite pour ${LABELS[jourVide.jour].toLowerCase()}.`);return}
  const depasse=parJour.find(x=>x.medical>8||x.pharma>2)
  if(depasse){setNotice(`Quota dépassé le ${LABELS[depasse.jour]} : maximum 8 visites médicales et 2 pharmacies.`);return}
  setBusy(true);const {data,error}=await (supabase as any).from('programmes_visites_superviseurs').update({statut:'SOUMIS',soumis_at:new Date().toISOString()}).eq('id',programme.id).select('*').single();setBusy(false)
  if(error){setNotice(error.message);return}setProgramme(data as Programme);setNotice('Planning hebdomadaire soumis à l’administration.')
 }
 async function decision(p:Programme,statut:'VALIDE'|'REFUSE'){
  const motif=statut==='REFUSE'?(motifRejet[p.id]??'').trim():''
  if(statut==='REFUSE'&&!motif){setNotice('Le motif du rejet est obligatoire.');return}
  setBusy(true)
  const {error}=await (supabase as any).from('programmes_visites_superviseurs').update({statut,valide_at:new Date().toISOString(),valide_par:profile?.id,motif_rejet:statut==='REFUSE'?motif:null}).eq('id',p.id)
  if(error){setBusy(false);setNotice(error.message);return}
  setBusy(false)
  setNotice('Décision enregistrée. Le superviseur sera notifié automatiquement.')
  await load()
 }

 if(loading)return <div className="py-10 text-center text-sm text-ink-400">Chargement du planning hebdomadaire…</div>
 if(isAdmin)return <div className="space-y-5"><div><h1 className="text-xl font-bold text-ink-800">Plannings hebdomadaires des superviseurs</h1><p className="text-sm text-ink-400">Programmes soumis pour contrôle et validation.</p></div>{notice&&<p className="rounded-xl bg-ink-50 p-3 text-sm">{notice}</p>}{adminRows.length===0?<Card className="py-8 text-center text-sm text-ink-400">Aucun planning superviseur soumis.</Card>:adminRows.map(p=><Card key={p.id} className="space-y-3"><div className="flex items-center justify-between gap-2"><div><p className="font-bold">{p.profiles?.full_name??'Superviseur'}</p><p className="text-xs text-ink-400">Semaine du {new Date(p.semaine_debut+'T12:00:00').toLocaleDateString('fr-FR')}</p></div><Badge tone={p.statut==='VALIDE'?'success':p.statut==='SOUMIS'?'info':'warning'}>{statusLabel(p.statut)}</Badge></div>{JOURS.map(d=>{const rows=(p.lignes??[]).filter(l=>l.jour===d);return <div key={d} className="border-t border-ink-100 pt-2"><p className="text-xs font-bold">{LABELS[d]} · {rows.length} visite(s)</p><div className="text-xs text-ink-500">{rows.map(l=>l.clients?.nom??'Client').join(' · ')||'Aucune visite'}</div></div>})}{p.statut==='SOUMIS'&&<div className="flex gap-2"><Button size="sm" onClick={()=>void decision(p,'VALIDE')} loading={busy}>Valider</Button><div className="flex-1"><textarea value={motifRejet[p.id]??''} onChange={e=>setMotifRejet(v=>({...v,[p.id]:e.target.value}))} placeholder="Motif obligatoire du rejet…" rows={2} className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm"/><Button size="sm" variant="danger" onClick={()=>void decision(p,'REFUSE')} loading={busy} disabled={!motifRejet[p.id]?.trim()}>Renvoyer avec motif</Button></div></div>}</Card>)}</div>
 return <div className="space-y-5 pb-8"><div><p className="text-[11px] font-bold uppercase tracking-wider text-royal-600">Espace superviseur</p><h1 className="text-xl font-bold text-ink-800">Planning hebdomadaire de mes visites</h1><p className="text-sm text-ink-400">Semaine du {new Date(semaine+'T12:00:00').toLocaleDateString('fr-FR')} · Préparez vos visites puis soumettez-les à l’administration.</p></div>{notice&&<p role="status" className="rounded-xl bg-ink-50 p-3 text-sm">{notice}</p>}{programme&&<div className="flex items-center justify-between"><Badge tone={programme.statut==='VALIDE'?'success':programme.statut==='SOUMIS'?'info':programme.statut==='REFUSE'?'warning':'neutral'}>{statusLabel(programme.statut)}</Badge><span className="text-xs text-ink-400">{lignes.length} visite(s) planifiée(s)</span></div>}<div className="grid grid-cols-2 gap-3"><Card><p className="text-xs font-semibold text-royal-700">Visites médicales · max 8/jour</p><p className="text-2xl font-extrabold">{med}/8</p></Card><Card><p className="text-xs font-semibold text-emerald-700">Visites pharmacie · max 2/jour</p><p className="text-2xl font-extrabold">{pharma}/2</p></Card></div><div className="flex flex-wrap gap-2">{JOURS.map(d=><button key={d} onClick={()=>setJour(d)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${jour===d?'bg-royal-700 text-white':'bg-ink-100 text-ink-600'}`}>{LABELS[d]}</button>)}</div><Card className="space-y-3"><p className="text-sm font-bold">Ajouter une visite · {LABELS[jour]}</p><div className="grid grid-cols-2 gap-2"><button onClick={()=>{setType('MEDICAL');setClientId('')}} className={`rounded-xl p-2.5 text-sm font-semibold ${type==='MEDICAL'?'bg-royal-700 text-white':'bg-ink-100'}`}>Médicale</button><button onClick={()=>{setType('PHARMACIE');setClientId('')}} className={`rounded-xl p-2.5 text-sm font-semibold ${type==='PHARMACIE'?'bg-royal-700 text-white':'bg-ink-100'}`}>Pharmacie</button></div><div className="rounded-2xl border border-ink-100 bg-white shadow-sm overflow-hidden"><div className="relative"><input value={search} onChange={e=>{setSearch(e.target.value);setClientId('');setShowMore(false)}} placeholder="Tapez au moins 2 caractères (nom, centre, spécialité)…" className="w-full border-0 bg-ink-50 px-4 py-3 text-sm outline-none focus:bg-white"/><span className="absolute right-3 top-3 text-xs text-ink-400">{search.trim().length>=2?filtered.length+' résultat(s)':'Recherche'}</span></div><div className="max-h-64 overflow-y-auto divide-y divide-ink-100">{search.trim().length<2?<p className="p-4 text-center text-xs text-ink-400">Commencez à saisir pour afficher les clients. La liste complète n’est pas affichée.</p>:filtered.length===0?<p className="p-4 text-center text-xs text-ink-400">Aucun résultat. Les clients déjà programmés ne sont pas proposés.</p>:resultatsVisibles.map(c=><button type="button" key={c.id} onClick={()=>setClientId(c.id)} className={`w-full text-left p-3 transition ${clientId===c.id?'bg-royal-50 ring-1 ring-inset ring-royal-200':'hover:bg-ink-50'}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-ink-800">{c.nom}</span>{clientId===c.id&&<span className="text-xs font-bold text-royal-700">Sélectionné</span>}</div><p className="mt-0.5 text-xs text-ink-400">{c.centre||'Centre non renseigné'} · {c.specialite||'Spécialité non renseignée'}</p></button>)}</div>{filtered.length>8&&search.trim().length>=2&&<button type="button" onClick={()=>setShowMore(v=>!v)} className="w-full border-t px-3 py-2 text-xs font-semibold text-royal-700">{showMore?'Afficher moins':'Afficher plus de résultats'}</button>}</div><Button onClick={()=>void ajouter()} disabled={!isEditable||!clientId||busy||(type==='MEDICAL'&&med>=8)||(type==='PHARMACIE'&&pharma>=2)} loading={busy}>Ajouter au planning</Button></Card><Card className="space-y-2"><p className="text-sm font-bold">{LABELS[jour]} · {jourLignes.length} visite(s)</p>{jourLignes.length===0?<p className="text-xs text-ink-400">Aucune visite planifiée pour cette journée.</p>:jourLignes.map(l=><div key={l.id} className="flex items-center justify-between gap-3 border-t border-ink-100 py-2"><div><p className="text-sm font-semibold">{l.clients?.nom??'Client'}</p><p className="text-xs text-ink-400">{l.type_visite==='PHARMACIE'?'Pharmacie':'Médicale'} · {l.clients?.centre??'Centre non renseigné'}</p></div>{isEditable&&<button onClick={()=>void retirer(l.id)} disabled={busy} className="text-xs font-semibold text-red-600">Retirer</button>}</div>)}</Card>{isEditable&&<Button fullWidth onClick={()=>void soumettre()} loading={busy} disabled={!lignes.length||deadlineExpired}>Soumettre mon planning hebdomadaire</Button>}</div>
}
