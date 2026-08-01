import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconCheckCircle, IconX, IconClock, IconCalendar } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import dayjs from 'dayjs'

interface ProgrammeRow {
  id: string
  semaine_debut: string
  statut: string
  soumis_at: string | null
  vm_id: string
  profiles: { full_name: string } | null
  programme_conformite: { cible: string; quota_attendu: number; quantite_programmee: number; statut: string }[]
}

export default function ManagementProgrammes() {
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('programmes_hebdomadaires')
      .select('*, profiles(full_name), programme_conformite(cible, quota_attendu, quantite_programmee, statut)')
      .in('statut', ['SOUMIS', 'VALIDE', 'VERROUILLE'])
      .order('soumis_at', { ascending: false })
      .limit(30)
    setProgrammes((data as unknown as ProgrammeRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function valider(id: string) {
    setBusy(id)
    const { error } = await supabase.rpc('valider_programme_hebdomadaire', { p_programme_id: id })
    setBusy(null)
    if (!error) load()
  }

  async function rejeter(id: string) {
    setBusy(id)
    const { error } = await supabase.rpc('rejeter_programme_hebdomadaire', { p_programme_id: id, p_motif: 'À revoir avec votre superviseur.' })
    setBusy(null)
    if (!error) load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>

  const soumis = programmes.filter((p) => p.statut === 'SOUMIS')
  const autres = programmes.filter((p) => p.statut !== 'SOUMIS')
  const valides = programmes.filter((p) => p.statut === 'VALIDE' || p.statut === 'VERROUILLE').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Validation des programmes</h1>
        <p className="text-sm text-ink-400">Programmes hebdomadaires soumis par les visiteurs médicaux</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="En attente" value={soumis.length} tone="flame" icon={<IconClock className="h-4 w-4" />} />
        <StatCard label="Validés" value={valides} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="Total récent" value={programmes.length} tone="royal" icon={<IconCalendar className="h-4 w-4" />} />
      </div>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">En attente de validation ({soumis.length})</p>
        {soumis.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-6">Rien à valider pour le moment.</Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {soumis.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-ink-800">{p.profiles?.full_name}</p>
                    <p className="text-xs text-ink-400">Semaine du {dayjs(p.semaine_debut).format('DD/MM/YYYY')} · soumis le {dayjs(p.soumis_at).format('DD/MM HH:mm')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => rejeter(p.id)} disabled={busy === p.id} className="rounded-full p-2 bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50"><IconX className="h-4 w-4" /></button>
                    <button onClick={() => valider(p.id)} disabled={busy === p.id} className="rounded-full p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition disabled:opacity-50"><IconCheckCircle className="h-4 w-4" /></button>
                  </div>
                </div>
                {p.programme_conformite?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.programme_conformite.map((c) => (
                      <Badge key={c.cible} tone={c.statut === 'CONFORME' ? 'success' : c.statut === 'SOUS_COUVERT' ? 'warning' : 'info'}>
                        {c.cible.replace(/_/g, ' ')}: {c.quantite_programmee}/{c.quota_attendu}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-3">Historique récent</p>
        {autres.length === 0 ? (
          <Card className="text-sm text-ink-400 text-center py-6">Aucun programme dans l'historique récent.</Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                    <th className="px-4 py-3 text-left font-semibold">Visiteur médical</th>
                    <th className="px-4 py-3 text-left font-semibold">Semaine</th>
                    <th className="px-4 py-3 text-left font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {autres.map((p) => (
                    <tr key={p.id} className="transition hover:bg-ink-50/60">
                      <td className="px-4 py-3 font-semibold text-ink-800">{p.profiles?.full_name}</td>
                      <td className="px-4 py-3 text-ink-500">{dayjs(p.semaine_debut).format('DD/MM/YYYY')}</td>
                      <td className="px-4 py-3"><Badge tone={p.statut === 'VERROUILLE' ? 'info' : 'success'}>{p.statut}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
