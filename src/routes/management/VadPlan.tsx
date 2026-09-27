import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { IconPlus, IconCheckCircle, IconClock } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

export default function VadPlan() {
  const { profile } = useAuth()
  const [mois,setMois] = useState(dayjs().add(1,'month').format('YYYY-MM'))
  const [rows,setRows] = useState<any[]>([])
  const [todaySessions,setTodaySessions] = useState<any[]>([])
  const [loading,setLoading] = useState(false)
  const [activating,setActivating] = useState<string|null>(null)
  const [notice,setNotice] = useState('')
  const [formOpen,setFormOpen] = useState(false)

  async function load() {
    setLoading(true)
    if (!profile) { setLoading(false); return }
    const [{data,error},{data:sessions}] = await Promise.all([
      (supabase.from('vad_plans_mensuels' as any).select('*').eq('mois',mois+'-01').eq('superviseur_id',profile.id).order('created_at',{ascending:false}) as any),
      (supabase.from('vad_duo_sessions' as any).select('*').eq('superviseur_id',profile.id).eq('jour',dayjs().format('YYYY-MM-DD')).order('created_at',{ascending:false}) as any)
    ])
    setRows(data??[])
    setTodaySessions(sessions??[])
    if(error) setNotice(error.message)
    setLoading(false)
  }
  useEffect(()=>{load()},[mois,profile?.id])

  async function add() {
    if(!profile) return
    const {error} = await (supabase.from('vad_plans_mensuels' as any).insert({mois:mois+'-01',superviseur_id:profile.id,contenu:'Plan VAD/Duo à compléter'}) as any)
    setNotice(error ? error.message : 'Plan enregistré et verrouillé après soumission.')
    if(!error){setFormOpen(false);load()}
  }

  async function activate(id:string) {
    setActivating(id); setNotice('')
    const {error} = await (supabase.rpc('activate_vad_session' as any,{p_session_id:id}) as any)
    setActivating(null)
    setNotice(error ? error.message : 'VAD activé. Le duo est maintenant en cours.')
    if(!error) load()
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-extrabold text-ink-800 font-display">VAD – Plan de Duo</h1><p className="text-sm text-ink-400">Le programme soumis est verrouillé. Le VAD du jour doit être activé par le superviseur.</p></div><Button size="sm" icon={<IconPlus className="h-4 w-4"/>} onClick={()=>setFormOpen(true)}>Nouveau plan</Button></div>

    {todaySessions.length > 0 && <Card className="border-2 border-royal-100 bg-royal-50/40">
      <div className="flex items-center gap-2 mb-3"><IconClock className="h-5 w-5 text-royal-600"/><div><p className="text-sm font-extrabold text-ink-800">VAD prévu aujourd’hui</p><p className="text-xs text-ink-400">Le programme est affiché automatiquement.</p></div></div>
      <div className="space-y-2">{todaySessions.map((s:any)=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 border border-ink-100"><div><p className="text-sm font-bold text-ink-800">Délégué : {s.vm_id}</p><p className="text-xs text-ink-400">{s.statut === 'EN_COURS' ? 'Duo en cours' : s.statut === 'TERMINE' ? 'Duo terminé' : 'À activer'}</p></div>{s.statut === 'EN_COURS' ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><IconCheckCircle className="h-4 w-4"/> VAD actif</span> : s.statut === 'TERMINE' ? <span className="text-xs font-bold text-ink-400">Terminé</span> : <Button size="sm" loading={activating===s.id} onClick={()=>activate(s.id)}>Activer le VAD</Button>}</div>)}</div>
    </Card>}

    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><Card><p className="text-xs text-ink-400">Plans</p><p className="mt-1 text-2xl font-extrabold text-ink-800">{rows.length}</p></Card><Card><p className="text-xs text-ink-400">Mois affiché</p><p className="mt-1 text-sm font-extrabold text-ink-800">{dayjs(mois+'-01').format('MMMM YYYY')}</p></Card><Card><p className="text-xs text-ink-400">Statut</p><p className="mt-1 text-sm font-extrabold text-ink-800">{rows.length?'Plan soumis':'À créer'}</p></Card></div>
    {notice&&<p className="text-sm text-ink-500">{notice}</p>}
    <Card className="p-4">{loading?'Chargement...':rows.length?rows.map(r=><div key={r.id} className="border-b border-ink-100 py-3 text-sm"><span className="font-semibold">Plan VAD/Duo</span><span className="ml-2 text-ink-400">{r.soumis_at?'Soumis et verrouillé':'Brouillon'}</span></div>):<p className="text-sm text-ink-400">Aucun plan pour ce mois.</p>}</Card>
    <Modal open={formOpen} onClose={()=>setFormOpen(false)} title="Nouveau plan VAD / Duo" description="Sélectionnez le mois puis soumettez le programme."><div className="space-y-4"><label className="block text-xs font-semibold text-ink-500">Mois<input type="month" value={mois} onChange={e=>setMois(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-100 px-3 py-2"/></label><div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setFormOpen(false)}>Annuler</Button><Button onClick={add}>Soumettre le plan</Button></div></div></Modal>
  </div>
}
