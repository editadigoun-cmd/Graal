import type { SVGProps } from 'react'

// Jeu d'icônes maison, style "Material Symbols Rounded" (traits arrondis), en SVG inline
// afin de garantir un rendu identique hors-ligne (pas de dépendance à une police externe).
type IconProps = SVGProps<SVGSVGElement>

const base = {
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const
}

export const IconHome = (p: IconProps) => (
  <svg {...base} {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" /></svg>
)
export const IconCalendar = (p: IconProps) => (
  <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
)
export const IconStethoscope = (p: IconProps) => (
  <svg {...base} {...p}><path d="M6 3v6a4 4 0 0 0 8 0V3" /><path d="M6 3H4.5M14 3h1.5" /><path d="M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="10" r="1.6" /></svg>
)
export const IconChat = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" /></svg>
)
export const IconUser = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c1-3.5 4-5.5 7.5-5.5s6.5 2 7.5 5.5" /></svg>
)
export const IconBell = (p: IconProps) => (
  <svg {...base} {...p}><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
)
export const IconSearch = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3" /></svg>
)
export const IconCamera = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="13" r="3.5" /></svg>
)
export const IconCheck = (p: IconProps) => (
  <svg {...base} {...p}><path d="M5 13l4.5 4.5L19 7" /></svg>
)
export const IconCheckCircle = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.5l2.3 2.3L15.8 9" /></svg>
)
export const IconX = (p: IconProps) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const IconChevronRight = (p: IconProps) => (
  <svg {...base} {...p}><path d="M9 5l7 7-7 7" /></svg>
)
export const IconChevronLeft = (p: IconProps) => (
  <svg {...base} {...p}><path d="M15 5l-7 7 7 7" /></svg>
)
export const IconMapPin = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 21s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
)
export const IconClock = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
)
export const IconAlert = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 3.5 21.5 20h-19L12 3.5Z" /><path d="M12 10v3.5" /><circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none" /></svg>
)
export const IconPlus = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconTrendingUp = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4 16l5.5-5.5L13 14l7-7" /><path d="M15 7h5v5" /></svg>
)
export const IconFilter = (p: IconProps) => (
  <svg {...base} {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>
)
export const IconLogout = (p: IconProps) => (
  <svg {...base} {...p}><path d="M9 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H9" /><path d="M13 8l5 4-5 4M18 12H9" /></svg>
)
export const IconSettings = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L9.8 21h4.4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" /></svg>
)
export const IconMic = (p: IconProps) => (
  <svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
)
export const IconPaperclip = (p: IconProps) => (
  <svg {...base} {...p}><path d="M8 12.5l6.5-6.5a3 3 0 1 1 4.2 4.2l-8.2 8.2a5 5 0 1 1-7-7L11 3" /></svg>
)
export const IconSend = (p: IconProps) => (
  <svg {...base} {...p} strokeWidth={1.8}><path d="M4 12l16-8-6 16-3-6-7-2Z" /></svg>
)
export const IconEmoji = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>
)
export const IconMinus = (p: IconProps) => (
  <svg {...base} {...p}><path d="M5 12h14" /></svg>
)
export const IconPill = (p: IconProps) => (
  <svg {...base} {...p}><rect x="3.5" y="9.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 13)" /><path d="M9.5 10.5l4 4" /></svg>
)
export const IconDownload = (p: IconProps) => (
  <svg {...base} {...p}><path d="M12 4v11M8 11l4 4 4-4" /><path d="M4.5 18v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" /></svg>
)
export const IconLock = (p: IconProps) => (
  <svg {...base} {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
)
export const IconUsers = (p: IconProps) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3" /><path d="M3 19c.8-3 3-4.7 6-4.7s5.2 1.7 6 4.7" /><path d="M16 5.2a3 3 0 0 1 0 5.8M20.5 19c-.6-2.2-1.8-3.7-3.5-4.4" /></svg>
)
export const IconActivity = (p: IconProps) => (
  <svg {...base} {...p}><path d="M3 12h4l2.5-7L13 19l2.5-7H21" /></svg>
)
export const IconClipboard = (p: IconProps) => (
  <svg {...base} {...p}><rect x="5" y="4.5" width="14" height="17" rx="2.5" /><rect x="9" y="3" width="6" height="3.5" rx="1.2" /><path d="M8.5 12h7M8.5 15.5h7M8.5 8.7h4" /></svg>
)
export const IconMenu = (p: IconProps) => (
  <svg {...base} {...p}><path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" /></svg>
)
export const IconEye = (p: IconProps) => (
  <svg {...base} {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
)
export const IconPlay = (p: IconProps) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>
)
export const IconPause = (p: IconProps) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}><rect x="6" y="4.5" width="4.5" height="15" rx="1" /><rect x="13.5" y="4.5" width="4.5" height="15" rx="1" /></svg>
)
export const IconPhone = (p: IconProps) => (
  <svg {...base} {...p}><path d="M5 4.5h3.5l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a1.5 1.5 0 0 1-1.6 1.5C10.5 19 5 13.5 4.5 6.6A1.5 1.5 0 0 1 5 4.5Z" /></svg>
)
export const IconPhoneOff = (p: IconProps) => (
  <svg {...base} {...p}><path d="M5 4.5h3.5l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a1.5 1.5 0 0 1-1.6 1.5 15.6 15.6 0 0 1-3.9-.9" /><path d="M3 3l18 18" /></svg>
)
export const IconMicOff = (p: IconProps) => (
  <svg {...base} {...p}><path d="M9 5.5A3 3 0 0 1 15 7v4c0 .4 0 .8-.1 1.1M12 14a3 3 0 0 1-3-3v-1" /><path d="M5.5 11a6.5 6.5 0 0 0 9.3 5.9M12 17.5V21" /><path d="M3 3l18 18" /></svg>
)
