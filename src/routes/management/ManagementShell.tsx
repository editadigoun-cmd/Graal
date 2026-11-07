import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { useAuth } from '@/features/auth/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import {
  IconHome, IconUsers, IconSettings, IconLogout, IconBell, IconChat, IconActivity,
  IconUser, IconClipboard, IconMapPin, IconPill, IconTrendingUp, IconBarChart,
  IconMenu, IconX, IconChevronRight, IconGift
} from '@/components/ui/icons'
import logoFull from '@/assets/logo-full.png'
import logoMark from '@/assets/logo-mark.png'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  end?: boolean
  adminOnly?: boolean
}

type NavGroup = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: NavItem[]
  adminOnly?: boolean
}

const topItems: NavItem[] = [
  { to: '/admin', label: 'Tableau de bord', icon: IconHome, end: true },
  { to: '/admin/messages', label: 'Messages', icon: IconChat },
  { to: '/admin/notifications', label: 'Notifications', icon: IconBell },
]

const groups: NavGroup[] = [
  {
    label: 'Pilotage',
    icon: IconBarChart,
    children: [
      { to: '/admin/programmes', label: 'Programmes', icon: IconClipboard },
      { to: '/admin/plan-activites', label: "Plan d'activités", icon: IconClipboard },
      { to: '/admin/pilotage-ventes', label: 'Pilotage des ventes', icon: IconBarChart },
      { to: '/admin/analyse-ventes', label: 'Analyse des ventes', icon: IconTrendingUp },
      { to: '/admin/reporting', label: 'Reporting', icon: IconBarChart },
      { to: '/admin/couverture-mensuelle', label: 'Couverture mensuelle CRM', icon: IconTrendingUp, adminOnly: true },
      { to: '/admin/evaluation-superviseurs', label: 'Évaluation des superviseurs', icon: IconBarChart, adminOnly: true },
    ],
  },
  {
    label: 'Terrain & activité',
    icon: IconMapPin,
    children: [
      { to: '/admin/terrain', label: 'Vue terrain', icon: IconMapPin },
      { to: '/admin/suivi-terrain', label: 'Suivi terrain', icon: IconMapPin },
      { to: '/admin/vad-plan', label: 'VAD', icon: IconMapPin },
      { to: '/admin/rapport-activite-hebdo', label: 'Rapport hebdomadaire', icon: IconClipboard },
      { to: '/admin/controle-frequence', label: 'Fréquence clients', icon: IconUsers },
      { to: '/admin/rapports-duo', label: 'Duo terrain', icon: IconUsers },
      { to: '/admin/animation-equipe', label: "Animation d'équipe", icon: IconTrendingUp },
      { to: '/admin/indicateurs-animation', label: "Indicateurs d'animation", icon: IconBarChart, adminOnly: true },
    ],
  },
  {
    label: 'Ressources',
    icon: IconUsers,
    children: [
      { to: '/admin/equipes', label: 'Équipes & VM', icon: IconUsers },
      { to: '/admin/portefeuille', label: 'Mon portefeuille', icon: IconUsers },
      { to: '/admin/clients', label: 'Clients', icon: IconUsers, adminOnly: true },
      { to: '/admin/produits', label: 'Produits', icon: IconPill, adminOnly: true },
    ],
  },
  {
    label: 'Administration',
    icon: IconSettings,
    children: [
      { to: '/admin/activite', label: 'Activité & notifications', icon: IconActivity },
      { to: '/admin/parametres', label: 'Paramètres', icon: IconSettings, adminOnly: true },
      { to: '/admin/anniversaires', label: 'Anniversaires', icon: IconGift },
      { to: '/admin/profil', label: 'Mon profil', icon: IconUser },
    ],
  },
]

const ROLE_LABEL: Record<string, string> = { admin: 'Administrateur', superviseur: 'Superviseur' }

function isPathActive(pathname: string, search: string, to: string) {
  const [clean, query] = to.split('?')
  if (query) return pathname === clean && search === '?' + query
  return clean === '/admin' ? pathname === clean : pathname.startsWith(clean)
}

