import clsx from 'clsx'

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url} alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover ring-2 ring-white shadow-softer"
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={clsx(
        'flex items-center justify-center rounded-full bg-gradient-to-br from-royal-600 to-emerald-500',
        'font-bold text-white ring-2 ring-white shadow-softer'
      )}
    >
      <span style={{ fontSize: size * 0.38 }}>{initials(name) || '?'}</span>
    </div>
  )
}
