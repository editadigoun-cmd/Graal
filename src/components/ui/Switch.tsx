import { motion } from 'framer-motion'

interface SwitchProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  loading?: boolean
  label?: string
}

// Interrupteur maison (notifications, biométrie, etc.) — remplace les toggles dupliqués et
// approximatifs qui existaient dans Profil.tsx (VM et management) : piste/pouce alignés au
// pixel près, transition ressort plutôt qu'un simple `transition-transform`, états
// disabled/loading réellement visibles, et sémantique accessible (role="switch").
export function Switch({ checked, onChange, disabled, loading, label }: SwitchProps) {
  const busy = disabled || loading
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={onChange}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-emerald-500' : 'bg-ink-200'
      } ${busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-md"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      >
        {loading && (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-ink-300 border-t-transparent" />
        )}
      </motion.span>
    </button>
  )
}
