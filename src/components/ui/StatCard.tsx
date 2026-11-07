import { motion, useMotionValue, animate } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const mv = useMotionValue(0)
  const [display, setDisplay] = useState('0')

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v.toFixed(decimals))
    })
    return () => controls.stop()
  }, [value, decimals, mv])

  return <>{display}</>
}

interface StatCardProps {
  label: string
  value: number
  suffix?: string
  decimals?: number
  icon?: ReactNode
  tone?: 'royal' | 'emerald' | 'flame' | 'ink'
  sub?: string
}

const tones = {
  royal: 'from-royal-600 to-royal-500',
  emerald: 'from-emerald-600 to-emerald-500',
  flame: 'from-flame-600 to-flame-500',
  ink: 'from-ink-700 to-ink-600'
}

export function StatCard({ label, value, suffix, decimals = 0, icon, tone = 'royal', sub }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card-premium group relative overflow-hidden rounded-2xl p-4 sm:p-5"
    >
      <div className={clsx('absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-10', tones[tone])} />
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-ink-500">{label}</p>
        {icon && <div className={clsx('rounded-xl2 bg-gradient-to-br p-2.5 text-white shadow-sm', tones[tone])}>{icon}</div>}
      </div>
      <p className="mt-3 text-2xl sm:text-3xl font-extrabold text-ink-800 font-display">
        <AnimatedNumber value={value} decimals={decimals} />
        {suffix}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-400">{sub}</p>}
    </motion.div>
  )
}
