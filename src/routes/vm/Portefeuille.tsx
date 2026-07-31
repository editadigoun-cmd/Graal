import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconSearch, IconChevronRight, IconAlert } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type ClientFreq = Database['public']['Views']['v_client_frequence']['Row']

export default function Portefeuille() {
  const [clients, setClients] = useState<ClientFreq[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

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
    <div className="space-y-3 mt-2 pb-4">
      <h1 className="text-lg font-bold text-ink-800 font-display">Portefeuille clients</h1>

      <div className="relative">
        <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un client…"
          className="w-full rounded-2xl border border-ink-200 bg-white/80 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
        />
      </div>

      {loading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}

      {!loading && filtered.length === 0 && (
        <Card className="text-center py-10 text-sm text-ink-400">Aucun client trouvé.</Card>
      )}

      {filtered.map((c) => (
        <Link key={c.client_id} to={`/app/portefeuille/${c.client_id}`}>
          <Card className="flex items-center justify-between py-3.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink-800 truncate">{c.nom}</p>
                {!c.frequence_respectee && <IconAlert className="h-3.5 w-3.5 text-flame-500 flex-shrink-0" />}
              </div>
              <div className="mt-1 flex items-center gap-2">
                {c.potentiel && <PotentielBadge potentiel={c.potentiel} compact />}
                <span className="text-[11px] text-ink-400">
                  {c.visites_mois_courant ?? 0}/{c.frequence_visite_mensuelle} visites ce mois
                </span>
              </div>
            </div>
            <IconChevronRight className="h-4 w-4 text-ink-300 flex-shrink-0" />
          </Card>
        </Link>
      ))}
    </div>
  )
}
