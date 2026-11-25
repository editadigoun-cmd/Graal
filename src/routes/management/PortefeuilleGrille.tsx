import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'

type Mode = 'superviseurs' | 'vm'
type Client = {
  id: string; nom: string; centre: string | null; specialite: string; potentiel: string
  secteur: string; frequence_visite_mensuelle: number; contacts: string | null
  observations: string | null; actif: boolean
}
type Profile = { id: string; full_name: string; role: string; equipe_id: string | null }
type Filter = { id: number; field: string; value: string }
const SPECIALITES = ['GENERALISTE','GYNECOLOGUE','PEDIATRE','CARDIOLOGUE','RHUMATOLOGUE','ORL','AUTRE_SPECIALITE','MATERNITE','DISPENSAIRE','PHARMACIE','IDE','ANESTHESISTE','CHIRURGIEN','CHIRURGIEN_PEDIATRIQUE','DERMATOLOGUE','DIABETOLOGUE','ENDOCRINOLOGUE','GASTROENTEROLOGUE','SAGE_FEMME','NEPHROLOGUE','NEUROLOGUE','NEUROCHIRURGIEN','NUTRITIONNISTE','ONCOLOGUE','PNEUMOLOGUE','REANIMATEUR','TRAUMATOLOGUE','URGENTISTE','UROLOGUE','INTERNISTE','PSYCHOLOGUE']
const LABELS: Record<string,string> = { GENERALISTE:'Généraliste',GYNECOLOGUE:'Gynécologue',PEDIATRE:'Pédiatre',CARDIOLOGUE:'Cardiologue',RHUMATOLOGUE:'Rhumatologue',ORL:'ORL',AUTRE_SPECIALITE:'Autre',MATERNITE:'Maternité',DISPENSAIRE:'Dispensaire',PHARMACIE:'Pharmacie',IDE:'Infirmier(ère)',ANESTHESISTE:'Anesthésiste',CHIRURGIEN:'Chirurgien',CHIRURGIEN_PEDIATRIQUE:'Chirurgien pédiatrique',DERMATOLOGUE:'Dermatologue',DIABETOLOGUE:'Diabétologue',ENDOCRINOLOGUE:'Endocrinologue',GASTROENTEROLOGUE:'Gastro-entérologue',SAGE_FEMME:'Sage-femme',NEPHROLOGUE:'Néphrologue',NEUROLOGUE:'Neurologue',NEUROCHIRURGIEN:'Neurochirurgien',NUTRITIONNISTE:'Nutritionniste',ONCOLOGUE:'Oncologue',PNEUMOLOGUE:'Pneumologue',REANIMATEUR:'Réanimateur',TRAUMATOLOGUE:'Traumatologue',URGENTISTE:'Urgentiste',UROLOGUE:'Urologue',INTERNISTE:'Interniste',PSYCHOLOGUE:'Psychologue' }
const FILTER_FIELDS = [{value:'nom',label:'Nom'},{value:'centre',label:'Centre'},{value:'specialite',label:'Spécialité'},{value:'potentiel',label:'Potentiel'},{value:'secteur',label:'Secteur'},{value:'vm',label:'VM'},{value:'actif',label:'Statut'}]
export default function PortefeuilleGrille({ mode }: { mode: Mode }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [clients,setClients] = useState<Client[]>([])
  const [vms,setVms] = useState<Profile[]>([])
  const [superviseurs,setSuperviseurs] = useState<Profile[]>([])
  const [vmLinks,setVmLinks] = useState<{client_id:string;vm_id:string}[]>([])
  const [supervisorLinks,setSupervisorLinks] = useState<{client_id:string;superviseur_id:string}[]>([])
  const [allowedVmIds,setAllowedVmIds] = useState<string[] | null>(null)
  const [loading,setLoading] = useState(true)
  const [search,setSearch] = useState('')
  const [vmFilter,setVmFilter] = useState('')
  const [supervisorFilter,setSupervisorFilter] = useState('')
  const [filters,setFilters] = useState<Filter[]>([])
  const [saving,setSaving] = useState<string | null>(null)
  const [notice,setNotice] = useState('')
  const [page,setPage] = useState(1)
  const [newClientOpen,setNewClientOpen] = useState(false)
  const [newClient,setNewClient] = useState({nom:'',centre:'',specialite:'GENERALISTE',potentiel:'MOYEN',secteur:'A',frequence_visite_mensuelle:'1',contacts:'',observations:'',vmIds:[] as string[]})
  const pageSize = 100
  const vmById = useMemo(()=>Object.fromEntries(vms.map(v=>[v.id,v.full_name])),[vms])
  const supervisorById = useMemo(()=>Object.fromEntries(superviseurs.map(v=>[v.id,v.full_name])),[superviseurs])

  async function load() {
    if (!profile) return
    setLoading(true)
    const [{data:vmProfiles},{data:spProfiles}] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role,equipe_id').eq('role','vm').order('full_name'),
      supabase.from('profiles').select('id,full_name,role,equipe_id').eq('role','superviseur').order('full_name')
    ])
    const vmRows = (vmProfiles ?? []) as Profile[]
    const spRows = (spProfiles ?? []) as Profile[]
    setVms(vmRows); setSuperviseurs(spRows)
    let allowed: string[] | null = null
    if (!isAdmin) {
      const {data:teamLinks} = await supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id',profile.id)
      const teamIds = (teamLinks ?? []).map(x=>x.equipe_id)
      allowed = vmRows.filter(v=>v.equipe_id && teamIds.includes(v.equipe_id)).map(v=>v.id)
    }
    setAllowedVmIds(allowed)
    let allClients: Client[] = []
    for(let from=0;;from+=1000){
      const {data,error} = await supabase.from('clients').select('id,nom,centre,specialite,potentiel,secteur,frequence_visite_mensuelle,contacts,observations,actif').order('nom').range(from,from+999)
      if(error){setNotice(error.message);break}
      allClients = allClients.concat((data ?? []) as Client[])
      if(!data || data.length<1000) break
    }
    let vmAssignments: {client_id:string;vm_id:string}[] = []
    let spAssignments: {client_id:string;superviseur_id:string}[] = []
    for(let from=0;;from+=1000){
      let q = supabase.from('portefeuille').select('client_id,vm_id').range(from,from+999)
      if(allowed) q=q.in('vm_id',allowed.length?allowed:['00000000-0000-0000-0000-000000000000'])
      const {data,error}=await q
      if(error){setNotice(error.message);break}
      vmAssignments=vmAssignments.concat(data??[])
      if(!data || data.length<1000)break
    }
    if(mode==='superviseurs' || isAdmin){
      for(let from=0;;from+=1000){
        let q=supabase.from('portefeuille_superviseurs').select('client_id,superviseur_id').range(from,from+999)
        if(!isAdmin) q=q.eq('superviseur_id',profile.id)
        const {data,error}=await q
        if(error){setNotice(error.message);break}
        spAssignments=spAssignments.concat(data??[])
        if(!data || data.length<1000)break
      }
    }
    setClients(allClients);setVmLinks(vmAssignments);setSupervisorLinks(spAssignments);setLoading(false)
  }
  useEffect(()=>{void load()},[profile?.id,mode])
  const visible = useMemo(()=>{
    const q=search.trim().toLowerCase()
    return clients.filter(c=>{
      const clientVmIds=vmLinks.filter(x=>x.client_id===c.id).map(x=>x.vm_id)
      const vm=clientVmIds[0] ?? ''
      const sp=supervisorLinks.find(x=>x.client_id===c.id)?.superviseur_id ?? ''
      if(mode==='superviseurs' && !supervisorLinks.some(x=>x.client_id===c.id))return false
      if(mode==='vm' && !vmLinks.some(x=>x.client_id===c.id))return false
      if(vmFilter && vm!==vmFilter)return false
      if(supervisorFilter && sp!==supervisorFilter)return false
      if(q && ![c.nom,c.centre??'',LABELS[c.specialite]??c.specialite].some(x=>x.toLowerCase().includes(q)))return false
      return filters.every(f=>{
        if(!f.value)return true
        const val=f.value.toLowerCase()
        switch(f.field){
          case 'nom':return c.nom.toLowerCase().includes(val)
          case 'centre':return (c.centre??'').toLowerCase().includes(val)
          case 'specialite':return c.specialite===f.value
          case 'potentiel':return c.potentiel===f.value
          case 'secteur':return c.secteur===f.value
          case 'vm':return clientVmIds.includes(f.value)
          case 'actif':return String(c.actif)===f.value
          default:return true
        }
      })
    })
  },[clients,vmLinks,supervisorLinks,mode,search,vmFilter,supervisorFilter,filters])
  useEffect(()=>setPage(1),[search,vmFilter,supervisorFilter,filters])
  const shown=visible.slice((page-1)*pageSize,page*pageSize)
  async function saveCell(c:Client,field:keyof Client,value:string){
    if(String(c[field]??'')===value)return
    setSaving(c.id+field);setNotice('')
    const numeric=['frequence_visite_mensuelle'].includes(field)
    const payload:Record<string,unknown>={[field]:numeric?Number(value):field==='actif'?value==='true':value===''?null:value}
    const {error}=await supabase.from('clients').update(payload as any).eq('id',c.id)
    setSaving(null)
    if(error){setNotice('Modification refusée : '+error.message);return}
    setClients(rows=>rows.map(x=>x.id===c.id?{...x,...payload} as Client:x))
    setNotice('Modification enregistrée.')
  }
  async function saveAssignment(c:Client,field:'vm_id'|'superviseur_id',value:string,remove=false){
    setSaving(c.id+field);setNotice('')
    const table=field==='vm_id'?'portefeuille':'portefeuille_superviseurs'
    const key=field==='vm_id'?'vm_id':'superviseur_id'
    const current=field==='vm_id'?vmLinks:supervisorLinks
    const existing=current.some(x=>x.client_id===c.id && (field==='vm_id'?(x as any).vm_id:(x as any).superviseur_id)===value)
    if(remove){
      const {error}=await supabase.from(table).delete().eq('client_id',c.id).eq(key,value)
      if(error){setNotice('Impossible de retirer cette affectation : '+error.message);setSaving(null);return}
    } else if(!existing && value){
      const {error}=await supabase.from(table).insert({client_id:c.id,[key]:value})
      if(error){setNotice('Impossible d’ajouter ce VM : '+error.message);setSaving(null);return}
    }
    if(field==='vm_id')setVmLinks(rows=>remove?rows.filter(x=>!(x.client_id===c.id && x.vm_id===value)):[...rows,...(!existing&&value?[{client_id:c.id,vm_id:value}]:[])])
    else setSupervisorLinks(rows=>remove?rows.filter(x=>!(x.client_id===c.id && x.superviseur_id===value)):[...rows,...(!existing&&value?[{client_id:c.id,superviseur_id:value}]:[])])
    setSaving(null);setNotice(remove?'VM retiré du portefeuille du client.':'VM associé au client.')
  }
  async function deleteClient(c:Client){
    if(!isAdmin){setNotice('Seul un administrateur peut supprimer un client.');return}
    setSaving(c.id+'delete');setNotice('')
    const checks=await Promise.all([
      supabase.from('visites').select('id',{count:'exact',head:true}).eq('client_id',c.id),
      supabase.from('programme_lignes').select('id',{count:'exact',head:true}).eq('client_id',c.id),
      supabase.from('programme_visites_superviseur_lignes').select('id',{count:'exact',head:true}).eq('client_id',c.id)
    ])
    const failed=checks.find(x=>x.error)
    if(failed){setNotice('Vérification impossible. Suppression annulée : '+failed.error!.message);setSaving(null);return}
    const [visites,programmes,programmesSuperviseur]=checks.map(x=>x.count??0)
    if(visites+programmes+programmesSuperviseur>0){
      setNotice('Suppression impossible : ce client est déjà associé à '+visites+' visite(s), '+programmes+' ligne(s) de programme VM et '+programmesSuperviseur+' ligne(s) de programme superviseur. Conservez sa fiche et désactivez-le si nécessaire.')
      setSaving(null);return
    }
    const {error}=await supabase.from('clients').delete().eq('id',c.id)
    if(error){setNotice('Suppression impossible : '+error.message);setSaving(null);return}
    setClients(rows=>rows.filter(x=>x.id!==c.id))
    setVmLinks(rows=>rows.filter(x=>x.client_id!==c.id))
    setSupervisorLinks(rows=>rows.filter(x=>x.client_id!==c.id))
    setSaving(null);setNotice('Client supprimé.')
  }
  async function createClient(){
    if(!isAdmin){setNotice('Seul un administrateur peut créer un client.');return}
    if(!newClient.nom.trim()){setNotice('Le nom du client est obligatoire.');return}
    setSaving('new-client');setNotice('')
    const {data,error}=await supabase.from('clients').insert({
      nom:newClient.nom.trim(),centre:newClient.centre.trim()||null,
      specialite:newClient.specialite,potentiel:newClient.potentiel,secteur:newClient.secteur,
      frequence_visite_mensuelle:Number(newClient.frequence_visite_mensuelle)||1,
      contacts:newClient.contacts.trim()||null,observations:newClient.observations.trim()||null,actif:true
    }).select('id,nom,centre,specialite,potentiel,secteur,frequence_visite_mensuelle,contacts,observations,actif').single()
    if(error){setNotice('Création impossible : '+error.message);setSaving(null);return}
    if(newClient.vmIds.length){
      const {error:assignError}=await supabase.from('portefeuille').insert(newClient.vmIds.map(vm_id=>({client_id:data.id,vm_id})))
      if(assignError){setNotice('Client créé, mais certaines affectations VM ont échoué : '+assignError.message);await load();setSaving(null);return}
      setVmLinks(rows=>[...rows,...newClient.vmIds.map(vm_id=>({client_id:data.id,vm_id}))])
    }
    setClients(rows=>[...rows,data as Client].sort((a,b)=>a.nom.localeCompare(b.nom)))
    setNewClient({nom:'',centre:'',specialite:'GENERALISTE',potentiel:'MOYEN',secteur:'A',frequence_visite_mensuelle:'1',contacts:'',observations:'',vmIds:[]})
    setNewClientOpen(false);setSaving(null);setNotice('Nouveau client créé.')
  }
  if(loading)return <div className="space-y-3"><Skeleton className="h-20"/><Skeleton className="h-72"/></div>
  const title=mode==='superviseurs'?'Portefeuille superviseurs':'Portefeuille VM'
  return <div className="space-y-5 pb-8">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-royal-600">Gestion des portefeuilles</p><h1 className="provisit-page-title mt-1">{!isAdmin && mode==='superviseurs'?'Mon portefeuille':title}</h1><p className="mt-1 text-sm text-ink-400">{isAdmin?'Vue globale avec modification directe des fiches et affectations.':'Clients des VM de vos équipes et portefeuille qui vous est attribué.'}</p></div>{isAdmin&&<button onClick={()=>setNewClientOpen(v=>!v)} className="shrink-0 rounded-xl bg-royal-600 px-4 py-3 text-sm font-bold text-white shadow-sm">+ Nouveau client</button>}</div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><Card><p className="text-xs text-ink-400">Clients affichés</p><p className="mt-1 text-2xl font-extrabold">{visible.length}</p></Card><Card><p className="text-xs text-ink-400">Clients actifs</p><p className="mt-1 text-2xl font-extrabold">{visible.filter(c=>c.actif).length}</p></Card><Card><p className="text-xs text-ink-400">Enregistrements par page</p><p className="mt-1 text-2xl font-extrabold">{pageSize}</p></Card></div>
    <Card className="space-y-3">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un client, un centre…" className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm"/>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {mode==='vm'&&<select value={vmFilter} onChange={e=>setVmFilter(e.target.value)} className="rounded-xl border border-ink-200 px-3 py-2 text-sm"><option value="">Tous les VM</option>{vms.filter(v=>!allowedVmIds||allowedVmIds.includes(v.id)).map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select>}
        {mode==='superviseurs'&&<select value={supervisorFilter} onChange={e=>setSupervisorFilter(e.target.value)} className="rounded-xl border border-ink-200 px-3 py-2 text-sm"><option value="">{isAdmin?'Tous les superviseurs':'Mon portefeuille'}</option>{superviseurs.filter(v=>isAdmin||v.id===profile?.id).map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select>}
        {filters.map(f=><div key={f.id} className="flex gap-1"><select value={f.field} onChange={e=>setFilters(rows=>rows.map(x=>x.id===f.id?{...x,field:e.target.value,value:''}:x))} className="min-w-0 flex-1 rounded-xl border border-ink-200 px-2 py-2 text-xs">{FILTER_FIELDS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><select value={f.value} onChange={e=>setFilters(rows=>rows.map(x=>x.id===f.id?{...x,value:e.target.value}:x))} className="min-w-0 flex-1 rounded-xl border border-ink-200 px-2 py-2 text-xs"><option value="">Toutes valeurs</option>{(f.field==='specialite'?SPECIALITES:f.field==='potentiel'?['G+','GROS','MOYEN','FAIBLE']:f.field==='secteur'?['A','B']:f.field==='vm'?vms.filter(v=>!allowedVmIds||allowedVmIds.includes(v.id)).map(v=>v.id):f.field==='actif'?['true','false']:[]).map(v=><option key={v} value={v}>{LABELS[v]??vmById[v]??v}</option>)}</select><button onClick={()=>setFilters(rows=>rows.filter(x=>x.id!==f.id))} className="px-2 text-red-500">×</button></div>)}
        <button onClick={()=>setFilters(rows=>[...rows,{id:Date.now(),field:'specialite',value:''}])} className="rounded-xl border border-dashed border-royal-300 px-3 py-2 text-xs font-semibold text-royal-700">+ Ajouter un filtre</button>
      </div>
    </Card>
    <>{newClientOpen&&<Card className="space-y-3 border border-royal-200">
      <div className="flex items-center justify-between"><h2 className="font-bold text-ink-800">Ajouter un nouveau client</h2><button onClick={()=>setNewClientOpen(false)} className="text-xl text-ink-400">×</button></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input placeholder="Nom du client *" value={newClient.nom} onChange={e=>setNewClient(x=>({...x,nom:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm"/>
        <input placeholder="Centre / établissement" value={newClient.centre} onChange={e=>setNewClient(x=>({...x,centre:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm"/>
        <select value={newClient.specialite} onChange={e=>setNewClient(x=>({...x,specialite:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm">{SPECIALITES.map(s=><option key={s} value={s}>{LABELS[s]??s}</option>)}</select>
        <select value={newClient.potentiel} onChange={e=>setNewClient(x=>({...x,potentiel:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm">{['GROS','MOYEN','FAIBLE','G+'].map(s=><option key={s}>{s}</option>)}</select>
        <select value={newClient.secteur} onChange={e=>setNewClient(x=>({...x,secteur:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm"><option value="A">Secteur A</option><option value="B">Secteur B</option></select>
        <input type="number" min="1" placeholder="Fréquence mensuelle" value={newClient.frequence_visite_mensuelle} onChange={e=>setNewClient(x=>({...x,frequence_visite_mensuelle:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm"/>
        <input placeholder="Contacts" value={newClient.contacts} onChange={e=>setNewClient(x=>({...x,contacts:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm"/>
        <input placeholder="Observations" value={newClient.observations} onChange={e=>setNewClient(x=>({...x,observations:e.target.value}))} className="rounded-xl border px-3 py-2 text-sm"/>
      </div>
      <div><p className="mb-2 text-xs font-semibold text-ink-600">Associer plusieurs VM (facultatif)</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{vms.map(v=><label key={v.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs"><input type="checkbox" checked={newClient.vmIds.includes(v.id)} onChange={e=>setNewClient(x=>({...x,vmIds:e.target.checked?[...x.vmIds,v.id]:x.vmIds.filter(id=>id!==v.id)}))}/>{v.full_name}</label>)}</div></div>
      <div className="flex justify-end"><button disabled={saving==='new-client'} onClick={()=>void createClient()} className="rounded-xl bg-royal-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving==='new-client'?'Création…':'Créer le client'}</button></div>
    </Card>}{notice&&<p className="rounded-xl bg-royal-50 px-3 py-2 text-xs text-royal-700">{notice}</p>}</>
    <Card className="overflow-hidden p-0">
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-[1450px] w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20 bg-ink-50"><tr>{['Nom du client','Centre','Spécialité','Potentiel','Secteur','Fréquence/mois',...(mode==='vm'?['Visiteurs médicaux']:['Superviseur']),'Contacts','Observations','Statut',...(isAdmin?['Action']:[])].map((h,i)=><th key={h} className={'whitespace-nowrap border-b border-ink-200 px-3 py-3 text-left font-bold text-ink-600 '+(i===0?'sticky left-0 z-30 min-w-[230px] bg-ink-50':'')}>{h}</th>)}</tr></thead>
          <tbody>{shown.map(c=><tr key={c.id} className="group hover:bg-royal-50/40">
            <td className="sticky left-0 z-10 border-b border-ink-100 bg-white px-3 py-1 font-bold text-ink-800 group-hover:bg-royal-50 min-w-[230px]"><Cell value={c.nom} onSave={v=>saveCell(c,'nom',v)}/></td>
            <td className="border-b border-ink-100 p-1"><Cell value={c.centre??''} onSave={v=>saveCell(c,'centre',v)}/></td>
            <td className="border-b border-ink-100 p-1"><select value={c.specialite} onChange={e=>saveCell(c,'specialite',e.target.value)} className="w-40 rounded-lg border border-transparent bg-transparent p-2 hover:border-ink-200 focus:border-royal-400">{SPECIALITES.map(s=><option key={s} value={s}>{LABELS[s]??s}</option>)}</select></td>
            <td className="border-b border-ink-100 p-1"><select value={c.potentiel} onChange={e=>saveCell(c,'potentiel',e.target.value)} className="rounded-lg border border-transparent bg-transparent p-2 hover:border-ink-200"><option>G+</option><option>GROS</option><option>MOYEN</option><option>FAIBLE</option></select></td>
            <td className="border-b border-ink-100 p-1"><select value={c.secteur} onChange={e=>saveCell(c,'secteur',e.target.value)} className="rounded-lg border border-transparent bg-transparent p-2 hover:border-ink-200"><option>A</option><option>B</option></select></td>
            <td className="border-b border-ink-100 p-1"><Cell value={String(c.frequence_visite_mensuelle)} type="number" onSave={v=>saveCell(c,'frequence_visite_mensuelle',v)}/></td>
            {mode==='vm'?<td className="border-b border-ink-100 p-1"><div className="flex min-w-[230px] flex-wrap items-center gap-1">{vmLinks.filter(x=>x.client_id===c.id).map(x=><span key={x.vm_id} className="inline-flex items-center gap-1 rounded-full bg-royal-50 px-2 py-1 text-[11px] text-royal-800">{vmById[x.vm_id]??'VM'}{isAdmin&&<button title="Retirer ce VM" onClick={()=>void saveAssignment(c,'vm_id',x.vm_id,true)} className="font-bold text-red-600">×</button>}</span>)}{isAdmin&&<select value="" onChange={e=>{if(e.target.value)void saveAssignment(c,'vm_id',e.target.value)}} className="max-w-[130px] rounded-lg border border-dashed border-royal-300 bg-white p-1.5 text-[11px]"><option value="">+ Ajouter VM</option>{vms.filter(v=>!vmLinks.some(x=>x.client_id===c.id&&x.vm_id===v.id)).map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select>}</div></td>:<td className="border-b border-ink-100 p-1"><select disabled={!isAdmin} value={supervisorLinks.find(x=>x.client_id===c.id)?.superviseur_id??''} onChange={e=>saveAssignment(c,'superviseur_id',e.target.value)} className="w-44 rounded-lg border border-transparent bg-transparent p-2 disabled:opacity-60 hover:border-ink-200"><option value="">Non affecté</option>{superviseurs.map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select></td>}
            <td className="border-b border-ink-100 p-1"><Cell value={c.contacts??''} onSave={v=>saveCell(c,'contacts',v)}/></td>
            <td className="border-b border-ink-100 p-1"><Cell value={c.observations??''} onSave={v=>saveCell(c,'observations',v)}/></td>
            <td className="border-b border-ink-100 p-1"><select value={String(c.actif)} onChange={e=>saveCell(c,'actif',e.target.value==='true'?'true':'false')} className="rounded-lg border border-transparent bg-transparent p-2"><option value="true">Actif</option><option value="false">Inactif</option></select></td>{isAdmin&&<td className="border-b border-ink-100 p-1 text-center"><button title="Supprimer le client" onClick={()=>void deleteClient(c)} disabled={saving===c.id+'delete'} className="rounded-lg px-3 py-2 text-base font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">×</button></td>}
          </tr>)}</tbody>
        </table>
        {!shown.length&&<p className="p-10 text-center text-sm text-ink-400">Aucun client ne correspond aux filtres.</p>}
      </div>
      <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-xs"><span>{visible.length} client(s) · page {page}/{Math.max(1,Math.ceil(visible.length/pageSize))}</span><div className="flex gap-2"><button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Précédent</button><button disabled={page*pageSize>=visible.length} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Suivant</button></div></div>
    </Card>
    <p className="text-[11px] text-ink-400">Saisie directe : cliquez dans une cellule texte puis validez avec Entrée ou en quittant la cellule. Les listes déroulantes enregistrent immédiatement. {saving?'Enregistrement en cours…':''}</p>
  </div>
}
function Cell({value,type='text',onSave}:{value:string;type?:string;busy?:boolean;onSave:(v:string)=>void}){
  const [draft,setDraft]=useState(value)
  useEffect(()=>setDraft(value),[value])
  return <input value={draft} type={type} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==value)onSave(draft)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}} className="w-40 rounded-lg border border-transparent bg-transparent px-2 py-2 text-xs outline-none hover:border-ink-200 focus:border-royal-400 focus:bg-white" aria-label="Modifier la cellule" />
}
