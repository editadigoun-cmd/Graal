import clsx from 'clsx'
import type { Database } from '@/types/database'
import { POTENTIEL_COLOR, POTENTIEL_LABEL } from '@/lib/theme'

type Potentiel = Database['public']['Enums']['potentiel_client']

export function PotentielBadge({ potentiel, compact }: { potentiel: Potentiel | null; compact?: boolean }) {
  if (!potentiel) {
    return (
      <span className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 bg-ink-100 text-ink-600 ring-ink-200',
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      )}>
        <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
        {compact ? 'Non renseigné' : 'Potentiel non renseigné'}
      </span>
    )
  }
  const c = POTENTIEL_COLOR[potentiel]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full font-semibold ring-1', c.bg, c.text, c.ring,
      compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs')}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', c.dot)} />
      {compact ? potentiel : POTENTIEL_LABEL[potentiel]}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: {
  children: React.ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-flame-50 text-flame-700',
    danger: 'bg-red-50 text-red-600',
    info: 'bg-royal-50 text-royal-700'
  }
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  )
}
