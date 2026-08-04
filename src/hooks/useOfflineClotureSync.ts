import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPendingCloture, clearPendingCloture } from '@/lib/offlineCloture'
import { useOnlineStatus } from './useOnlineStatus'

/** Synchronise automatiquement la clôture de journée saisie hors-ligne dès le retour du réseau. */
export function useOfflineClotureSync() {
  const online = useOnlineStatus()
  const [syncing, setSyncing] = useState(false)
  const [hasPending, setHasPending] = useState(false)

  const refresh = useCallback(() => {
    getPendingCloture().then((p) => setHasPending(!!p))
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('graal:offline-cloture-changed', refresh)
    return () => window.removeEventListener('graal:offline-cloture-changed', refresh)
  }, [refresh])

  const flush = useCallback(async () => {
    if (syncing) return
    const pending = await getPendingCloture()
    if (!pending) return
    setSyncing(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData.session?.user.id
      if (!uid) return

      for (const m of pending.motifsLocaux) {
        await supabase.from('visite_manquante_motifs').insert({
          programme_ligne_id: m.programmeLigneId, motif_id: m.motifId, commentaire: m.commentaire, cree_par: uid
        })
        // best-effort : une ligne déjà traitée entre-temps (ou déjà en motif) échoue silencieusement,
        // le RPC cloturer_journee ci-dessous revalidera de toute façon qu'il ne reste rien en attente.
      }

      const path = `${uid}/${pending.jour}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage.from('fiches-papier')
        .upload(path, pending.photoBlob, { contentType: pending.photoType })
      if (uploadError) return // reste en file, nouvelle tentative à la prochaine reconnexion

      const { error: rpcError } = await supabase.rpc('cloturer_journee', {
        p_photo_path: path, p_photo_latitude: pending.latitude, p_photo_longitude: pending.longitude
      })
      if (rpcError) return

      await clearPendingCloture()
    } finally {
      setSyncing(false)
    }
  }, [syncing])

  useEffect(() => {
    if (online) flush()
  }, [online, flush])

  return { syncing, hasPending, flush }
}
