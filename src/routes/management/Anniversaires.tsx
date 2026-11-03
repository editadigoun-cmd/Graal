import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { IconCalendar, IconGift, IconSearch, IconDownload, IconCamera } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import logoFull from '@/assets/logo-full.png'

type Birthday = { id:string; profile_id:string|null; nom:string; date_anniversaire:string; annee_connue:boolean; photo_url:string|null }
type Member = { id:string; full_name:string; avatar_url:string|null }
const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DEFAULT_MESSAGE="Toute l'équipe GRAAL Medical Solutions te souhaite un merveilleux anniversaire. Que cette nouvelle année t'apporte santé, bonheur et réussite. Merci pour ton engagement au sein de notre équipe !"

export default function ManagementAnniversaires(){
 const {profile}=useAuth(); const isAdmin=profile?.role==='admin'
 const [items,setItems]=useState<Birthday[]>([]),[members,setMembers]=useState<Record<string,Member>>({})
 const [month,setMonth]=useState(new Date().getMonth()),[search,setSearch]=useState(''),[selectedId,setSelectedId]=useState('')
 const [message,setMessage]=useState(DEFAULT_MESSAGE),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const [notice,setNotice]=useState<{ok:boolean;text:string}|null>(null)
 async function load(){
  setLoading(true)
  const {data,error}=await supabase.from('anniversaires_collaborateurs').select('id,profile_id,nom,date_anniversaire,annee_connue,photo_url').order('date_anniversaire')
  if(error){setNotice({ok:false,text:error.message});setLoading(false);return}
  const rows=(data??[]) as Birthday[];setItems(rows)
  const ids=[...new Set(rows.map(x=>x.profile_id).filter((x):x is string=>!!x))]
  if(ids.length){const {data:p}=await supabase.from('profiles').select('id,full_name,avatar_url').in('id',ids);setMembers(Object.fromEntries(((p??[]) as Member[]).map(x=>[x.id,x])))}
  setSelectedId(v=>v&&rows.some(x=>x.id===v)?v:rows[0]?.id??'');setLoading(false)
 }
 useEffect(()=>{load()},[])
 const filtered=useMemo(()=>{const q=search.toLocaleLowerCase('fr').trim();return items.filter(x=>Number(x.date_anniversaire.slice(5,7))===month+1&&(!q||x.nom.toLocaleLowerCase('fr').includes(q))).sort((a,b)=>a.date_anniversaire.slice(8,10).localeCompare(b.date_anniversaire.slice(8,10)))},[items,month,search])
 const selected=items.find(x=>x.id===selectedId)||null
 const photo=selected?.photo_url||(selected?.profile_id?members[selected.profile_id]?.avatar_url:null)||null
 async function saveDate(x:Birthday,value:string){if(!value)return;setBusy(true);const {error}=await supabase.from('anniversaires_collaborateurs').update({date_anniversaire:value,annee_connue:!value.startsWith('1900-')}).eq('id',x.id);setBusy(false);setNotice(error?{ok:false,text:error.message}:{ok:true,text:'Date mise à jour.'});if(!error)load()}
 async function uploadPhoto(x:Birthday,file?:File){if(!file)return;if(!file.type.startsWith('image/')){setNotice({ok:false,text:'Choisis un fichier image.'});return}setBusy(true);const path=`${x.id}/photo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error:e}=await supabase.storage.from('anniversaires').upload(path,file,{upsert:true,contentType:file.type});if(e){setBusy(false);setNotice({ok:false,text:e.message});return}const url=supabase.storage.from('anniversaires').getPublicUrl(path).data.publicUrl;const {error}=await supabase.from('anniversaires_collaborateurs').update({photo_url:url}).eq('id',x.id);setBusy(false);setNotice(error?{ok:false,text:error.message}:{ok:true,text:'Photo ajoutée.'});if(!error)load()}
 async function saveMessage(){if(!selected||!profile)return;setBusy(true);const {error}=await supabase.from('cartes_anniversaire').insert({anniversaire_id:selected.id,created_by:profile.id,message:message.trim()});setBusy(false);setNotice(error?{ok:false,text:error.message}:{ok:true,text:'Message conservé dans l’historique. Aucun envoi automatique.'})}
 async function download(){
  if(!selected)return
  try{
   const c=document.createElement('canvas');c.width=1200;c.height=1500;const x=c.getContext('2d');if(!x)throw new Error('Canvas indisponible')
   const g=x.createLinearGradient(0,0,1200,1500);g.addColorStop(0,'#071B49');g.addColorStop(.55,'#154BAD');g.addColorStop(1,'#0D806C');x.fillStyle=g;x.fillRect(0,0,1200,1500)
   const img=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Une image de la carte ne peut pas être chargée'));i.src=src})
   const logo=await img(logoFull);const ratio=Math.min(300/logo.width,100/logo.height);x.drawImage(logo,600-logo.width*ratio/2,65,logo.width*ratio,logo.height*ratio)
   x.textAlign='center';x.fillStyle='#fff';x.font='bold 54px Arial';x.fillText('JOYEUX ANNIVERSAIRE',600,250)
   x.font='26px Arial';x.fillText('GRAAL MEDICAL SOLUTIONS',600,305)
   if(photo){const p=await img(photo);const size=390,scale=Math.max(size/p.width,size/p.height);x.save();x.beginPath();x.arc(600,600,size/2,0,Math.PI*2);x.clip();x.drawImage(p,600-p.width*scale/2,600-p.height*scale/2,p.width*scale,p.height*scale);x.restore();x.strokeStyle='#fff';x.lineWidth=10;x.beginPath();x.arc(600,600,size/2,0,Math.PI*2);x.stroke()}
   else{x.fillStyle='rgba(255,255,255,.18)';x.beginPath();x.arc(600,600,195,0,Math.PI*2);x.fill()}
   x.fillStyle='#fff';x.font='bold 48px Arial';x.fillText(selected.nom,600,875);x.font='26px Arial';x.fillText(selected.date_anniversaire.slice(8,10)+'/'+selected.date_anniversaire.slice(5,7),600,930)
   x.font='27px Arial';const words=message.trim().split(/\s+/);let line='',y=1030;for(const word of words){const t=line?line+' '+word:word;if(x.measureText(t).width>920){x.fillText(line,600,y);line=word;y+=44}else line=t}if(line)x.fillText(line,600,y)
   x.font='20px Arial';x.fillStyle='rgba(255,255,255,.75)';x.fillText('ENSEMBLE, NOUS AVANÇONS',600,1410)
   const a=document.createElement('a');a.download='carte-anniversaire-graal.png';a.href=c.toDataURL('image/png');a.click();setNotice({ok:true,text:'Affiche téléchargée. La diffusion reste manuelle.'})
  }catch(e){setNotice({ok:false,text:e instanceof Error?e.message:'Erreur de création de la carte.'})}
 }
 return <div className="space-y-6">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-xl font-bold text-ink-800 font-display">Anniversaires GRAAL</h1><p className="text-sm text-ink-400">Alerte 48 h avant à l’administration et au superviseur concerné. Aucun message automatique au collaborateur.</p></div><div className="flex items-center gap-2 rounded-2xl bg-royal-50 px-4 py-2.5 text-xs font-semibold text-royal-700"><IconGift className="h-4 w-4"/> J-2 · diffusion manuelle</div></div>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><Card><p className="text-xs text-ink-400">Collaborateurs</p><p className="mt-1 text-2xl font-extrabold">{items.length}</p></Card><Card><p className="text-xs text-ink-400">Anniversaires ce mois</p><p className="mt-1 text-2xl font-extrabold">{items.filter(x=>Number(x.date_anniversaire.slice(5,7))===new Date().getMonth()+1).length}</p></Card><Card><p className="text-xs text-ink-400">Années connues</p><p className="mt-1 text-2xl font-extrabold">{items.filter(x=>x.annee_connue).length}</p></Card></div>
  {notice&&<p className={`rounded-xl px-3.5 py-2.5 text-xs ${notice.ok?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>{notice.text}</p>}
  <div className="grid gap-4 xl:grid-cols-2">
   <div className="space-y-3"><Card className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><IconSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un collaborateur…" className="w-full rounded-xl border border-ink-200 pl-10 pr-3 py-2.5 text-sm"/></div><select value={month} onChange={e=>setMonth(Number(e.target.value))} className="rounded-xl border border-ink-200 px-3 py-2.5 text-sm">{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select></Card>
    <Card className="p-0 overflow-hidden">{loading?<p className="p-8 text-center text-sm text-ink-400">Chargement…</p>:filtered.length===0?<div className="p-10 text-center"><IconCalendar className="mx-auto h-8 w-8 text-ink-300"/><p className="mt-3 text-sm font-semibold">Aucun anniversaire ce mois-ci</p></div>:<div className="divide-y divide-ink-100">{filtered.map(x=><div key={x.id} className={`flex items-center gap-3 p-3 ${selectedId===x.id?'bg-royal-50':''}`}><Avatar name={x.nom} url={x.photo_url||(x.profile_id?members[x.profile_id]?.avatar_url:null)} size={42}/><button className="min-w-0 flex-1 text-left" onClick={()=>setSelectedId(x.id)}><p className="truncate text-sm font-bold">{x.nom}</p><p className="text-xs text-ink-400">{x.date_anniversaire.slice(8,10)}/{x.date_anniversaire.slice(5,7)}{x.annee_connue?' · '+x.date_anniversaire.slice(0,4):' · année non renseignée'}</p></button>{isAdmin&&<input aria-label={`Date de naissance de ${x.nom}`} type="date" value={x.date_anniversaire} onChange={e=>saveDate(x,e.target.value)} disabled={busy} className="w-36 rounded-lg border border-ink-200 px-2 py-1.5 text-xs"/>}<Badge tone={x.profile_id?'success':'warning'}>{x.profile_id?'Compte lié':'Non rattaché'}</Badge></div>)}</div>}</Card>
    {isAdmin&&selected&&<Card><p className="mb-2 text-sm font-bold">Photo du collaborateur</p><p className="mb-3 text-xs text-ink-400">La photo du profil est utilisée par défaut. Tu peux importer une photo dédiée à l'affiche.</p><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-xs font-semibold"><IconCamera className="h-4 w-4"/> Importer une photo<input type="file" accept="image/*" className="hidden" onChange={e=>uploadPhoto(selected,e.target.files?.[0])}/></label></Card>}</div>
   <Card><p className="mb-3 text-sm font-bold">Créer une carte d'anniversaire</p>{!selected?<p className="text-sm text-ink-400">Sélectionne un collaborateur.</p>:<><div className="rounded-2xl bg-gradient-to-br from-[#071B49] via-[#154BAD] to-[#0D806C] p-5 text-center text-white"><img src={logoFull} alt="GRAAL Medical Solutions" className="mx-auto mb-3 h-12 w-auto object-contain"/><p className="text-xs font-bold tracking-[.2em]">JOYEUX ANNIVERSAIRE</p><div className="mx-auto my-4 h-28 w-28 overflow-hidden rounded-full border-4 border-white/80 bg-white/15">{photo?<img src={photo} alt={selected.nom} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-2xl font-bold">{selected.nom.slice(0,2).toUpperCase()}</div>}</div><p className="text-lg font-extrabold">{selected.nom}</p><p className="mt-1 text-xs text-white/75">{selected.date_anniversaire.slice(8,10)}/{selected.date_anniversaire.slice(5,7)}</p><p className="mx-auto mt-4 max-w-md whitespace-pre-wrap text-sm leading-relaxed">{message}</p><p className="mt-5 text-[10px] font-semibold tracking-widest text-white/70">GRAAL MEDICAL SOLUTIONS</p></div><label className="mt-4 mb-1 block text-xs font-semibold">Message personnalisé</label><textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)} className="w-full rounded-xl border border-ink-200 p-3 text-sm"/><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" icon={<IconDownload className="h-4 w-4"/>} onClick={download}>Télécharger l'affiche</Button><Button size="sm" variant="secondary" onClick={saveMessage} disabled={!message.trim()||busy}>Enregistrer le message</Button></div><p className="mt-2 text-[11px] text-ink-400">L'enregistrement conserve le texte dans l'historique. Aucun envoi n'est déclenché.</p></>}</Card>
  </div>
 </div>
}
