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
    if (syncing || !online) return
    const items = peekQueue()
    if (items.length === 0) return
    setSyncing(true)
    try {
      for (const item of items) {
        // L'identifiant local stable rend la reprise idempotente après une coupure réseau
        // survenue après l'insertion serveur mais avant la confirmation locale.
        const payload = { ...item.payload, id: item.localId } as VisiteInsert
        const { error: insertError } = await supabase.from('visites').insert(payload)
        if (insertError) {
          const { data: existing, error: lookupError } = await supabase
            .from('visites').select('id').eq('id', item.localId).maybeSingle()
          if (lookupError || !existing) continue
        }

        if (item.produits.length > 0) {
          const rows = item.produits.map((pid) => ({ visite_id: item.localId, produit_id: pid }))
          const { error: productsError } = await supabase
            .from('visite_produits').upsert(rows, { onConflict: 'visite_id,produit_id', ignoreDuplicates: true })
          if (productsError) continue
        }
        removeFromQueue(item.localId)
      }
    } catch (error) {
      console.error('Échec de synchronisation des visites hors ligne :', error)
    } finally {
      setSyncing(false)
      refresh()
    }
  }, [syncing, online, refresh])

  useEffect(() => {
    if (online) flush()
  }, [online, flush])

  return { online, pending, syncing, flush }
}
