import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'
import type { Database } from '@/types/database'

export type LigneStatut = Database['public']['Views']['v_lignes_avec_statut']['Row']

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
    setLignes(data ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  return { lignes, loading, reload: load }
}
