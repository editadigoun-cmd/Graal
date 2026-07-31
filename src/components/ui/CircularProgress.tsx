import { motion } from 'framer-motion'
import clsx from 'clsx'

interface CircularProgressProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  label?: string
  tone?: 'royal' | 'emerald' | 'flame'
}

const toneStroke = { royal: '#154BAD', emerald: '#26B876', flame: '#F5860A' }

export function CircularProgress({ value, size = 96, strokeWidth = 9, label, tone = 'royal' }: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c - (clamped / 100) * c

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF1F5" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={toneStroke[tone]} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={clsx('font-extrabold font-display', size < 80 ? 'text-base' : 'text-xl')}>
          {Math.round(clamped)}%
        </span>
        {label && <span className="text-[10px] font-medium text-ink-400">{label}</span>}
      </div>
    </div>
  )
}
