import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '@/features/auth/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { IconHome, IconCalendar, IconUsers, IconSettings, IconLogout, IconBell, IconChat } from '@/components/ui/icons'
import logoFull from '@/assets/logo-full.svg'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'

const nav = [
  { to: '/admin', label: 'Tableau de bord', icon: IconHome, end: true },
  { to: '/admin/programmes', label: 'Programmes', icon: IconCalendar },
  { to: '/admin/reporting', label: 'Reporting', icon: IconChat },
  { to: '/admin/equipes', label: 'Équipes & VM', icon: IconUsers },
  { to: '/admin/parametres', label: 'Paramètres', icon: IconSettings }
]

export function ManagementShell() {
  const { profile, signOut } = useAuth()
  const unread = useUnreadNotifications()

  return (
    <div className="graal-surface min-h-screen flex">
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col border-r border-ink-100/60 bg-white/60 backdrop-blur-xl p-5">
        <img src={logoFull} alt="GRAAL" className="h-12 w-auto mx-auto mb-6" />
        <nav className="space-y-1 flex-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
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
        <div className="border-t border-ink-100 pt-4 flex items-center gap-3">
          <Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink-800 truncate">{profile?.full_name}</p>
            <p className="text-[10px] text-ink-400 capitalize">{profile?.role}</p>
          </div>
          <button onClick={signOut} className="text-ink-400 hover:text-red-500"><IconLogout className="h-4 w-4" /></button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="flex items-center justify-between px-6 py-4 md:hidden border-b border-ink-100 bg-white/70 backdrop-blur">
          <img src={logoFull} alt="GRAAL" className="h-8 w-auto" />
          <div className="relative"><IconBell className="h-5 w-5 text-ink-500" />
            {unread > 0 && <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-flame-500" />}
          </div>
        </div>
        <div className="p-5 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
