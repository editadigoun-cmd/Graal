import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'
import type { Database } from '@/types/database'
import { getOfflineSnapshot, saveOfflineSnapshot } from '@/lib/offlineCache'

export type LigneStatut = Database['public']['Views']['v_lignes_avec_statut']['Row']

export function useVisitesDuJour() {
  const { session } = useAuth()
  const [lignes, setLignes] = useState<LigneStatut[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const day = todayBenin().format('YYYY-MM-DD')
    const cacheKey = `visites-du-jour:${day}`

    if (!navigator.onLine) {
      const cached = await getOfflineSnapshot<LigneStatut[]>(session.user.id, cacheKey)
      setLignes(cached?.data ?? [])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('v_lignes_avec_statut')
      .select('*')
      .eq('vm_id', session.user.id)
      .eq('date_visite', day)
      .order('jour')

    if (error) {
      const cached = await getOfflineSnapshot<LigneStatut[]>(session.user.id, cacheKey)
      if (cached) setLignes(cached.data)
    } else {
      const rows = data ?? []
      setLignes(rows)
      await saveOfflineSnapshot(session.user.id, cacheKey, rows)

      // Précharger les fiches détaillées de toutes les visites du jour pour pouvoir
      // ouvrir une visite programmée même si le réseau est coupé ensuite.
      const lineIds = rows.map((row) => row.programme_ligne_id).filter(Boolean)
      if (lineIds.length > 0) {
        const { data: details } = await supabase
          .from('programme_lignes').select('*, clients(*)').in('id', lineIds)
        if (details) {
          await Promise.all(details.map((line) =>
            saveOfflineSnapshot(session.user.id, `programme-ligne:${line.id}`, line)
          ))
        }
      }
    }
    setLoading(false)
  }, [session])

  useEffect(() => {
    void load()
    window.addEventListener('online', load)
    return () => window.removeEventListener('online', load)
  }, [load])

  return { lignes, loading, reload: load }
}
