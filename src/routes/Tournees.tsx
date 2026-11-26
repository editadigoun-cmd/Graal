import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { IconMapPin, IconCalendar, IconCheckCircle, IconClock, IconPlus } from '@/components/ui/icons'

type Tournee = {
  id: string; demandeur_id: string; zone: string; date_debut: string; date_fin: string
  avec_portefeuille: boolean; statut: string; motif_refus: string | null; created_at: string
}
type Jour = { id: string; tournee_id: string; jour: string; statut: string }
type Rapport = { id: string; tournee_jour_id: string; resume: string; observations: string | null; soumis_at: string | null }
type Rencontre = { id: string; rapport_id: string; nom: string; centre: string | null; specialite: string | null; potentiel: string | null; telephone: string | null; notes: string | null; nouveau_prescripteur: boolean }
type Planification = { id:string; tournee_jour_id:string; client_id:string; clients?:{nom:string}|null }
type Client = { id: string; nom: string; centre: string | null; specialite: string; potentiel: string }
const SPECIALITES = ['GENERALISTE','GYNECOLOGUE','PEDIATRE','CARDIOLOGUE','RHUMATOLOGUE','ORL','AUTRE_SPECIALITE','MATERNITE','DISPENSAIRE','PHARMACIE','IDE','ANESTHESISTE','CHIRURGIEN','CHIRURGIEN_PEDIATRIQUE','DERMATOLOGUE','DIABETOLOGUE','ENDOCRINOLOGUE','GASTROENTEROLOGUE','SAGE_FEMME','NEPHROLOGUE','NEUROLOGUE','NEUROCHIRURGIEN','NUTRITIONNISTE','ONCOLOGUE','PNEUMOLOGUE','REANIMATEUR','TRAUMATOLOGUE','URGENTISTE','UROLOGUE','INTERNISTE','PSYCHOLOGUE','DREPANOCYTOSE','CUMAS','CUGO','URGENCE','REANIMATION_ANESTHESIE','CHIRURGIE_GENERALE']
const POTENTIELS = ['GROS','MOYEN','FAIBLE']
const labelStatut: Record<string,string> = { EN_ATTENTE:'En attente de validation', APPROUVEE:'Approuvée', REFUSEE:'Refusée', EN_COURS:'En cours', TERMINEE:'Terminée' }
const fmt = (d:string) => new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})
function datesEntre(a:string,b:string) { const out:string[]=[]; const d=new Date(a+'T00:00:00Z'); const end=new Date(b+'T00:00:00Z'); while(d<=end && out.length<366){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1)} return out }
function todayLocal(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return v.year+'-'+v.month+'-'+v.day}

