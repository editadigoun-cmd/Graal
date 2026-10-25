import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'
import type { Database } from '@/types/database'

export type LigneStatut = Database['public']['Views']['v_lignes_avec_statut']['Row'] & { centre?: string | null }

export function useVisitesDuJour() {
  const { session } = useAuth()
  const [lignes, setLignes] = useState<LigneStatut[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const { data } = await supabase
      .from('v_lignes_avec_statut')
      .select('*')
      .eq('vm_id', session.user.id)
      .eq('date_visite', todayBenin().format('YYYY-MM-DD'))
      .order('jour')
    const rows = data ?? []
    const clientIds = [...new Set(rows.map((r) => r.client_id).filter((id): id is string => !!id))]
    const centres = new Map<string, string | null>()
    if (clientIds.length) {
      const { data: clients } = await supabase.from('clients').select('id, centre').in('id', clientIds)
      ;(clients ?? []).forEach((c) => centres.set(c.id, c.centre))
    }
    setLignes(rows.map((r) => ({ ...r, centre: r.client_id ? centres.get(r.client_id) ?? null : null })))
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  return { lignes, loading, reload: load }
}
