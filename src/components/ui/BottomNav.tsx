import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { IconHome, IconCalendar, IconStethoscope, IconChat, IconUser } from './icons'

const items = [
  { to: '/app', label: 'Accueil', icon: IconHome, end: true },
  { to: '/app/planning', label: 'Planning', icon: IconCalendar },
  { to: '/app/visites', label: 'Visites', icon: IconStethoscope },
  { to: '/app/messages', label: 'Messages', icon: IconChat },
  { to: '/app/profil', label: 'Profil', icon: IconUser }
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
      <div className="glass-nav flex items-center gap-1 rounded-2xl border border-[#163E63]/10 bg-white/95 px-2 py-2 max-w-md w-full justify-between shadow-[0_12px_36px_rgba(22,62,99,.16)]">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="relative flex-1">
            {({ isActive }) => (
              <motion.div
                whileTap={{ scale: 0.92 }}
                className={clsx(
                  'relative flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2 transition-colors',
                  isActive ? 'text-[#163E63]' : 'text-[#93A1AE]'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-2xl bg-[#EAF5F1]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className="relative h-5 w-5" strokeWidth={isActive ? 2.3 : 2} />
                <span className="relative text-[10px] font-semibold">{label}</span>
              </motion.div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
