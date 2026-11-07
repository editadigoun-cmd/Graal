import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconSearch, IconChevronRight, IconAlert } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type ClientFreq = Database['public']['Views']['v_client_frequence']['Row']

export default function Portefeuille() {
  const { profile } = useAuth()
  const [clients, setClients] = useState<ClientFreq[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const isFawaz = (profile?.full_name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes('FAWAZ')
  const secteurLabel = !isFawaz && profile?.secteur
    ? `Secteur ${profile.secteur} uniquement`
    : null

  useEffect(() => {
    supabase.from('v_client_frequence').select('*').order('nom')
      .then(({ data }) => {
        setClients(data ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(
    () => clients.filter((c) => (c.nom ?? '').toLowerCase().includes(query.toLowerCase())),
    [clients, query]
  )

  return (
    <div className="space-y-5 mt-2 pb-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600">Mon activité</p><h1 className="provisit-page-title mt-1">Portefeuille clients</h1><p className="mt-1 text-sm text-ink-400">Retrouvez vos clients et suivez leur fréquence de visite.</p></div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-royal-50 text-royal-700 ring-1 ring-royal-100"><IconSearch className="h-5 w-5" /></div>
        </div>
        {secteurLabel && (
          <div className="flex items-center gap-2 rounded-xl border border-royal-200 bg-royal-50 px-3 py-2.5 text-sm font-semibold text-royal-800" role="status">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-royal-600" />
            <span>{secteurLabel}</span>
          </div>
        )}
      </div>

      <div className="relative rounded-2xl border border-ink-100 bg-white p-1 shadow-sm">
        <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un client…"
          className="w-full rounded-xl border-0 bg-transparent py-3 pl-10 pr-4 text-sm outline-none placeholder:text-ink-400 focus:ring-0"
        />
      </div>

      {loading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}

      {!loading && filtered.length === 0 && (
        <Card className="text-center py-10 text-sm text-ink-400">Aucun client trouvé.</Card>
      )}

      {filtered.map((c) => (
        <Link key={c.client_id} to={`/app/portefeuille/${c.client_id}`}>
          <Card className="group flex items-center justify-between gap-3 border border-ink-100 bg-white/95 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-royal-200 hover:shadow-md">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-ink-800">{c.nom}</p>
                {!c.frequence_respectee && <IconAlert className="h-3.5 w-3.5 text-flame-500 flex-shrink-0" />}
              </div>
              <div className="mt-1 flex items-center gap-2">
                {c.potentiel && <PotentielBadge potentiel={c.potentiel} compact />}
                <span className="text-[11px] text-ink-400">
                  {c.visites_mois_courant ?? 0}/{c.frequence_visite_mensuelle} visites ce mois
                </span>
              </div>
            </div>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-400 transition-colors group-hover:bg-royal-50 group-hover:text-royal-600"><IconChevronRight className="h-4 w-4" /></span>
          </Card>
        </Link>
      ))}
    </div>
  )
}
