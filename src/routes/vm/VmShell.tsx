import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from '@/components/ui/TopBar'
import { BottomNav } from '@/components/ui/BottomNav'
import { useAuth } from '@/features/auth/AuthProvider'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'

export function VmShell() {
  const { profile } = useAuth()
  const unread = useUnreadNotifications()
  const location = useLocation()

  return (
    <div className="graal-surface min-h-screen">
      <div className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
        <TopBar name={profile?.full_name ?? ''} avatarUrl={profile?.avatar_url} notificationsCount={unread} />
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
