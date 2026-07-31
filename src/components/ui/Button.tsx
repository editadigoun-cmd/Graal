import { motion, type HTMLMotionProps } from 'framer-motion'
import clsx from 'clsx'
import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-royal-600 text-white shadow-soft hover:bg-royal-700 active:bg-royal-800',
  secondary: 'bg-white text-royal-700 border border-ink-200 hover:bg-ink-50 shadow-softer',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-100',
  danger: 'bg-flame-500 text-white shadow-soft hover:bg-flame-600',
  success: 'bg-emerald-500 text-white shadow-soft hover:bg-emerald-600'
}

const sizes: Record<Size, string> = {
  sm: 'text-sm px-3.5 py-2 gap-1.5',
  md: 'text-[15px] px-5 py-3 gap-2',
  lg: 'text-base px-6 py-3.5 gap-2'
}

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  fullWidth?: boolean
  loading?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'primary', size = 'md', icon, fullWidth, loading, className, children, disabled, ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-2xl font-semibold transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none select-none',
        variants[variant], sizes[size], fullWidth && 'w-full', className
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : icon}
      {children}
    </motion.button>
  )
}
