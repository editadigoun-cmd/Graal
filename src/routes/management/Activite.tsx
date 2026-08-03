import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconActivity, IconSearch, IconUser, IconUsers, IconSettings, IconCalendar, IconCheckCircle, IconChat } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/fr'

dayjs.extend(relativeTime)
dayjs.locale('fr')

type ActivityRow = Database['public']['Tables']['activity_log']['Row']

const ENTITY_LABEL: Record<string, string> = {
  profiles: 'Comptes',
  equipes: 'Équipes',
  parametres: 'Paramètres',
  programmes_hebdomadaires: 'Programmes',
  clotures_journalieres: 'Clôtures',
  reporting_hebdomadaire: 'Reporting'
}

const ENTITY_ICON: Record<string, typeof IconUser> = {
  profiles: IconUser,
  equipes: IconUsers,
  parametres: IconSettings,
  programmes_hebdomadaires: IconCalendar,
  clotures_journalieres: IconCheckCircle,
  reporting_hebdomadaire: IconChat
}

export default function ManagementActivite() {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  useEffect(() => {
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data }: { data: ActivityRow[] | null }) => {
        setRows(data ?? [])
        setLoading(false)
      })
  }, [])

  const entityTypes = useMemo(() => Array.from(new Set(rows.map((r) => r.entity_type))), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (entityFilter && r.entity_type !== entityFilter) return false
      if (q && !r.actor_name.toLowerCase().includes(q) && !r.action.toLowerCase().includes(q) && !(r.entity_label ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, entityFilter])

  if (loading) return <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-96" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Journal d'activité</h1>
        <p className="text-sm text-ink-400">Historique de toutes les actions menées sur la plateforme</p>
      </div>

      <Card className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par personne, action…"
            className="w-full rounded-xl border border-ink-200 pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
          />
        </div>
        <select
          value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
        >
          <option value="">Toutes les catégories</option>
          {entityTypes.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t] ?? t}</option>)}
        </select>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-10">Aucune activité ne correspond à ces filtres.</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {filtered.map((r) => {
              const Icon = ENTITY_ICON[r.entity_type] ?? IconActivity
              return (
                <div key={r.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-royal-50 text-royal-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-700">
                      <span className="font-semibold text-ink-800">{r.actor_name}</span> — {r.action}
                      {r.entity_label && <span className="text-ink-500"> : {r.entity_label}</span>}
                    </p>
                    <p className="text-[11px] text-ink-400 mt-0.5">{dayjs(r.created_at).fromNow()} · {dayjs(r.created_at).format('DD/MM/YYYY HH:mm')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
