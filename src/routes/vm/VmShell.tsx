import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from '@/components/ui/TopBar'
import { BottomNav } from '@/components/ui/BottomNav'
import { useAuth } from '@/features/auth/AuthProvider'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import { useOfflineSync } from '@/hooks/useOfflineSync'

export function VmShell() {
  const { profile } = useAuth()
  const unread = useUnreadNotifications()
  const location = useLocation()
  const { online, pending, syncing } = useOfflineSync()

  return (
    <div className="graal-surface min-h-screen">
      <div className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
        <TopBar name={profile?.full_name ?? ''} avatarUrl={profile?.avatar_url} notificationsCount={unread} />
        {(!online || pending > 0) && (
          <div className={`mb-3 flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold ${!online ? 'bg-ink-800 text-white' : 'bg-flame-50 text-flame-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${!online ? 'bg-flame-400' : 'bg-flame-500'} ${syncing ? 'animate-pulse' : ''}`} />
            {!online
              ? `Hors ligne — ${pending > 0 ? `${pending} visite(s) en attente de synchronisation` : 'les visites saisies seront synchronisées au retour du réseau'}`
              : `Synchronisation de ${pending} visite(s) en cours…`}
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
