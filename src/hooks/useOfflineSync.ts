import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { peekQueue, queueLength, removeFromQueue } from '@/lib/offlineQueue'
import { useOnlineStatus } from './useOnlineStatus'
import type { Database } from '@/types/database'

type VisiteInsert = Database['public']['Tables']['visites']['Insert']

/** Synchronise automatiquement la file de visites saisies hors-ligne dès le retour du réseau. */
export function useOfflineSync() {
  const online = useOnlineStatus()
  const [pending, setPending] = useState(queueLength())
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(() => setPending(queueLength()), [])

  useEffect(() => {
    window.addEventListener('graal:offline-queue-changed', refresh)
    return () => window.removeEventListener('graal:offline-queue-changed', refresh)
  }, [refresh])

  const flush = useCallback(async () => {
    if (syncing) return
    const items = peekQueue()
    if (items.length === 0) return
    setSyncing(true)
    for (const item of items) {
      const { data: visite, error } = await supabase.from('visites').insert(item.payload as VisiteInsert).select('id').single()
      if (!error) {
        if (item.produits.length && visite) {
          await supabase.from('visite_produits').insert(item.produits.map((pid) => ({ visite_id: visite.id, produit_id: pid })))
        }
        removeFromQueue(item.localId)
      }
      // en cas d'erreur (ex: journée déjà clôturée entre-temps), l'entrée reste en file
      // pour inspection manuelle plutôt que d'être perdue silencieusement.
    }
    setSyncing(false)
    refresh()
  }, [syncing, refresh])

  useEffect(() => {
    if (online) flush()
  }, [online, flush])

  return { online, pending, syncing, flush }
}
