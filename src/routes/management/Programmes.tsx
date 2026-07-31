import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCheckCircle, IconX } from '@/components/ui/icons'
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

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink-800 font-display">Validation des programmes</h1>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-2">En attente de validation ({soumis.length})</p>
        <div className="space-y-3">
          {soumis.length === 0 && <Card className="text-sm text-ink-400 text-center py-6">Rien à valider pour le moment.</Card>}
          {soumis.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink-800">{p.profiles?.full_name}</p>
                  <p className="text-xs text-ink-400">Semaine du {dayjs(p.semaine_debut).format('DD/MM/YYYY')} · soumis le {dayjs(p.soumis_at).format('DD/MM HH:mm')}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rejeter(p.id)} disabled={busy === p.id} className="rounded-full p-2 bg-red-50 text-red-600"><IconX className="h-4 w-4" /></button>
                  <button onClick={() => valider(p.id)} disabled={busy === p.id} className="rounded-full p-2 bg-emerald-50 text-emerald-600"><IconCheckCircle className="h-4 w-4" /></button>
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
      </div>

      <div>
        <p className="text-sm font-bold text-ink-600 mb-2">Historique récent</p>
        <div className="space-y-2">
          {autres.map((p) => (
            <Card key={p.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-ink-800">{p.profiles?.full_name}</p>
                <p className="text-xs text-ink-400">Semaine du {dayjs(p.semaine_debut).format('DD/MM/YYYY')}</p>
              </div>
              <Badge tone={p.statut === 'VERROUILLE' ? 'info' : 'success'}>{p.statut}</Badge>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