export function ManagementShell() {
  const { profile, signOut } = useAuth()
  const unread = useUnreadNotifications()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(['Pilotage', 'Terrain & activité', 'Administration']))

  const supervisorPaths = new Set([
    '/admin/programmes', '/admin/plan-activites', '/admin/reporting',
    '/admin/terrain', '/admin/suivi-terrain', '/admin/vad-plan',
    '/admin/rapport-activite-hebdo', '/admin/controle-frequence',
    '/admin/rapports-duo', '/admin/animation-equipe', '/admin/equipes',
    '/admin/portefeuille', '/admin/activite', '/admin/anniversaires', '/admin/profil'
  ])
  const visibleGroups = useMemo(() => {
    if (profile?.role === 'admin') {
      return groups
        .map((g) => ({ ...g, children: g.children.filter((item) => item.to !== '/admin/portefeuille') }))
        .filter((g) => g.children.length > 0)
    }
    if (profile?.role === 'superviseur') {
      return groups
        .map((g) => ({ ...g, children: g.children.filter((item) => !item.adminOnly && supervisorPaths.has(item.to.split('?')[0])) }))
        .filter((g) => g.children.length > 0)
    }
    return []
  }, [profile?.role])
  const currentPage = [...topItems, ...visibleGroups.flatMap((g) => g.children)].find((item) => isPathActive(location.pathname, location.search, item.to))

  function toggleGroup(label: string) {
    setOpenGroups((current) => { const next = new Set(current); if (next.has(label)) next.delete(label); else next.add(label); return next })
  }

  function Navigation({ mobile = false }: { mobile?: boolean }) {
    return (
      <nav className="space-y-1 flex-1 overflow-y-auto styled-scrollbar pr-1">
        {topItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={mobile ? () => setMenuOpen(false) : undefined}>
            {({ isActive }) => <div className={clsx('flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition', isActive ? 'bg-royal-600 text-white shadow-soft' : 'text-ink-500 hover:bg-ink-100')}><Icon className="h-4.5 w-4.5" />{label}</div>}
          </NavLink>
        ))}
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon
          const active = group.children.some((item) => isPathActive(location.pathname, location.search, item.to))
          const expanded = openGroups.has(group.label)
          return <div key={group.label} className="pt-1">
            <button type="button" onClick={() => toggleGroup(group.label)} className={clsx('w-full flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold transition', active ? 'text-royal-700 bg-royal-50' : 'text-ink-500 hover:bg-ink-100')} aria-expanded={expanded}><GroupIcon className="h-4.5 w-4.5" /><span className="flex-1 text-left">{group.label}</span><IconChevronRight className={clsx('h-4 w-4 transition-transform', expanded && 'rotate-90')} /></button>
            <AnimatePresence initial={false}>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="ml-4 mt-1 space-y-0.5 border-l border-ink-100 pl-2">{group.children.map(({ to, label, icon: Icon }) => { const itemActive = isPathActive(location.pathname, location.search, to); return <Link key={to} to={to} onClick={mobile ? () => setMenuOpen(false) : undefined}><div className={clsx('flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition', itemActive ? 'bg-royal-600 text-white shadow-soft' : 'text-ink-500 hover:bg-ink-100')}><Icon className="h-3.5 w-3.5" />{label}</div></Link> })}</div></motion.div>}</AnimatePresence>
          </div>
        })}
      </nav>
    )
  }

  return <div className="graal-surface flex h-screen overflow-hidden">
    <aside className="hidden md:flex w-72 flex-shrink-0 flex-col border-r border-ink-100/60 bg-white/70 backdrop-blur-xl p-5">
      <div className="flex items-center gap-2.5 px-1 mb-8"><img src={logoMark} alt="" className="h-8 w-8" /><div><p className="text-sm font-extrabold text-ink-800 font-display leading-none">PROVISIT</p><p className="text-[10px] font-semibold text-ink-400 tracking-wide">MEDICAL SOLUTIONS</p></div></div>
      <Navigation />
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink-100 p-2.5"><Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={38} /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-ink-800 truncate">{profile?.full_name}</p><p className="text-[10px] text-ink-400">{profile ? ROLE_LABEL[profile.role] ?? profile.role : ''}</p></div></div>
      <button onClick={signOut} className="mt-2 flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold text-ink-400 hover:bg-red-50 hover:text-red-500 transition"><IconLogout className="h-4 w-4" /> Se déconnecter</button>
    </aside>
    <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center justify-between border-b border-ink-100 bg-white/70 backdrop-blur px-5 md:px-8 py-4"><div className="flex items-center gap-3 md:hidden"><button onClick={() => setMenuOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-600 shadow-softer" aria-label="Ouvrir le menu"><IconMenu className="h-5 w-5" /></button><img src={logoFull} alt="PROVISIT" className="h-8 w-auto" /></div><p className="hidden md:block text-sm font-bold text-ink-700">{currentPage?.label ?? 'PROVISIT'}</p><div className="flex items-center gap-3">{profile?.role === 'admin' && <Link to="/admin/parametres" className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-400 shadow-softer hover:text-royal-600 transition"><IconSettings className="h-4.5 w-4.5" /></Link>}<Link to="/admin/notifications" aria-label="Ouvrir les notifications" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-500 shadow-softer hover:text-royal-600 transition"><IconBell className="h-4.5 w-4.5" />{unread > 0 && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-flame-500 text-[9px] font-bold text-white flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}</Link><Link to="/admin/profil" className="md:hidden"><Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={34} /></Link></div></header>
      <AnimatePresence>{menuOpen && <motion.div className="fixed inset-0 z-40 bg-ink-900/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)}><motion.div className="absolute left-0 top-0 h-full w-80 max-w-[88vw] bg-white p-5 flex flex-col" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-6"><div className="flex items-center gap-2.5"><img src={logoMark} alt="" className="h-8 w-8" /><div><p className="text-sm font-extrabold text-ink-800 font-display leading-none">PROVISIT</p><p className="text-[10px] font-semibold text-ink-400 tracking-wide">MEDICAL SOLUTIONS</p></div></div><button onClick={() => setMenuOpen(false)} className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Fermer le menu"><IconX className="h-5 w-5" /></button></div><Navigation mobile /><div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink-100 p-2.5"><Avatar name={profile?.full_name ?? ''} url={profile?.avatar_url} size={38} /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-ink-800 truncate">{profile?.full_name}</p><p className="text-[10px] text-ink-400">{profile ? ROLE_LABEL[profile.role] ?? profile.role : ''}</p></div></div><button onClick={signOut} className="mt-2 flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold text-ink-400 hover:bg-red-50 hover:text-red-500 transition"><IconLogout className="h-4 w-4" /> Se déconnecter</button></motion.div></motion.div>}</AnimatePresence>
      <div className="flex-1 overflow-y-auto"><div className="p-5 md:p-8 max-w-7xl w-full mx-auto"><Outlet /></div></div>
    </main>
  </div>
}
