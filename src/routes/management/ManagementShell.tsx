import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { useAuth } from '@/features/auth/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { IconHome, IconCalendar, IconUsers, IconSettings, IconLogout, IconBell, IconChat, IconActivity, IconUser, IconClipboard, IconStethoscope, IconMapPin, IconPill, IconTrendingUp, IconBarChart, IconMenu, IconX } from '@/components/ui/icons'
import logoFull from '@/assets/logo-full.svg'
import logoMark from '@/assets/logo-mark.svg'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'

const nav = [
  { to: '/admin', label: 'Tableau de bord', icon: IconHome, end: true, adminOnly: false },
  { to: '/admin/programmes', label: 'Programmes', icon: IconCalendar, end: false, adminOnly: false },
  { to: '/admin/messages', label: 'Messages', icon: IconChat, end: false, adminOnly: false },
  { to: '/admin/suivi-terrain', label: 'Suivi terrain', icon: IconMapPin, end: false, adminOnly: false },
  { to: '/admin/reporting', label: 'Reporting', icon: IconBarChart, end: false, adminOnly: false },
  { to: '/admin/equipes', label: 'Équipes & VM', icon: IconUsers, end: false, adminOnly: false },
  { to: '/admin/clients', label: 'Clients', icon: IconMapPin, end: false, adminOnly: true },
  { to: '/admin/produits', label: 'Produits', icon: IconPill, end: false, adminOnly: true },
  { to: '/admin/pilotage-ventes', label: 'Pilotage des ventes', icon: IconBarChart, end: false, adminOnly: false },
  { to: '/admin/plan-activites', label: "Plan d'activités", icon: IconClipboard, end: false, adminOnly: false },
  { to: '/admin/rapports-duo', label: 'Duo terrain', icon: IconStethoscope, end: false, adminOnly: false },
  { to: '/admin/animation-equipe', label: 'Animation d\'équipe', icon: IconTrendingUp, end: false, adminOnly: false },
  { to: '/admin/indicateurs-animation', label: "Indicateurs d'animation", icon: IconTrendingUp, end: false, adminOnly: true },
  { to: '/admin/activite', label: 'Activité', icon: IconActivity, end: false, adminOnly: false },
  { to: '/admin/parametres', label: 'Paramètres', icon: IconSettings, end: false, adminOnly: true },
  { to: '/admin/profil', label: 'Mon profil', icon: IconUser, end: false, adminOnly: false }
]

const ROLE_LABEL: Record<string, string> = { admin: 'Administrateur', superviseur: 'Superviseur' }

export function ManagementShell() {
  const { profile, signOut } = useAuth()
  const unread = useUnreadNotifications()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const navVisible = nav.filter((n) => !n.adminOnly || profile?.role === 'admin')
  const currentPage = nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))

  return (
    <div className="graal-surface flex h-screen overflow-hidden">
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col border-r border-ink-100/60 bg-white/70 backdrop-blur-xl p-5">
        <div className="flex items-center gap-2.5 px-1 mb-8">
          <img src={logoMark} alt="" className="h-8 w-8" />
          <div>
            <p className="text-sm font-extrabold text-ink-800 font-display leading-none">GRAAL</p>
            <p className="text-[10px] font-semibold text-ink-400 tracking-wide">MEDICAL SOLUTIONS</p>
          </div>
        </div>
        <nav className="space-y-1 flex-1 overflow-y-auto styled-scrollbar pr-1">
          {navVisible.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              {({ isActive }) => (
                <div className={clsx('flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition',
                  isActive ? 'bg-royal-600 text-white shadow-soft' : 'text-ink-500 hover:bg-ink-100')}>
                  <Icon className="h-4.5 w-4.5" />
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink-100 p-2.5">
          <Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink-800 truncate">{profile?.full_name}</p>
            <p className="text-[10px] text-ink-400">{profile ? ROLE_LABEL[profile.role] ?? profile.role : ''}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-2 flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold text-ink-400 hover:bg-red-50 hover:text-red-500 transition"
        >
          <IconLogout className="h-4 w-4" /> Se déconnecter
        </button>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 flex items-center justify-between border-b border-ink-100 bg-white/70 backdrop-blur px-5 md:px-8 py-4">
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-600 shadow-softer"
              aria-label="Ouvrir le menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <img src={logoFull} alt="GRAAL" className="h-8 w-auto" />
          </div>
          <p className="hidden md:block text-sm font-bold text-ink-700">{currentPage?.label ?? 'GRAAL'}</p>
          <div className="flex items-center gap-3">
            {profile?.role === 'admin' && (
              <Link to="/admin/parametres" className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-400 shadow-softer hover:text-royal-600 transition">
                <IconSettings className="h-4.5 w-4.5" />
              </Link>
            )}
            <Link to="/admin/activite" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-500 shadow-softer hover:text-royal-600 transition">
              <IconBell className="h-4.5 w-4.5" />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-flame-500 text-[9px] font-bold text-white flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <Link to="/admin/profil" className="md:hidden">
              <Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={34} />
            </Link>
          </div>
        </header>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="fixed inset-0 z-40 bg-ink-900/40 md:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            >
              <motion.div
                className="absolute left-0 top-0 h-full w-72 max-w-[80vw] bg-white p-5 flex flex-col"
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2.5">
                    <img src={logoMark} alt="" className="h-8 w-8" />
                    <div>
                      <p className="text-sm font-extrabold text-ink-800 font-display leading-none">GRAAL</p>
                      <p className="text-[10px] font-semibold text-ink-400 tracking-wide">MEDICAL SOLUTIONS</p>
                    </div>
                  </div>
                  <button onClick={() => setMenuOpen(false)} className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Fermer le menu">
                    <IconX className="h-5 w-5" />
                  </button>
                </div>
                <nav className="space-y-1 flex-1 overflow-y-auto styled-scrollbar pr-1">
                  {navVisible.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)}>
                      {({ isActive }) => (
                        <div className={clsx('flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition',
                          isActive ? 'bg-royal-600 text-white shadow-soft' : 'text-ink-500 hover:bg-ink-100')}>
                          <Icon className="h-4.5 w-4.5" />
                          {label}
                        </div>
                      )}
                    </NavLink>
                  ))}
                </nav>
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink-100 p-2.5">
                  <Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-ink-800 truncate">{profile?.full_name}</p>
                    <p className="text-[10px] text-ink-400">{profile ? ROLE_LABEL[profile.role] ?? profile.role : ''}</p>
                  </div>
                </div>
                <button
                  onClick={signOut}
                  className="mt-2 flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold text-ink-400 hover:bg-red-50 hover:text-red-500 transition"
                >
                  <IconLogout className="h-4 w-4" /> Se déconnecter
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 md:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
