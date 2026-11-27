import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { IconMapPin, IconCalendar, IconCheckCircle, IconClock, IconPlus } from '@/components/ui/icons'

type Tournee = {
  id: string; demandeur_id: string; zone: string; date_debut: string; date_fin: string
  avec_portefeuille: boolean; statut: string; motif_refus: string | null; created_at: string
}
type Jour = { id: string; tournee_id: string; jour: string; statut: string; demarree_at?: string | null; terminee_at?: string | null; latitude_depart?: number | null; longitude_depart?: number | null }
type Rapport = { id: string; tournee_jour_id: string; resume: string; observations: string | null; soumis_at: string | null }
type Rencontre = { id: string; rapport_id: string; nom: string; centre: string | null; specialite: string | null; potentiel: string | null; telephone: string | null; notes: string | null; nouveau_prescripteur: boolean }
type Planification = { id:string; tournee_jour_id:string; client_id:string; clients?:{nom:string}[]|null }
type Client = { id: string; nom: string; centre: string | null; specialite: string; potentiel: string }
type Decouverte = { id:string; nom:string; centre:string|null; specialite:string; potentiel:string; secteur:string; contacts:string|null; notes:string|null; created_at:string }
const SPECIALITES = ['GENERALISTE','GYNECOLOGUE','PEDIATRE','CARDIOLOGUE','RHUMATOLOGUE','ORL','AUTRE_SPECIALITE','MATERNITE','DISPENSAIRE','PHARMACIE','IDE','ANESTHESISTE','CHIRURGIEN','CHIRURGIEN_PEDIATRIQUE','DERMATOLOGUE','DIABETOLOGUE','ENDOCRINOLOGUE','GASTROENTEROLOGUE','SAGE_FEMME','NEPHROLOGUE','NEUROLOGUE','NEUROCHIRURGIEN','NUTRITIONNISTE','ONCOLOGUE','PNEUMOLOGUE','REANIMATEUR','TRAUMATOLOGUE','URGENTISTE','UROLOGUE','INTERNISTE','PSYCHOLOGUE','DREPANOCYTOSE','CUMAS','CUGO','URGENCE','REANIMATION_ANESTHESIE','CHIRURGIE_GENERALE']
const POTENTIELS = ['GROS','MOYEN','FAIBLE']
const SECTEURS = ['A','B','MONO','COUFFO','KETOU-POBE','SAKETE']
const labelStatut: Record<string,string> = { EN_ATTENTE:'En attente de validation', APPROUVEE:'Approuvée', REFUSEE:'Refusée', EN_COURS:'En cours', TERMINEE:'Terminée' }
const fmt = (d:string) => new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})
function datesEntre(a:string,b:string) { const out:string[]=[]; const d=new Date(a+'T00:00:00Z'); const end=new Date(b+'T00:00:00Z'); while(d<=end && out.length<366){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1)} return out }
function todayLocal(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return v.year+'-'+v.month+'-'+v.day}

