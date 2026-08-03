import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Profile = Database['public']['Tables']['profiles']['Row']
type RapportDuo = Database['public']['Tables']['rapports_duo']['Row'] & { profiles: { full_name: string } | null }

const CRITERES = [
  { key: 'connaissance_produits', label: 'Connaissance produits' },
  { key: 'maitrise_portefeuille', label: 'Maîtrise du portefeuille' },
  { key: 'relationnel', label: 'Relationnel' }
] as const

const EMPTY_FORM = { vm_id: '', connaissance_produits: 3, maitrise_portefeuille: 3, relationnel: 3, commentaire: '' }

export default function ManagementRapportsDuo() {
  const { profile } = useAuth()
  const [vms, setVms] = useState<Profile[]>([])
  const [rapports, setRapports] = useState<RapportDuo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    const [{ data: pr }, { data: rd }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'vm').order('full_name'),
      supabase.from('rapports_duo').select('*, profiles!rapports_duo_vm_id_fkey(full_name)').order('jour', { ascending: false }).limit(20)
    ])
    setVms(pr ?? [])
    setRapports((rd as unknown as RapportDuo[]) ?? [])
    if (!form.vm_id && pr && pr.length > 0) setForm((f) => ({ ...f, vm_id: pr[0].id }))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function soumettre(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !form.vm_id) return
    setSaving(true)
    setNotice(null)
    const { error } = await supabase.from('rapports_duo').insert({
      superviseur_id: profile.id,
      vm_id: form.vm_id,
      connaissance_produits: form.connaissance_produits,
      maitrise_portefeuille: form.maitrise_portefeuille,
      relationnel: form.relationnel,
      commentaire: form.commentaire || null
    })
    setSaving(false)
    if (error) setNotice({ type: 'error', text: error.message })
    else {
      setNotice({ type: 'success', text: 'Rapport de duo enregistré.' })
      setForm((f) => ({ ...EMPTY_FORM, vm_id: f.vm_id }))
      load()
    }
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-64" /><Skeleton className="h-40" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Rapports de duo terrain</h1>
        <p className="text-sm text-ink-400">Évaluation à produire après une sortie conjointe avec un visiteur médical</p>
      </div>

      {vms.length === 0 ? (
        <Card className="text-sm text-ink-400 text-center py-8">Aucun visiteur médical dans votre périmètre.</Card>
      ) : (
        <Card>
          <form onSubmit={soumettre} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Visiteur médical</label>
              <select
                value={form.vm_id} onChange={(e) => setForm((f) => ({ ...f, vm_id: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              >
                {vms.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
            </div>

            {CRITERES.map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-ink-500">{c.label}</label>
                  <span className="text-xs font-bold text-royal-600">{form[c.key]}/5</span>
                </div>
                <input
                  type="range" min={1} max={5} step={1} value={form[c.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: Number(e.target.value) }))}
                  className="w-full accent-royal-600"
                />
              </div>
            ))}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Commentaire (optionnel)</label>
              <textarea
                value={form.commentaire} onChange={(e) => setForm((f) => ({ ...f, commentaire: e.target.value }))} rows={3}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>

            {notice && (
              <p className={`text-xs rounded-xl px-3 py-2.5 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {notice.text}
              </p>
            )}

            <Button type="submit" loading={saving}>Enregistrer le rapport</Button>
          </form>
        </Card>
      )}

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">Derniers rapports</p>
        {rapports.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-6">Aucun rapport de duo pour l'instant.</Card>
        ) : (
          <div className="space-y-2">
            {rapports.map((r) => (
              <Card key={r.id} className="flex items-center gap-3">
                <Avatar name={r.profiles?.full_name ?? ''} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink-800">{r.profiles?.full_name}</p>
                  <p className="text-[10px] text-ink-400">
                    {dayjs(r.jour).format('DD/MM/YYYY')} · Produits {r.connaissance_produits}/5 · Portefeuille {r.maitrise_portefeuille}/5 · Relationnel {r.relationnel}/5
                  </p>
                  {r.commentaire && <p className="text-[11px] text-ink-500 mt-1">{r.commentaire}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
