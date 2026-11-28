import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { IconCalendar, IconCheckCircle, IconAlert } from '@/components/ui/icons'

type VM = { id: string; full_name: string }
type Absence = { id: string; vm_id: string; date_debut: string; date_fin: string; motif: string; commentaire: string | null; created_at: string; profiles: { full_name: string } | null }

const MOTIFS = [{ value: 'PERMISSION', label: 'Permission' }, { value: 'MALADIE', label: 'Maladie' }, { value: 'AUTRE', label: 'Autre absence justifiée' }]

export default function GestionAbsences() {
  const { profile } = useAuth()
  const [vms, setVms] = useState<VM[]>([])
  const [rows, setRows] = useState<Absence[]>([])
  const [vmId, setVmId] = useState('')
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [motif, setMotif] = useState('PERMISSION')
  const [commentaire, setCommentaire] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    const [{ data: people }, { data: absences, error }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'vm').eq('actif', true).order('full_name'),
      (supabase as any).from('absences_vm').select('*, profiles!absences_vm_vm_id_fkey(full_name)').eq('statut', 'VALIDEE').order('date_debut', { ascending: false }).limit(150)
    ])
    setVms((people ?? []) as VM[])
    setRows((absences ?? []) as Absence[])
    if (error) setMessage({ ok: false, text: error.message })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function enregistrer() {
    if (!vmId || !debut || !fin || fin < debut || !profile?.id) return
    setSaving(true); setMessage(null)
    const { error } = await (supabase as any).from('absences_vm').insert({
      vm_id: vmId, date_debut: debut, date_fin: fin, motif,
      commentaire: commentaire.trim() || null, cree_par: profile.id, valide_par: profile.id
    })
    setSaving(false)
    if (error) setMessage({ ok: false, text: error.message })
    else {
      setMessage({ ok: true, text: 'Absence validée. Les journées concernées sont neutralisées dans les taux de réalisation.' })
      setDebut(''); setFin(''); setCommentaire('')
      await load()
    }
  }

  async function annuler(id: string) {
    if (!window.confirm('Annuler cette absence ? Les journées seront réintégrées dans le calcul du rendement.')) return
    const { error } = await (supabase as any).from('absences_vm').update({ statut: 'ANNULEE' }).eq('id', id)
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: 'Absence annulée et calculs rétablis.' })
    if (!error) await load()
  }

  const nomMotif = (value: string) => MOTIFS.find(m => m.value === value)?.label ?? value
  return <div className="space-y-6">
    <div>
      <div className="flex items-center gap-2 text-royal-600 mb-2"><IconCalendar className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Gestion du personnel</span></div>
      <h1 className="text-2xl font-extrabold text-ink-900">Permissions & maladies</h1>
      <p className="text-sm text-ink-500 mt-1">Validez une absence pour neutraliser les jours concernés dans le rendement hebdomadaire du VM.</p>
    </div>

    <Card>
      <h2 className="text-base font-bold text-ink-800 mb-1">Enregistrer une absence</h2>
      <p className="text-xs text-ink-400 mb-5">Seules les absences validées ici sont prises en compte dans les calculs.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-sm font-semibold text-ink-700 sm:col-span-2">Délégué médical
          <select value={vmId} onChange={e => setVmId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white p-3 text-sm">
            <option value="">Choisir un VM</option>{vms.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-ink-700">Du
          <input type="date" value={debut} onChange={e => { setDebut(e.target.value); if (!fin || fin < e.target.value) setFin(e.target.value) }} className="mt-1 w-full rounded-xl border border-ink-200 p-3 text-sm" />
        </label>
        <label className="block text-sm font-semibold text-ink-700">Au
          <input type="date" min={debut || undefined} value={fin} onChange={e => setFin(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 p-3 text-sm" />
        </label>
        <label className="block text-sm font-semibold text-ink-700">Motif
          <select value={motif} onChange={e => setMotif(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-200 bg-white p-3 text-sm">{MOTIFS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        </label>
        <label className="block text-sm font-semibold text-ink-700">Commentaire (facultatif)
          <input value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Précision utile" className="mt-1 w-full rounded-xl border border-ink-200 p-3 text-sm" />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-400">Les visites programmées restent visibles dans l'historique.</p>
        <Button loading={saving} disabled={!vmId || !debut || !fin || fin < debut} onClick={enregistrer}>Valider l'absence</Button>
      </div>
      {message && <p className={`mt-4 rounded-xl p-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
    </Card>

    <Card>
      <div className="flex items-center justify-between mb-4"><div><h2 className="text-base font-bold text-ink-800">Absences validées</h2><p className="text-xs text-ink-400">Les jours de ces périodes sont exclus du dénominateur du taux.</p></div><span className="rounded-full bg-royal-50 px-3 py-1 text-xs font-bold text-royal-700">{rows.length}</span></div>
      {loading ? <p className="text-sm text-ink-400 py-6">Chargement…</p> : rows.length === 0 ? <p className="text-sm text-ink-400 py-6 text-center">Aucune absence enregistrée.</p> : <div className="space-y-2">
        {rows.map(a => <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-ink-100 p-3">
          <div className="min-w-0"><p className="font-bold text-sm text-ink-800">{a.profiles?.full_name ?? 'VM'}</p><p className="text-xs text-ink-500">{new Date(a.date_debut + 'T12:00:00').toLocaleDateString('fr-FR')} — {new Date(a.date_fin + 'T12:00:00').toLocaleDateString('fr-FR')} · {nomMotif(a.motif)}</p>{a.commentaire && <p className="text-xs text-ink-400 mt-1">{a.commentaire}</p>}</div>
          <Button size="sm" variant="secondary" onClick={() => annuler(a.id)}>Annuler</Button>
        </div>)}
      </div>}
    </Card>
    <div className="rounded-xl bg-blue-50 p-4 flex gap-3 text-sm text-blue-800"><IconCheckCircle className="h-5 w-5 shrink-0" /><p><strong>Exemple :</strong> objectif initial de 90 visites, deux jours neutralisés à 18 visites chacun : objectif ajusté de 54. Avec 50 visites réalisées, le taux devient 92,6 %.</p></div>
  </div>
}
