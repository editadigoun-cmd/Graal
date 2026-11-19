import { useEffect, useState } from 'react'

type Feedback = { title: string; message: string; kind: 'error'|'success'|'info' }

export function GlobalFeedbackPopup() {
 const [feedback,setFeedback]=useState<Feedback|null>(null)
 useEffect(()=>{
  const show=(e:Event)=>{const d=(e as CustomEvent).detail??{};setFeedback({title:d.title??'Information',message:String(d.message??'Une erreur est survenue.'),kind:d.kind??'error'})}
  const onError=(e:ErrorEvent)=>show(new CustomEvent('platform-feedback',{detail:{title:'Erreur de la plateforme',message:e.message||'Une erreur inattendue est survenue.',kind:'error'}}))
  const onReject=(e:PromiseRejectionEvent)=>show(new CustomEvent('platform-feedback',{detail:{title:'Erreur de la plateforme',message:String(e.reason?.message??e.reason??'Une opération a échoué.'),kind:'error'}}))
  const originalAlert=window.alert\n  window.alert=(message?:unknown)=>show(new CustomEvent('platform-feedback',{detail:{title:'Information',message:String(message??''),kind:'info'}}))\n  window.addEventListener('platform-feedback',show)
  window.addEventListener('error',onError)
  window.addEventListener('unhandledrejection',onReject)
  return()=>{window.alert=originalAlert;window.removeEventListener('platform-feedback',show);window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject)}
 },[])
 if(!feedback)return null
 return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
  <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
   <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${feedback.kind==='error'?'bg-red-100 text-red-600':feedback.kind==='success'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>{feedback.kind==='error'?'!':feedback.kind==='success'?'✓':'i'}</div>
   <h2 className="text-base font-bold text-ink-800">{feedback.title}</h2>
   <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">{feedback.message}</p>
   <button onClick={()=>setFeedback(null)} className="mt-5 w-full rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white">Compris</button>
  </div>
 </div>
}
