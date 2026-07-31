import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { IconBell, IconSearch } from './icons'
import { nowBenin } from '@/lib/time'

interface TopBarProps {
  name: string
  avatarUrl?: string | null
  notificationsCount?: number
  onSearchClick?: () => void
}

export function TopBar({ name, avatarUrl, notificationsCount = 0, onSearchClick }: TopBarProps) {
  const hour = nowBenin().hour()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const firstName = name.split(' ')[0]

  return (
    <div className="flex items-center justify-between px-1 pb-2 pt-1">
      <div className="flex items-center gap-3">
        <Link to="/app/profil"><Avatar name={name} url={avatarUrl} /></Link>
        <div>
          <p className="text-sm font-semibold text-ink-800">{greeting}, {firstName}</p>
          <p className="text-xs text-ink-400 capitalize">{nowBenin().format('dddd D MMMM')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onSearchClick}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-ink-500 shadow-softer backdrop-blur active:scale-95 transition"
        >
          <IconSearch className="h-5 w-5" />
        </button>
        <Link
          to="/app/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-ink-500 shadow-softer backdrop-blur active:scale-95 transition"
        >
          <IconBell className="h-5 w-5" />
          {notificationsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-flame-500 px-1 text-[10px] font-bold text-white">
              {notificationsCount > 9 ? '9+' : notificationsCount}
            </span>
          )}
        </Link>
      </div>
    </div>
  )
}
