import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import { IconBell } from './icons'
import { nowBenin } from '@/lib/time'

interface TopBarProps {
  name: string
  avatarUrl?: string | null
  notificationsCount?: number
}

export function TopBar({ name, avatarUrl, notificationsCount = 0 }: TopBarProps) {
  const hour = nowBenin().hour()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const firstName = name.split(' ')[0]

  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#163E63]/[.07] bg-white/85 px-3 py-3 shadow-[0_8px_24px_rgba(22,62,99,.045)] backdrop-blur-xl sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/app/profil"><Avatar name={name} url={avatarUrl} /></Link>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#163E63]">{greeting}, {firstName}</p>
          <p className="text-[11px] font-medium text-[#8293A1] capitalize">{nowBenin().format('dddd D MMMM')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/app/notifications"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3F7FA] text-[#163E63] shadow-sm backdrop-blur hover:bg-[#EAF5F1] active:scale-95 transition"
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
