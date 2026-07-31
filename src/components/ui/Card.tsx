import clsx from 'clsx'
import { motion, type HTMLMotionProps } from 'framer-motion'

interface CardProps extends HTMLMotionProps<'div'> {
  glass?: boolean
}

export function Card({ glass, className, children, ...rest }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={clsx(glass ? 'glass-panel' : 'card-premium', 'rounded-xl3 p-5', className)}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
