import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from '@/components/ui/TopBar'
import { BottomNav } from '@/components/ui/BottomNav'
import { Watermark } from '@/components/ui/Watermark'
import { useAuth } from '@/features/auth/AuthProvider'
import { prechargerDonneesHorsLigne } from '@/lib/offlinePrefetch'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useOfflineClotureSync } from '@/hooks/useOfflineClotureSync'

export function VmShell() {
  const { profile, session } = useAuth()

  useEffect(() => {
    const vmId = session?.user.id
    if (!vmId) return

    let actif = true
    let prechargementEnCours = false

    const precharger = async () => {
      if (!actif || !navigator.onLine || prechargementEnCours) return

      prechargementEnCours = true
      try {
        await prechargerDonneesHorsLigne(vmId)
      } catch (error) {
        console.warn('Préchargement hors connexion interrompu :', error)
      } finally {
        prechargementEnCours = false
      }
    }

    void precharger()
    window.addEventListener('online', precharger)

    return () => {
      actif = false
      window.removeEventListener('online', precharger)
    }
  }, [session?.user.id])

  const unread = useUnreadNotifications()
  const location = useLocation()
  const { online, pending, syncing } = useOfflineSync()
  const { hasPending: cloturePending, syncing: clotureSyncing } = useOfflineClotureSync()
  const enAttente = pending + (cloturePending ? 1 : 0)
  const enCours = syncing || clotureSyncing

  return (
    <div className="graal-surface min-h-screen bg-[#F5F8FA]">
      <Watermark nom={profile?.full_name ?? ''} />
      <div className="mx-auto w-full max-w-2xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-28 sm:px-6">
        <TopBar name={profile?.full_name ?? ''} avatarUrl={profile?.avatar_url} notificationsCount={unread} />
        {(!online || enAttente > 0) && (
          <div className={`mb-3 flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold ${!online ? 'bg-ink-800 text-white' : 'bg-flame-50 text-flame-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${!online ? 'bg-flame-400' : 'bg-flame-500'} ${enCours ? 'animate-pulse' : ''}`} />
            {!online
              ? `Hors ligne — ${enAttente > 0 ? `${enAttente} élément(s) en attente de synchronisation` : 'les saisies seront synchronisées au retour du réseau'}`
              : `Synchronisation de ${enAttente} élément(s) en cours…`}
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  )
}
