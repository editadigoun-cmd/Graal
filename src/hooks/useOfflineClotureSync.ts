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
    getPendingCloture().then((p) => setHasPending(!!p)).catch((error) => {
      console.error('Impossible de lire la clôture hors ligne en attente :', error)
    })
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
        // La contrainte UNIQUE(programme_ligne_id) rend cette reprise idempotente.
        // En cas d'erreur, on conserve toute la clôture locale pour réessayer sans perte.
        const { error: motifError } = await supabase.from('visite_manquante_motifs').upsert({
          programme_ligne_id: m.programmeLigneId,
          motif_id: m.motifId,
          commentaire: m.commentaire,
          cree_par: uid
        }, { onConflict: 'programme_ligne_id' })
        if (motifError) {
          console.error('Échec de synchronisation d’un motif de visite manquante :', motifError)
          return
        }
      }

      const paths: string[] = []
      const blobs = pending.photoBlobs?.length
        ? pending.photoBlobs
        : pending.photoBlob ? [pending.photoBlob] : []
      const types = pending.photoTypes?.length
        ? pending.photoTypes
        : [pending.photoType || blobs[0]?.type || 'image/jpeg']
      if (blobs.length === 0) return
      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i]
        const type = types[i] || blob.type || 'image/jpeg'
        const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
        const batchId = pending.createdAt.replace(/[^0-9]/g, '').slice(0, 17) || 'pending'
        const path = `${uid}/${pending.jour}-${batchId}-${i + 1}.${extension}`
        const { error: uploadError } = await supabase.storage.from('fiches-papier')
          .upload(path, blob, { contentType: type, upsert: true })
        if (uploadError) return
        paths.push(path)
      }

      const { error: rpcError } = await (supabase as any).rpc('cloturer_journee_multi', {
        p_photo_paths: paths, p_photo_latitude: pending.latitude, p_photo_longitude: pending.longitude,
        p_reports: pending.reports ?? []
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