export default function Tournees(){
 const {profile}=useAuth()
 const location=useLocation()
 const navigate=useNavigate()
 const base=location.pathname.startsWith('/app/')?'/app/tournees':'/admin/tournees'
 const segments=location.pathname.replace(base,'').split('/').filter(Boolean)
 const view=segments[0]==='nouvelle'?'create':segments.length>=3?'day':segments.length===1?'detail':'list'
 const selectedTourId=view==='detail'?segments[0]:view==='day'?segments[0]:''
 const selectedDayId=view==='day'?segments[2]:''
 const [tours,setTours]=useState<Tournee[]>([])
 const [jours,setJours]=useState<Jour[]>([])
 const [rapports,setRapports]=useState<Rapport[]>([])
 const [rencontres,setRencontres]=useState<Rencontre[]>([])
 const [planifications,setPlanifications]=useState<Planification[]>([])
 const [clientAPlanifier,setClientAPlanifier]=useState<Record<string,string>>({})
 const [noms,setNoms]=useState<Record<string,string>>({})
 const [clients,setClients]=useState<Client[]>([])
 const [decouvertes,setDecouvertes]=useState<Decouverte[]>([])
 const [now,setNow]=useState(Date.now())
 const [hasPortfolio,setHasPortfolio]=useState(false)
 const [rapportOuvert,setRapportOuvert]=useState<Record<string,boolean>>({})
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [zone,setZone]=useState('')
 const [dateDebut,setDateDebut]=useState(todayLocal())
 const [dateFin,setDateFin]=useState(todayLocal())
 const [motifs,setMotifs]=useState<Record<string,string>>({})
 const [expanded,setExpanded]=useState<string|null>(null)
 const [resume,setResume]=useState<Record<string,string>>({})
 const [observations,setObservations]=useState<Record<string,string>>({})
 const [rencontreNom,setRencontreNom]=useState<Record<string,string>>({})
 const [rencontreCentre,setRencontreCentre]=useState<Record<string,string>>({})
 const [rencontreNotes,setRencontreNotes]=useState<Record<string,string>>({})
 const [selectedClient,setSelectedClient]=useState<Record<string,string>>({})
 const [newPrescriber,setNewPrescriber]=useState<Record<string,boolean>>({})
 const [specialite,setSpecialite]=useState<Record<string,string>>({})
 const [potentiel,setPotentiel]=useState<Record<string,string>>({})
 const [secteur,setSecteur]=useState<Record<string,string>>({})
 const [telephone,setTelephone]=useState<Record<string,string>>({})

 const load=useCallback(async()=>{
  if(!profile?.id)return
  setLoading(true);setError('')
  const {data:td,error:te}=await supabase.from('tournees').select('*').order('created_at',{ascending:false})
  if(te){setError(te.message);setLoading(false);return}
  const list=(td??[]) as Tournee[];setTours(list)
  if(profile.role==='admin'){const {data:dd,error:de}=await supabase.from('tournee_decouvertes').select('*').eq('statut','EN_ATTENTE').order('created_at',{ascending:false});if(de)setError(de.message);setDecouvertes((dd??[]) as Decouverte[])}else setDecouvertes([])
  if(profile.role==='vm'){
   const [{data:pf},{count}] = await Promise.all([
    supabase.from('portefeuille').select('client_id,clients(id,nom,centre,specialite,potentiel)').eq('vm_id',profile.id),
    supabase.from('portefeuille').select('id',{count:'exact',head:true}).eq('vm_id',profile.id)
   ])
   setClients((pf??[]).map((x:any)=>x.clients).filter(Boolean) as Client[])
   setHasPortfolio((count??0)>0)
  }
  const ids=list.map(x=>x.id)
  if(!ids.length){setJours([]);setRapports([]);setRencontres([]);setPlanifications([]);setNoms({});setLoading(false);return}
  const {data:jd,error:je}=await supabase.from('tournee_jours').select('*').in('tournee_id',ids).order('jour',{ascending:true})
  if(je)setError(je.message)
  const dayList=(jd??[]) as Jour[];setJours(dayList)
  const dayIds=dayList.map(x=>x.id)
  if(dayIds.length){const {data:pl,error:ple}=await supabase.from('tournee_programmations').select('id,tournee_jour_id,client_id,clients(nom)').in('tournee_jour_id',dayIds);if(ple)setError(ple.message);setPlanifications((pl??[]) as Planification[])}else setPlanifications([])
  let reportList:Rapport[]=[]
  if(dayIds.length){const {data:rd,error:re}=await supabase.from('tournee_rapports').select('*').in('tournee_jour_id',dayIds);if(re)setError(re.message);reportList=(rd??[]) as Rapport[]}
  setRapports(reportList)
  const reportIds=reportList.map(x=>x.id)
  if(reportIds.length){const {data:ed,error:ee}=await supabase.from('tournee_rencontres').select('*').in('rapport_id',reportIds).order('created_at');if(ee)setError(ee.message);setRencontres((ed??[]) as Rencontre[])}else setRencontres([])
  const userIds=[...new Set(list.map(x=>x.demandeur_id))]
  if(userIds.length){const {data:pd}=await supabase.from('profiles').select('id,full_name').in('id',userIds);setNoms(Object.fromEntries((pd??[]).map((p:any)=>[p.id,p.full_name])))}
  setLoading(false)
 },[profile?.id,profile?.role])
 useEffect(()=>{void load()},[load])
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[])

 const isAdmin=profile?.role==='admin'
 const isVm=profile?.role==='vm'
 const isSupervisor=profile?.role==='superviseur'
 const today=todayLocal()
 const daysByTour=useMemo(()=>{const m:Record<string,Jour[]>={};jours.forEach(j=>(m[j.tournee_id]??=[]).push(j));return m},[jours])
 const reportsByDay=useMemo(()=>Object.fromEntries(rapports.map(r=>[r.tournee_jour_id,r])),[rapports])
 const encountersByReport=useMemo(()=>{const m:Record<string,Rencontre[]>={};rencontres.forEach(r=>(m[r.rapport_id]??=[]).push(r));return m},[rencontres])
 const plansByDay=useMemo(()=>{const m:Record<string,Planification[]>={};planifications.forEach(p=>(m[p.tournee_jour_id]??=[]).push(p));return m},[planifications])

 async function action(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e:any){setError(e?.message??'Une erreur est survenue.')}finally{setBusy(false)}}
 async function demander(){let ok=false;await action(async()=>{const {error:e}=await supabase.rpc('demander_tournee',{p_zone:zone,p_date_debut:dateDebut,p_date_fin:dateFin});if(e)throw e;ok=true;setZone('');setNotice('Votre demande de tournée a été envoyée à l’administration.');await load()});return ok}
 async function decider(id:string,ok:boolean){await action(async()=>{const {error:e}=await supabase.rpc('decider_tournee',{p_tournee_id:id,p_approuver:ok,p_motif:motifs[id]??null});if(e)throw e;setNotice(ok?'Tournée approuvée.':'Demande refusée.');await load()})}
 async function ajouterAuProgramme(jourId:string){await action(async()=>{const clientId=clientAPlanifier[jourId];if(!clientId)throw new Error('Choisissez un client du portefeuille.');const {error:e}=await supabase.from('tournee_programmations').insert({tournee_jour_id:jourId,client_id:clientId});if(e)throw e;setClientAPlanifier(v=>({...v,[jourId]:''}));setNotice('Visite ajoutée au programme de la journée.');await load()})}
 async function retirerDuProgramme(id:string){await action(async()=>{const {error:e}=await supabase.from('tournee_programmations').delete().eq('id',id);if(e)throw e;await load()})}
 async function positionGPS(){if(!navigator.geolocation)throw new Error('La géolocalisation n’est pas disponible sur cet appareil.');return await new Promise<{latitude:number;longitude:number}>((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>reject(new Error('Autorisez la localisation GPS pour démarrer la tournée.')),{enableHighAccuracy:true,timeout:20000,maximumAge:0}))}
 async function demarrer(t:Tournee,j:string){await action(async()=>{const pos=await positionGPS();const {data:id,error:e}=await supabase.rpc('demarrer_journee_tournee',{p_tournee_id:t.id,p_jour:j});if(e)throw e;const jourId=typeof id==='string'?id:jours.find(x=>x.tournee_id===t.id&&x.jour===j)?.id;if(jourId){const {error:ge}=await supabase.rpc('enregistrer_depart_tournee_gps',{p_jour_id:jourId,p_latitude:pos.latitude,p_longitude:pos.longitude});if(ge)throw ge}setNotice('Tournée démarrée. Position GPS enregistrée.');await load()})}
 async function saveReport(r:Rapport){await action(async()=>{const {error:e}=await supabase.from('tournee_rapports').update({resume:resume[r.id]??r.resume,observations:observations[r.id]??r.observations}).eq('id',r.id);if(e)throw e;setNotice('Rapport enregistré.');await load()})}
 async function addEncounter(r:Rapport,t:Tournee){await action(async()=>{
  if(newPrescriber[r.id]){
   const {error:e}=await supabase.rpc('ajouter_nouveau_prescripteur_tournee',{p_rapport_id:r.id,p_nom:rencontreNom[r.id]??'',p_centre:rencontreCentre[r.id]??'',p_specialite:specialite[r.id]??null,p_potentiel:potentiel[r.id]??null,p_secteur:profile.secteur??secteur[r.id]??null,p_contacts:telephone[r.id]??'',p_notes:rencontreNotes[r.id]??''});if(e)throw e
  }else{
   let c:Client|undefined
   if(t.avec_portefeuille){c=clients.find(x=>x.id===selectedClient[r.id]);if(!c)throw new Error('Sélectionnez un client du portefeuille.')}
   const name=c?.nom??(rencontreNom[r.id]??'').trim()
   if(!name)throw new Error('Indiquez le nom de la personne rencontrée.')
   const {error:e}=await supabase.from('tournee_rencontres').insert({rapport_id:r.id,client_id:c?.id??null,nom:name,centre:c?.centre??(rencontreCentre[r.id]??null),specialite:c?.specialite??null,potentiel:c?.potentiel??null,telephone:telephone[r.id]??null,notes:rencontreNotes[r.id]??null,nouveau_prescripteur:false})
   if(e)throw e
  }
  setRencontreNom(v=>({...v,[r.id]:''}));setRencontreCentre(v=>({...v,[r.id]:''}));setRencontreNotes(v=>({...v,[r.id]:''}));setTelephone(v=>({...v,[r.id]:''}));setNotice('Personne ajoutée au rapport.');await load()
 })}
 async function marquerEffectuee(j:Jour){await action(async()=>{let pos:{latitude:number;longitude:number}|null=null;try{pos=await positionGPS()}catch{};if(pos){const {error:ge}=await supabase.rpc('enregistrer_cloture_tournee_gps',{p_jour_id:j.id,p_latitude:pos.latitude,p_longitude:pos.longitude});if(ge)throw ge}const {error:e}=await supabase.rpc('marquer_tournee_effectuee',{p_jour_id:j.id});if(e)throw e;setNotice('Tournée clôturée. Complétez maintenant le rapport avant sa soumission.');await load()})}
 async function validerDecouverte(id:string){await action(async()=>{const {error:e}=await supabase.rpc('valider_decouverte_tournee',{p_decouverte_id:id});if(e)throw e;setNotice('Nouveau client ajouté au portefeuille du visiteur.');await load()})}
 async function submitReport(j:Jour,r:Rapport){await action(async()=>{const {error:saveError}=await supabase.from('tournee_rapports').update({resume:resume[r.id]??r.resume,observations:observations[r.id]??r.observations}).eq('id',r.id);if(saveError)throw saveError;const {error:e}=await supabase.rpc('soumettre_rapport_tournee',{p_jour_id:j.id});if(e)throw e;setNotice('Rapport soumis. Journée clôturée.');await load()})}

 if(!profile)return null
 const selectedTour=tours.find(t=>t.id===selectedTourId)
 const selectedJour=jours.find(j=>j.id===selectedDayId)
 const selectedReport=selectedJour?reportsByDay[selectedJour.id]:undefined
 const selectedPlans=selectedJour?(plansByDay[selectedJour.id]??[]):[]
 const selectedMeetings=selectedReport?(encountersByReport[selectedReport.id]??[]):[]
 const ownTour=!!selectedTour&&selectedTour.demandeur_id===profile.id
 const goBack=()=>navigate(view==='create'||view==='detail'?base:view==='day'?base+'/'+selectedTourId:base)
 const title=(text:string)=><div className="flex items-center gap-3"><button type="button" onClick={goBack} aria-label="Retour" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-ink-100 bg-white text-ink-700 shadow-sm"><span className="text-2xl leading-none">‹</span></button><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-royal-600">Terrain & activité</p><h1 className="truncate text-xl font-extrabold text-ink-800">{text}</h1></div></div>
 const status=(value:string)=><span className={'inline-flex rounded-full px-3 py-1.5 text-xs font-bold '+(value==='APPROUVEE'||value==='TERMINEE'?'bg-emerald-50 text-emerald-700':value==='REFUSEE'?'bg-red-50 text-red-700':value==='EN_ATTENTE'?'bg-amber-50 text-amber-700':'bg-royal-50 text-royal-700')}>{labelStatut[value]??(value==='A_DEMARRER'?'À démarrer':value==='EFFECTUEE'?'Rapport à compléter':value==='EN_COURS'?'En cours':value)}</span>
 return <div className="relative min-w-0 space-y-5 pb-24">
  {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
  {notice&&<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
  {view==='list'&&<>
   <div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-royal-50 text-royal-700"><IconMapPin className="h-6 w-6"/></div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-royal-600">Terrain & activité</p><h1 className="text-2xl font-extrabold text-ink-800 font-display">Tournées</h1><p className="mt-1 text-sm text-ink-500">{isAdmin?'Demandes à valider et tournées réalisées.':isSupervisor?'Suivi des tournées de vos équipes.':'Retrouvez vos demandes et vos tournées.'}</p></div></div>
   <div className="flex items-center justify-between"><h2 className="font-bold text-ink-800">{isAdmin?'Demandes et tournées':isSupervisor?'Tournées des équipes':'Mes tournées'}</h2><span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-bold text-ink-600">{tours.length}</span></div>
   {isAdmin&&decouvertes.length>0&&<Card className="space-y-3"><div><h2 className="font-bold text-ink-800">Nouveaux clients découverts</h2><p className="text-sm text-ink-500">{decouvertes.length} découverte(s) en attente de validation</p></div>{decouvertes.map(d=><div key={d.id} className="space-y-2 rounded-xl border border-ink-100 p-3"><div><p className="font-semibold text-ink-800">{d.nom}</p><p className="text-xs text-ink-500">{[d.centre,d.specialite?.replaceAll('_',' '),d.potentiel,d.secteur].filter(Boolean).join(' · ')}</p>{d.contacts&&<p className="text-xs text-ink-500">{d.contacts}</p>}{d.notes&&<p className="text-sm text-ink-600">{d.notes}</p>}</div><Button fullWidth onClick={()=>validerDecouverte(d.id)} loading={busy}>Ajouter au portefeuille</Button></div>)}</Card>}
   {loading?<Card><p className="text-sm text-ink-500">Chargement des tournées…</p></Card>:tours.length===0?<Card className="py-12 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-royal-50 text-royal-700"><IconMapPin className="h-7 w-7"/></div><p className="mt-4 font-bold text-ink-800">Aucune tournée programmée</p><p className="mt-1 text-sm text-ink-500">{isVm?'Vous n’avez pas encore créé de tournée.':'Aucune tournée ne vous est actuellement attribuée.'}</p></Card>:<div className="space-y-3">{tours.map(t=><Card key={t.id} className="space-y-3">
    <button type="button" onClick={()=>navigate(base+'/'+t.id)} className="block w-full min-w-0 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-bold text-ink-800">{t.zone}</p><p className="mt-1 text-sm text-ink-500">{fmt(t.date_debut)} – {fmt(t.date_fin)}</p>{!isVm&&<p className="mt-1 text-xs font-semibold text-ink-600">{noms[t.demandeur_id]??'Collaborateur'}</p>}</div>{status(t.statut)}</div><p className="mt-2 text-xs text-ink-400">Demande du {new Date(t.created_at).toLocaleDateString('fr-FR')}</p></button>
    {t.statut==='REFUSEE'&&t.motif_refus&&<p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">Motif : {t.motif_refus}</p>}
    {isAdmin&&t.statut==='EN_ATTENTE'&&<div className="space-y-2 border-t border-ink-100 pt-3"><label className="block text-sm font-semibold text-ink-600">Motif en cas de refus (facultatif)</label><input value={motifs[t.id]??''} onChange={e=>setMotifs(v=>({...v,[t.id]:e.target.value}))} placeholder="Précision pour le demandeur" className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"/><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={()=>decider(t.id,false)} loading={busy}>Refuser</Button><Button onClick={()=>decider(t.id,true)} loading={busy}>Approuver</Button></div></div>}
   </Card>)}</div>}
   {isVm&&<button type="button" onClick={()=>navigate(base+'/nouvelle')} aria-label="Ajouter une tournée" className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-royal-700 text-3xl text-white shadow-xl ring-4 ring-white/80 active:scale-95">+</button>}
  </>}
  {view==='create'&&isVm&&<>
   {title('Nouvelle tournée')}
   <Card className="space-y-5"><p className="text-sm text-ink-500">Renseignez la zone et la période souhaitée. Votre identité est automatiquement associée à la demande.</p>
    <div><label className="mb-2 block text-sm font-semibold text-ink-700">Zone / localité</label><input value={zone} onChange={e=>setZone(e.target.value)} placeholder="Ex. : Porto-Novo, Adjarra…" className="w-full min-w-0 rounded-xl border border-ink-200 px-4 py-3.5 text-base"/></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold text-ink-700">Date de début</label><input type="date" min={today} value={dateDebut} onChange={e=>{setDateDebut(e.target.value);if(dateFin<e.target.value)setDateFin(e.target.value)}} className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3.5 text-base"/></div><div><label className="mb-2 block text-sm font-semibold text-ink-700">Date de fin</label><input type="date" min={dateDebut} value={dateFin} onChange={e=>setDateFin(e.target.value)} className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3.5 text-base"/></div></div>
    <div className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">{hasPortfolio?'Votre portefeuille sera disponible pour programmer les visites et enregistrer les nouveaux clients découverts.':'Les personnes rencontrées pourront être consignées dans le rapport de tournée.'}</div>
    <Button fullWidth onClick={async()=>{if(await demander())navigate(base)}} loading={busy} disabled={!zone.trim()||!dateDebut||!dateFin||dateFin<dateDebut}><IconPlus className="h-4 w-4"/> Envoyer la demande</Button>
   </Card>
  </>}
  {view==='detail'&&<>
   {title(selectedTour?('Tournée · '+selectedTour.zone):'Détails de la tournée')}
   {!selectedTour?<Card><p className="text-sm text-ink-500">Cette tournée est introuvable ou n’est plus accessible.</p></Card>:<><Card className="space-y-3"><div className="flex items-center justify-between gap-2"><p className="font-bold text-ink-800">{selectedTour.zone}</p>{status(selectedTour.statut)}</div><p className="text-sm text-ink-500">{fmt(selectedTour.date_debut)} au {fmt(selectedTour.date_fin)}</p><p className="text-xs text-ink-400">{selectedTour.avec_portefeuille?'Avec portefeuille':'Sans portefeuille'}</p>{isAdmin&&selectedTour.statut==='EN_ATTENTE'&&<div className="space-y-2"><input value={motifs[selectedTour.id]??''} onChange={e=>setMotifs(v=>({...v,[selectedTour.id]:e.target.value}))} placeholder="Motif de refus (facultatif)" className="w-full rounded-xl border border-ink-200 px-3 py-3 text-sm"/><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={()=>decider(selectedTour.id,false)} loading={busy}>Refuser</Button><Button onClick={()=>decider(selectedTour.id,true)} loading={busy}>Approuver</Button></div></div>}</Card>
    <div className="space-y-3"><h2 className="font-bold text-ink-800">Jours de la tournée</h2>{datesEntre(selectedTour.date_debut,selectedTour.date_fin).map(day=>{const j=(daysByTour[selectedTour.id]??[]).find(x=>x.jour===day);return <button key={day} type="button" disabled={!j||selectedTour.statut==='EN_ATTENTE'||selectedTour.statut==='REFUSEE'} onClick={()=>j&&navigate(base+'/'+selectedTour.id+'/jour/'+j.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white p-4 text-left shadow-sm disabled:opacity-50"><div><p className="font-semibold text-ink-800">{fmt(day)}</p><p className="mt-1 text-xs text-ink-500">{j?.statut==='TERMINEE'?'Rapport soumis':j?.statut==='EFFECTUEE'?'Clôture à finaliser':j?.statut==='EN_COURS'?'Journée en cours':'À programmer'}</p></div><div className="flex items-center gap-2">{j&&status(j.statut)}<span className="text-xl text-ink-400">›</span></div></button>})}</div></>}
  </>}
  {view==='day'&&<>
   {title(selectedTour?('Tournée · '+fmt(selectedTour.date_debut)+' au '+fmt(selectedTour.date_fin)):'Journée de tournée')}
   {!selectedTour||!selectedJour?<Card><p className="text-sm text-ink-500">Cette journée est introuvable.</p></Card>:<>
    <Card className="space-y-2"><p className="text-lg font-bold text-ink-800">{fmt(selectedJour.jour)}</p><div className="flex items-center justify-between">{status(selectedJour.statut)}<span className="text-xs text-ink-500">{selectedTour.zone}</span></div></Card>
    {selectedTour.avec_portefeuille&&<Card className="space-y-4"><div><h2 className="font-bold text-ink-800">Visites programmées</h2><p className="text-sm text-ink-500">{selectedPlans.length} client(s) prévu(s)</p></div>{selectedPlans.length===0?<p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-500">Aucun client programmé pour cette journée.</p>:selectedPlans.map(p=><div key={p.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-royal-50/60 p-3"><span className="min-w-0 break-words text-sm font-medium text-ink-700">{p.clients?.[0]?.nom??clients.find(x=>x.id===p.client_id)?.nom??'Client du portefeuille'}</span>{ownTour&&selectedJour.statut==='A_DEMARRER'&&<button type="button" onClick={()=>retirerDuProgramme(p.id)} className="shrink-0 text-xs font-semibold text-red-600">Retirer</button>}</div>)}{ownTour&&selectedJour.statut==='A_DEMARRER'&&<div className="flex min-w-0 flex-col gap-2 sm:flex-row"><select value={clientAPlanifier[selectedJour.id]??''} onChange={e=>setClientAPlanifier(v=>({...v,[selectedJour.id]:e.target.value}))} className="w-full min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-3 text-sm"><option value="">Choisir un client du portefeuille</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select><Button onClick={()=>ajouterAuProgramme(selectedJour.id)} loading={busy} disabled={!clientAPlanifier[selectedJour.id]}><IconPlus className="h-4 w-4"/> Ajouter</Button></div>}</Card>}
    {ownTour&&selectedJour.statut==='A_DEMARRER'&&selectedJour.jour===today&&<Card className="space-y-3"><h2 className="font-bold text-ink-800">Prêt à partir ?</h2><p className="text-sm text-ink-500">Le démarrage enregistre l’heure de départ et la position GPS de votre appareil.</p><Button fullWidth onClick={()=>demarrer(selectedTour,selectedJour.jour)} loading={busy}><IconClock className="h-4 w-4"/> Démarrer la tournée</Button></Card>}
    {selectedJour.statut==='EN_COURS'&&<Card className="space-y-3"><h2 className="font-bold text-ink-800">Tournée en cours</h2>{selectedJour.demarree_at&&<p className="text-sm font-semibold tabular-nums text-royal-700">Temps écoulé : {(()=>{const sec=Math.max(0,Math.floor((now-new Date(selectedJour.demarree_at).getTime())/1000));return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(n=>String(n).padStart(2,'0')).join(':')})()}</p>}<p className="text-sm text-ink-500">Les visites programmées pour cette journée sont affichées ci-dessus.</p>{ownTour&&<Button fullWidth onClick={()=>marquerEffectuee(selectedJour)} loading={busy}><IconCheckCircle className="h-4 w-4"/> Clôturer et remplir le rapport</Button>}</Card>}
    {ownTour&&selectedJour.statut==='EN_COURS'&&selectedReport&&!selectedReport.soumis_at&&<Card className="space-y-3"><div><h2 className="font-bold text-ink-800">Ajouter une rencontre</h2><p className="text-sm text-ink-500">Enregistrez un client rencontré ou une nouvelle découverte sans attendre la clôture.</p></div><label className="flex items-center gap-2 text-sm font-semibold text-ink-700"><input type="checkbox" checked={!!newPrescriber[selectedReport.id]} onChange={e=>setNewPrescriber(v=>({...v,[selectedReport.id]:e.target.checked}))}/> Nouveau client découvert sur le terrain</label>{selectedTour.avec_portefeuille&&!newPrescriber[selectedReport.id]?<select value={selectedClient[selectedReport.id]??''} onChange={e=>setSelectedClient(v=>({...v,[selectedReport.id]:e.target.value}))} className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"><option value="">Choisir un client du portefeuille</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select>:<><input value={rencontreNom[selectedReport.id]??''} onChange={e=>setRencontreNom(v=>({...v,[selectedReport.id]:e.target.value}))} placeholder="Nom du client rencontré" className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"/><input value={rencontreCentre[selectedReport.id]??''} onChange={e=>setRencontreCentre(v=>({...v,[selectedReport.id]:e.target.value}))} placeholder="Centre / établissement" className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"/>{newPrescriber[selectedReport.id]&&<div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><select value={specialite[selectedReport.id]??''} onChange={e=>setSpecialite(v=>({...v,[selectedReport.id]:e.target.value}))} className="min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"><option value="">Spécialité</option>{SPECIALITES.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select><select value={potentiel[selectedReport.id]??''} onChange={e=>setPotentiel(v=>({...v,[selectedReport.id]:e.target.value}))} className="min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"><option value="">Potentiel</option>{POTENTIELS.map(x=><option key={x}>{x}</option>)}</select></div>}{newPrescriber[selectedReport.id]&&!profile.secteur&&<select value={secteur[selectedReport.id]??''} onChange={e=>setSecteur(v=>({...v,[selectedReport.id]:e.target.value}))} className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"><option value="">Secteur du nouveau client</option>{SECTEURS.map(x=><option key={x}>{x}</option>)}</select>}<input value={telephone[selectedReport.id]??''} onChange={e=>setTelephone(v=>({...v,[selectedReport.id]:e.target.value}))} placeholder="Téléphone / contact" className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"/></> }<textarea value={rencontreNotes[selectedReport.id]??''} onChange={e=>setRencontreNotes(v=>({...v,[selectedReport.id]:e.target.value}))} rows={2} placeholder="Notes sur la rencontre" className="w-full min-w-0 rounded-xl border border-ink-200 p-3 text-sm"/><Button fullWidth onClick={()=>addEncounter(selectedReport,selectedTour)} loading={busy} disabled={newPrescriber[selectedReport.id]&&(!specialite[selectedReport.id]||!potentiel[selectedReport.id]||(!profile.secteur&&!secteur[selectedReport.id]))}><IconPlus className="h-4 w-4"/> Enregistrer la rencontre</Button></Card>}
    {ownTour&&selectedJour.statut==='EFFECTUEE'&&selectedReport&&!selectedReport.soumis_at&&<Card className="space-y-4"><div><h2 className="font-bold text-ink-800">Rapport de tournée</h2><p className="text-sm text-ink-500">Complétez le bilan avant de soumettre la clôture de cette journée.</p></div>
     <div><label className="mb-2 block text-sm font-semibold text-ink-700">Résumé de la tournée *</label><textarea value={resume[selectedReport.id]??selectedReport.resume} onChange={e=>setResume(v=>({...v,[selectedReport.id]:e.target.value}))} rows={4} className="w-full min-w-0 rounded-xl border border-ink-200 p-3 text-sm" placeholder="Activités réalisées, résultats obtenus…"/></div>
     <div><label className="mb-2 block text-sm font-semibold text-ink-700">Observations</label><textarea value={observations[selectedReport.id]??selectedReport.observations??''} onChange={e=>setObservations(v=>({...v,[selectedReport.id]:e.target.value}))} rows={3} className="w-full min-w-0 rounded-xl border border-ink-200 p-3 text-sm" placeholder="Difficultés, constats et suites à donner…"/></div>
     <div className="space-y-2 border-t border-ink-100 pt-3"><h3 className="font-semibold text-ink-800">Clients rencontrés et découvertes ({selectedMeetings.length})</h3>{selectedMeetings.map(x=><div key={x.id} className="rounded-xl bg-ink-50 p-3"><p className="font-semibold text-ink-800">{x.nom}{x.nouveau_prescripteur?' · Nouveau client découvert':''}</p><p className="mt-1 text-xs text-ink-500">{[x.centre,x.specialite,x.telephone].filter(Boolean).join(' · ')}</p>{x.notes&&<p className="mt-1 text-sm text-ink-600">{x.notes}</p>}</div>)}
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-700"><input type="checkbox" checked={!!newPrescriber[selectedReport.id]} onChange={e=>setNewPrescriber(v=>({...v,[selectedReport.id]:e.target.checked}))}/> Nouveau client découvert sur le terrain</label>
      {selectedTour.avec_portefeuille&&!newPrescriber[selectedReport.id]?<select value={selectedClient[selectedReport.id]??''} onChange={e=>setSelectedClient(v=>({...v,[selectedReport.id]:e.target.value}))} className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"><option value="">Choisir un client du portefeuille</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select>:<div className="space-y-2"><input value={rencontreNom[selectedReport.id]??''} onChange={e=>setRencontreNom(v=>({...v,[selectedReport.id]:e.target.value}))} placeholder="Nom du nouveau client" className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"/><input value={rencontreCentre[selectedReport.id]??''} onChange={e=>setRencontreCentre(v=>({...v,[selectedReport.id]:e.target.value}))} placeholder="Centre / établissement" className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"/>{selectedTour.avec_portefeuille&&newPrescriber[selectedReport.id]&&<div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><select value={specialite[selectedReport.id]??''} onChange={e=>setSpecialite(v=>({...v,[selectedReport.id]:e.target.value}))} className="min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"><option value="">Spécialité</option>{SPECIALITES.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><select value={potentiel[selectedReport.id]??''} onChange={e=>setPotentiel(v=>({...v,[selectedReport.id]:e.target.value}))} className="min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"><option value="">Potentiel</option>{POTENTIELS.map(p=><option key={p}>{p}</option>)}</select></div>}<input value={telephone[selectedReport.id]??''} onChange={e=>setTelephone(v=>({...v,[selectedReport.id]:e.target.value}))} placeholder="Téléphone / contact" className="w-full min-w-0 rounded-xl border border-ink-200 px-3 py-3 text-sm"/></div>}
      <textarea value={rencontreNotes[selectedReport.id]??''} onChange={e=>setRencontreNotes(v=>({...v,[selectedReport.id]:e.target.value}))} rows={2} placeholder="Informations complémentaires sur la rencontre" className="w-full min-w-0 rounded-xl border border-ink-200 p-3 text-sm"/><Button fullWidth onClick={()=>addEncounter(selectedReport,selectedTour)} loading={busy} disabled={selectedTour.avec_portefeuille&&newPrescriber[selectedReport.id]&&(!specialite[selectedReport.id]||!potentiel[selectedReport.id]||!profile.secteur)}><IconPlus className="h-4 w-4"/> Ajouter cette rencontre</Button>
     </div><Button fullWidth onClick={()=>submitReport(selectedJour,selectedReport)} loading={busy} disabled={!((resume[selectedReport.id]??selectedReport.resume).trim())}><IconCheckCircle className="h-4 w-4"/> Soumettre le rapport et clôturer</Button>
    </Card>}
    {selectedJour.statut==='TERMINEE'&&selectedReport&&<Card className="space-y-2"><p className="font-bold text-emerald-700">Rapport soumis · Journée clôturée</p><p className="whitespace-pre-wrap text-sm text-ink-700">{selectedReport.resume}</p>{selectedReport.observations&&<p className="whitespace-pre-wrap text-sm text-ink-500">{selectedReport.observations}</p>}{selectedMeetings.map(x=><p key={x.id} className="text-sm text-ink-600">• {x.nom}</p>)}</Card>}
    {isAdmin&&selectedJour.statut==='EN_COURS'&&<Card><p className="font-semibold text-ink-800">Journée en cours</p><p className="text-sm text-ink-500">Le visiteur n’a pas encore soumis le rapport de clôture.</p></Card>}
   </>}
  </>}
  {view==='create'&&!isVm&&<Card><p className="text-sm text-ink-500">La création de tournée est réservée aux visiteurs médicaux.</p></Card>}
 </div>
}
