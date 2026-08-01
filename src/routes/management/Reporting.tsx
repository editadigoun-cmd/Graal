import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconChat, IconCheckCircle, IconClock } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { isoWeekMonday } from '@/lib/time'
import dayjs from 'dayjs'

interface ReportingRow {
  id: string
  vm_id: string
  semaine_debut: string
  analyse_generale: string | null
  points_forts: string | null
  veille_concurrentielle: string | null
  suggestions: string | null
  appreciation_personnelle: string | null
  appreciation_superviseur: string | null
  recommandations_superviseur: string | null
  visa_superviseur_id: string | null
  profiles: { full_name: string } | null
}

export default function ManagementReporting() {
  const [rows, setRows] = useState<ReportingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, { appreciation: string; recommandations: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const semaineDebut = isoWeekMonday().format('YYYY-MM-DD')

  async function load() {
    const { data } = await supabase
      .from('reporting_hebdomadaire')
      .select('*, profiles!reporting_hebdomadaire_vm_id_fkey(full_name)')
      .eq('semaine_debut', semaineDebut)
      .order('created_at', { ascending: false })
    setRows((data as unknown as ReportingRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function viser(id: string) {
    const draft = drafts[id]
    setSaving(id)
    const { data: session } = await supabase.auth.getSession()
    await supabase.from('reporting_hebdomadaire').update({
      appreciation_superviseur: draft?.appreciation || null,
      recommandations_superviseur: draft?.recommandations || null,
      visa_superviseur_id: session.session?.user.id
    }).eq('id', id)
    setSaving(null)
    load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>

  const visesCount = rows.filter((r) => r.visa_superviseur_id).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Reporting hebdomadaire</h1>
        <p className="text-sm text-ink-400">Semaine du {dayjs(semaineDebut).format('DD/MM/YYYY')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Reportings soumis" value={rows.length} tone="royal" icon={<IconChat className="h-4 w-4" />} />
        <StatCard label="Visés" value={visesCount} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="En attente" value={rows.length - visesCount} tone="flame" icon={<IconClock className="h-4 w-4" />} />
      </div>

      {rows.length === 0 && <Card className="text-center py-10 text-sm text-ink-400">Aucun reporting soumis pour cette semaine.</Card>}

      {rows.map((r) => {
        const draft = drafts[r.id] ?? { appreciation: r.appreciation_superviseur ?? '', recommandations: r.recommandations_superviseur ?? '' }
        return (
          <Card key={r.id}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-ink-800">{r.profiles?.full_name}</p>
              {r.visa_superviseur_id ? <Badge tone="success">Visé</Badge> : <Badge tone="warning">En attente</Badge>}
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs mb-3">
              <Field label="Analyse générale" value={r.analyse_generale} />
              <Field label="Points forts" value={r.points_forts} />
              <Field label="Veille concurrentielle" value={r.veille_concurrentielle} />
              <Field label="Suggestions" value={r.suggestions} />
              <Field label="Appréciation personnelle" value={r.appreciation_personnelle} className="md:col-span-2" />
            </div>
            <div className="border-t border-ink-100 pt-3 space-y-2">
              <textarea
                value={draft.appreciation}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...draft, appreciation: e.target.value } }))}
                placeholder="Appréciation du superviseur…" rows={2}
                className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
              />
              <textarea
                value={draft.recommandations}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...draft, recommandations: e.target.value } }))}
                placeholder="Recommandations…" rows={2}
                className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm"
              />
              <Button size="sm" loading={saving === r.id} onClick={() => viser(r.id)}>
                {r.visa_superviseur_id ? 'Mettre à jour le visa' : 'Viser'}
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Field({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="font-semibold text-ink-500">{label}</p>
      <p className="text-ink-700 mt-0.5">{value || '—'}</p>
    </div>
  )
}
