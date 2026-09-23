import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconAlert, IconCheckCircle } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import dayjs from 'dayjs'

type Ligne = {
  vm_id: string
  vm_nom: string
  client_id: string
  client_nom: string
  mois: string
  nb_programmations_mois: number
  derniere_semaine: string
  niveau: 'VIGILANCE' | 'LIMITE_MENSUELLE' | 'NORMAL'
}

export default function ControleFrequenceClients() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Ligne[]>([])
  const [loading, setLoading] = useState(true)
  const [motif, setMotif] = useState('')
  const [autorisation, setAutorisation] = useState<Ligne | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    let q = supabase.from('v_clients_programmes_frequents').select('*').in('niveau', ['VIGILANCE', 'LIMITE_MENSUELLE']).order('mois', { ascending: false }).order('nb_programmations_mois', { ascending: false })
    if (profile?.role !== 'admin') q = q.eq('vm_id', profile?.id)
    const { data } = await q
    setRows((data ?? []) as Ligne[])
    setLoading(false)
  }

  useEffect(() => { if (profile) load() }, [profile])

  async function donnerAccesMarketing() {
    if (!autorisation || profile?.role !== 'admin' || !motif.trim()) return
    setSaving(true)
    const debut = dayjs(autorisation.mois).startOf('month').format('YYYY-MM-DD')
    const fin = dayjs(autorisation.mois).endOf('month').format('YYYY-MM-DD')
    const { error } = await supabase.from('autorisations_frequence_client').insert({
      vm_id: autorisation.vm_id,
      client_id: autorisation.client_id,
      date_debut: debut,
      date_fin: fin,
      motif: motif.trim(),
      autorise_par: profile.id,
      actif: true
    })
    setSaving(false)
    if (!error) {
      setAutorisation(null)
      setMotif('')
      load()
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Contrôle de fréquence des clients</h1>
        <p className="text-sm text-ink-400 mt-1">Un client ne peut être programmé qu'une fois par semaine et 3 fois maximum par mois pour une même VM.</p>
      </div>

      <Card className="border-flame-100 bg-flame-50/40">
        <div className="flex gap-3">
          <IconAlert className="h-5 w-5 text-flame-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-ink-700">Vigilance automatique</p>
            <p className="text-xs text-ink-500 mt-1">À 2 programmations dans le mois, le client est signalé. À 3, toute nouvelle programmation est bloquée, sauf autorisation marketing accordée par l'administrateur.</p>
          </div>
        </div>
      </Card>

      {loading ? <Card><p className="text-sm text-ink-400">Chargement…</p></Card> : rows.length === 0 ? (
        <Card className="flex items-center gap-3">
          <IconCheckCircle className="h-5 w-5 text-emerald-600" />
          <p className="text-sm font-semibold text-ink-600">Aucun client actuellement signalé.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={`${r.vm_id}-${r.client_id}-${r.mois}`} className="border-ink-100">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-bold text-ink-800">{r.client_nom}</p>
                  <p className="text-xs text-ink-500">VM : {r.vm_nom}</p>
                  <p className="text-xs text-ink-400 mt-1">Mois : {dayjs(r.mois).format('MMMM YYYY')} · {r.nb_programmations_mois} programmation{r.nb_programmations_mois > 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${r.niveau === 'LIMITE_MENSUELLE' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                    {r.niveau === 'LIMITE_MENSUELLE' ? 'Limite atteinte' : 'Vigilance'}
                  </span>
                  {profile?.role === 'admin' && r.niveau === 'LIMITE_MENSUELLE' && (
                    <Button size="sm" onClick={() => setAutorisation(r)}>Autoriser activité marketing</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {autorisation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <Card className="w-full max-w-md">
            <h2 className="text-base font-bold text-ink-800">Autorisation marketing</h2>
            <p className="text-xs text-ink-500 mt-1">{autorisation.client_nom} · {autorisation.vm_nom} · {dayjs(autorisation.mois).format('MMMM YYYY')}</p>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de l'activité marketing…" className="mt-4 w-full rounded-2xl border border-ink-200 p-3 text-sm min-h-24 outline-none focus:border-royal-500" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setAutorisation(null); setMotif('') }}>Annuler</Button>
              <Button disabled={saving || !motif.trim()} onClick={donnerAccesMarketing}>{saving ? 'Enregistrement…' : 'Accorder l’accès'}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