export default function Tournees(){
 const {profile}=useAuth()
 const [tours,setTours]=useState<Tournee[]>([])
 const [jours,setJours]=useState<Jour[]>([])
 const [rapports,setRapports]=useState<Rapport[]>([])
 const [rencontres,setRencontres]=useState<Rencontre[]>([])
 const [planifications,setPlanifications]=useState<Planification[]>([])
 const [clientAPlanifier,setClientAPlanifier]=useState<Record<string,string>>({})
 const [noms,setNoms]=useState<Record<string,string>>({})
 const [clients,setClients]=useState<Client[]>([])
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
 const [telephone,setTelephone]=useState<Record<string,string>>({})

 const load=useCallback(async()=>{
  if(!profile?.id)return
  setLoading(true);setError('')
  const {data:td,error:te}=await supabase.from('tournees').select('*').order('created_at',{ascending:false})
  if(te){setError(te.message);setLoading(false);return}
  const list=(td??[]) as Tournee[];setTours(list)
  const ids=list.map(x=>x.id)
  if(!ids.length){setJours([]);setRapports([]);setRencontres([]);setNoms({});setLoading(false);return}
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
  if(profile.role==='vm'){
   const [{data:pf},{count}] = await Promise.all([
    supabase.from('portefeuille').select('client_id,clients(id,nom,centre,specialite,potentiel)').eq('vm_id',profile.id),
    supabase.from('portefeuille').select('id',{count:'exact',head:true}).eq('vm_id',profile.id)
   ])
   setClients((pf??[]).map((x:any)=>x.clients).filter(Boolean) as Client[])
   setHasPortfolio((count??0)>0)
  }
  setLoading(false)
 },[profile?.id,profile?.role])
 useEffect(()=>{void load()},[load])

 const isAdmin=profile?.role==='admin'
 const isVm=profile?.role==='vm'
 const isSupervisor=profile?.role==='superviseur'
 const today=todayLocal()
 const daysByTour=useMemo(()=>{const m:Record<string,Jour[]>={};jours.forEach(j=>(m[j.tournee_id]??=[]).push(j));return m},[jours])
 const reportsByDay=useMemo(()=>Object.fromEntries(rapports.map(r=>[r.tournee_jour_id,r])),[rapports])
 const encountersByReport=useMemo(()=>{const m:Record<string,Rencontre[]>={};rencontres.forEach(r=>(m[r.rapport_id]??=[]).push(r));return m},[rencontres])
 const plansByDay=useMemo(()=>{const m:Record<string,Planification[]>={};planifications.forEach(p=>(m[p.tournee_jour_id]??=[]).push(p));return m},[planifications])

 async function action(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e:any){setError(e?.message??'Une erreur est survenue.')}finally{setBusy(false)}}
 async function demander(){await action(async()=>{const {error:e}=await supabase.rpc('demander_tournee',{p_zone:zone,p_date_debut:dateDebut,p_date_fin:dateFin});if(e)throw e;setZone('');setNotice('Votre demande de tournée a été envoyée à l’administration.');await load()})}
 async function decider(id:string,ok:boolean){await action(async()=>{const {error:e}=await supabase.rpc('decider_tournee',{p_tournee_id:id,p_approuver:ok,p_motif:motifs[id]??null});if(e)throw e;setNotice(ok?'Tournée approuvée.':'Demande refusée.');await load()})}
 async function ajouterAuProgramme(jourId:string){await action(async()=>{const clientId=clientAPlanifier[jourId];if(!clientId)throw new Error('Choisissez un client du portefeuille.');const {error:e}=await supabase.from('tournee_programmations').insert({tournee_jour_id:jourId,client_id:clientId});if(e)throw e;setClientAPlanifier(v=>({...v,[jourId]:''}));setNotice('Visite ajoutée au programme de la journée.');await load()})}
 async function retirerDuProgramme(id:string){await action(async()=>{const {error:e}=await supabase.from('tournee_programmations').delete().eq('id',id);if(e)throw e;await load()})}
 async function demarrer(t:Tournee,j:string){await action(async()=>{const {error:e}=await supabase.rpc('demarrer_journee_tournee',{p_tournee_id:t.id,p_jour:j});if(e)throw e;setExpanded(t.id);await load()})}
 async function saveReport(r:Rapport){await action(async()=>{const {error:e}=await supabase.from('tournee_rapports').update({resume:resume[r.id]??r.resume,observations:observations[r.id]??r.observations}).eq('id',r.id);if(e)throw e;setNotice('Rapport enregistré.');await load()})}
 async function addEncounter(r:Rapport,t:Tournee){await action(async()=>{
  if(t.avec_portefeuille && newPrescriber[r.id]){
   const {error:e}=await supabase.rpc('ajouter_nouveau_prescripteur_tournee',{p_rapport_id:r.id,p_nom:rencontreNom[r.id]??'',p_centre:rencontreCentre[r.id]??'',p_specialite:specialite[r.id]??null,p_potentiel:potentiel[r.id]??null,p_contacts:telephone[r.id]??'',p_notes:rencontreNotes[r.id]??''});if(e)throw e
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
 async function marquerEffectuee(j:Jour){await action(async()=>{const {error:e}=await supabase.rpc('marquer_tournee_effectuee',{p_jour_id:j.id});if(e)throw e;setNotice('Tournée déclarée effectuée. Vous pouvez maintenant compléter le rapport.');await load()})}
 async function submitReport(j:Jour,r:Rapport){await action(async()=>{const {error:saveError}=await supabase.from('tournee_rapports').update({resume:resume[r.id]??r.resume,observations:observations[r.id]??r.observations}).eq('id',r.id);if(saveError)throw saveError;const {error:e}=await supabase.rpc('soumettre_rapport_tournee',{p_jour_id:j.id});if(e)throw e;setNotice('Rapport soumis. Journée clôturée.');await load()})}

 if(!profile)return null
 return <div className="space-y-5 pb-8">
  <div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-royal-50 text-royal-700"><IconMapPin className="h-6 w-6"/></div><div><p className="text-xs font-bold uppercase tracking-wider text-royal-600">Terrain & activité</p><h1 className="text-2xl font-extrabold text-ink-800 font-display">Tournées</h1><p className="mt-1 text-sm text-ink-500">{isAdmin?'Valider les demandes et consulter les rapports de tournée.':isSupervisor?'Suivre les tournées des VM de vos équipes.':'Demander une autorisation, effectuer la tournée et soumettre le rapport quotidien.'}</p></div></div>
  {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
  {notice&&<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
  {isVm&&<Card className="space-y-3">
   <div><h2 className="font-bold text-ink-800">Nouvelle demande de tournée</h2><p className="mt-1 text-xs text-ink-500">Votre nom et votre rôle sont automatiquement repris de votre compte. La demande doit être approuvée par l’administrateur.</p></div>
   <div><label className="mb-1 block text-xs font-semibold text-ink-600">Zone / localité</label><input value={zone} onChange={e=>setZone(e.target.value)} placeholder="Ex. : Porto-Novo, Adjarra…" className="w-full rounded-xl border border-ink-200 px-3 py-3 text-sm"/></div>
   <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-semibold text-ink-600">Date de début</label><input type="date" min={today} value={dateDebut} onChange={e=>{setDateDebut(e.target.value);if(dateFin<e.target.value)setDateFin(e.target.value)}} className="w-full rounded-xl border border-ink-200 px-3 py-3 text-sm"/></div><div><label className="mb-1 block text-xs font-semibold text-ink-600">Date de fin</label><input type="date" min={dateDebut} value={dateFin} onChange={e=>setDateFin(e.target.value)} className="w-full rounded-xl border border-ink-200 px-3 py-3 text-sm"/></div></div>
   <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">{hasPortfolio?'Mode portefeuille : vous pourrez sélectionner vos clients et ajouter les nouveaux prescripteurs découverts.':'Mode sans portefeuille : les personnes rencontrées seront consignées dans le rapport, sans ajout automatique au portefeuille.'}</div>
   <Button fullWidth onClick={demander} loading={busy} disabled={!zone.trim()||!dateDebut||!dateFin||dateFin<dateDebut}><IconPlus className="h-4 w-4"/> Envoyer la demande</Button>
  </Card>}
  <div className="space-y-3">
   <div className="flex items-center justify-between"><h2 className="font-bold text-ink-800">{isAdmin?'Demandes et tournées':isSupervisor?'Tournées des équipes':'Mes demandes et tournées'}</h2><span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-600">{tours.length}</span></div>
   {loading?<Card><p className="text-sm text-ink-500">Chargement…</p></Card>:tours.length===0?<Card className="py-8 text-center"><IconCalendar className="mx-auto h-8 w-8 text-ink-300"/><p className="mt-3 text-sm font-semibold text-ink-600">Aucune tournée pour le moment</p></Card>:tours.map(t=>{
    const js=daysByTour[t.id]??[];const expandedNow=expanded===t.id
    return <Card key={t.id} className="space-y-3">
     <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold text-ink-800">{t.zone}</p><p className="mt-1 text-xs text-ink-500">{fmt(t.date_debut)} — {fmt(t.date_fin)}</p>{!isVm&&<p className="mt-1 text-xs font-semibold text-ink-600">{noms[t.demandeur_id]??'Collaborateur'}</p>}</div><span className={'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold '+(t.statut==='APPROUVEE'?'bg-emerald-50 text-emerald-700':t.statut==='REFUSEE'?'bg-red-50 text-red-700':t.statut==='EN_ATTENTE'?'bg-amber-50 text-amber-700':'bg-royal-50 text-royal-700')}>{labelStatut[t.statut]??t.statut}</span></div>
     <div className="text-xs text-ink-500">{t.avec_portefeuille?'Avec portefeuille':'Sans portefeuille'} · Demande du {new Date(t.created_at).toLocaleDateString('fr-FR')}</div>
     {t.statut==='REFUSEE'&&t.motif_refus&&<p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">Motif : {t.motif_refus}</p>}
     {isAdmin&&t.statut==='EN_ATTENTE'&&<div className="space-y-2 border-t border-ink-100 pt-3"><label className="block text-xs font-semibold text-ink-600">Motif en cas de refus (facultatif)</label><input value={motifs[t.id]??''} onChange={e=>setMotifs(v=>({...v,[t.id]:e.target.value}))} placeholder="Précision pour le demandeur" className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"/><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={()=>decider(t.id,false)} loading={busy}>Refuser</Button><Button onClick={()=>decider(t.id,true)} loading={busy}>Approuver</Button></div></div>}
     {(t.statut==='APPROUVEE'||t.statut==='EN_COURS'||t.statut==='TERMINEE')&&<div className="border-t border-ink-100 pt-3"><button onClick={()=>setExpanded(expandedNow?null:t.id)} className="flex w-full items-center justify-between text-sm font-bold text-royal-700"><span>{expandedNow?'Masquer les journées':'Voir les journées et rapports'}</span><IconCalendar className="h-4 w-4"/></button>
      {expandedNow&&<div className="mt-3 space-y-3">{datesEntre(t.date_debut,t.date_fin).map(day=>{
       const j=js.find(x=>x.jour===day);const r=j?reportsByDay[j.id]:undefined;const list=r?(encountersByReport[r.id]??[]):[]
       return <div key={day} className="rounded-xl border border-ink-100 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2"><div><p className="text-sm font-bold text-ink-800">{fmt(day)}</p><p className="text-[11px] text-ink-400">{j?.statut==='TERMINEE'?'Rapport soumis':j?.statut==='EFFECTUEE'?'Tournée effectuée — rapport à remplir':j?.statut==='EN_COURS'?'Journée en cours':'À démarrer'}</p></div>
        {t.avec_portefeuille&&j?.statut==='A_DEMARRER'&&<div className="space-y-2 rounded-lg bg-royal-50/60 p-3">
         <p className="text-xs font-bold text-ink-700">Visites programmées ({(plansByDay[j.id]??[]).length})</p>
         {(plansByDay[j.id]??[]).map(p=><div key={p.id} className="flex items-center justify-between gap-2 text-xs"><span className="text-ink-700">{p.clients?.nom??clients.find(x=>x.id===p.client_id)?.nom??'Client du portefeuille'}</span>{isVm&&t.demandeur_id===profile.id&&<button onClick={()=>retirerDuProgramme(p.id)} className="text-red-600">Retirer</button>}</div>)}
         {isVm&&t.demandeur_id===profile.id&&<div className="flex gap-2"><select value={clientAPlanifier[j.id]??''} onChange={e=>setClientAPlanifier(v=>({...v,[j.id]:e.target.value}))} className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs"><option value="">Choisir un client</option>{clients.map(cl=><option key={cl.id} value={cl.id}>{cl.nom}</option>)}</select><Button size="sm" onClick={()=>ajouterAuProgramme(j.id)} loading={busy} disabled={!clientAPlanifier[j.id]}><IconPlus className="h-4 w-4"/> Ajouter</Button></div>}
        </div>}
        {j?.statut==='A_DEMARRER'&&isVm&&t.demandeur_id===profile.id&&day===today&&<Button size="sm" onClick={()=>demarrer(t,day)} loading={busy}><IconClock className="h-4 w-4"/> Démarrer</Button>}
        {j?.statut==='EN_COURS'&&isVm&&t.demandeur_id===profile.id&&<Button size="sm" variant="secondary" onClick={()=>marquerEffectuee(j)} loading={busy}><IconCheckCircle className="h-4 w-4"/> Tournée effectuée</Button>}
        {j?.statut==='EFFECTUEE'&&isVm&&t.demandeur_id===profile.id&&r&&!r.soumis_at&&<Button size="sm" onClick={()=>setRapportOuvert(v=>({...v,[r.id]:!v[r.id]}))}>{rapportOuvert[r.id]?'Masquer le rapport':'Rapport de tournée'}</Button>}
        </div>
        {j?.statut==='EFFECTUEE'&&r&&!r.soumis_at&&isVm&&t.demandeur_id===profile.id&&rapportOuvert[r.id]&&<div className="space-y-2">
         <label className="block text-xs font-semibold text-ink-600">Résumé de la tournée</label><textarea value={resume[r.id]??r.resume} onChange={e=>setResume(v=>({...v,[r.id]:e.target.value}))} rows={3} className="w-full rounded-xl border border-ink-200 p-3 text-sm" placeholder="Décrivez les activités et résultats de la journée…"/>
         <label className="block text-xs font-semibold text-ink-600">Observations</label><textarea value={observations[r.id]??r.observations??''} onChange={e=>setObservations(v=>({...v,[r.id]:e.target.value}))} rows={2} className="w-full rounded-xl border border-ink-200 p-3 text-sm" placeholder="Difficultés, constats, suites à donner…"/>
         <Button size="sm" variant="secondary" onClick={()=>saveReport(r)} loading={busy}>Enregistrer le brouillon</Button>
         <Button size="sm" onClick={()=>submitReport(j,r)} loading={busy}><IconCheckCircle className="h-4 w-4"/> Soumettre le rapport</Button>
         <div className="border-t border-ink-100 pt-3"><p className="mb-2 text-xs font-bold text-ink-700">Personnes rencontrées ({list.length})</p>
          {list.map(x=><div key={x.id} className="mb-2 rounded-lg bg-ink-50 p-2"><p className="text-sm font-semibold text-ink-800">{x.nom}{x.nouveau_prescripteur?' · Nouveau prescripteur':''}</p><p className="text-xs text-ink-500">{[x.centre,x.specialite,x.telephone].filter(Boolean).join(' · ')}</p>{x.notes&&<p className="mt-1 text-xs text-ink-500">{x.notes}</p>}</div>)}
          {t.avec_portefeuille&&<label className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-600"><input type="checkbox" checked={!!newPrescriber[r.id]} onChange={e=>setNewPrescriber(v=>({...v,[r.id]:e.target.checked}))}/> Nouveau prescripteur à ajouter au portefeuille</label>}
          {t.avec_portefeuille&&!newPrescriber[r.id]?<div className="space-y-2"><select value={selectedClient[r.id]??''} onChange={e=>setSelectedClient(v=>({...v,[r.id]:e.target.value}))} className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"><option value="">Choisir un client du portefeuille</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>:<div className="space-y-2">
           <input value={rencontreNom[r.id]??''} onChange={e=>setRencontreNom(v=>({...v,[r.id]:e.target.value}))} placeholder="Nom de la personne rencontrée" className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"/>
           <input value={rencontreCentre[r.id]??''} onChange={e=>setRencontreCentre(v=>({...v,[r.id]:e.target.value}))} placeholder="Centre / établissement" className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"/>
           {t.avec_portefeuille&&newPrescriber[r.id]&&<div className="grid grid-cols-2 gap-2"><select value={specialite[r.id]??''} onChange={e=>setSpecialite(v=>({...v,[r.id]:e.target.value}))} className="rounded-xl border border-ink-200 px-2 py-2.5 text-xs"><option value="">Spécialité</option>{SPECIALITES.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><select value={potentiel[r.id]??''} onChange={e=>setPotentiel(v=>({...v,[r.id]:e.target.value}))} className="rounded-xl border border-ink-200 px-2 py-2.5 text-xs"><option value="">Potentiel</option>{POTENTIELS.map(p=><option key={p}>{p}</option>)}</select></div>}
           <input value={telephone[r.id]??''} onChange={e=>setTelephone(v=>({...v,[r.id]:e.target.value}))} placeholder="Téléphone / contact" className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"/>
          </div>}
          <textarea value={rencontreNotes[r.id]??''} onChange={e=>setRencontreNotes(v=>({...v,[r.id]:e.target.value}))} rows={2} placeholder="Notes sur la rencontre" className="mt-2 w-full rounded-xl border border-ink-200 p-3 text-sm"/>
          <Button size="sm" onClick={()=>addEncounter(r,t)} loading={busy}><IconPlus className="h-4 w-4"/> Ajouter au rapport</Button>
         </div>
        </div>}
        {j?.statut==='TERMINEE'&&r&&<div className="space-y-2"><p className="text-xs font-bold text-emerald-700">Rapport soumis</p><p className="whitespace-pre-wrap text-sm text-ink-700">{r.resume}</p>{r.observations&&<p className="whitespace-pre-wrap text-xs text-ink-500">{r.observations}</p>}{list.map(x=><p key={x.id} className="text-xs text-ink-600">• {x.nom}{x.nouveau_prescripteur?' (nouveau prescripteur)':''}</p>)}</div>}
       </div>
      })}</div>}
     </div>}
    </Card>
   })}
  </div>
 </div>
}
