import { motion } from 'framer-motion'
const logoMark = '/provisit-icon.svg'

export default function Splash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-royal-500/20 to-teal-500/20 blur-2xl"
        />
        <img src={logoMark} alt="PROVISIT" className="h-24 w-24" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="mt-5 text-center"
      >
        <p className="text-xl font-extrabold font-display bg-gradient-to-r from-royal-600 to-teal-500 bg-clip-text text-transparent">
          PROVISIT
        </p>
        <p className="text-xs text-ink-400 mt-1">Performance terrain, simplifiée</p>
      </motion.div>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: 120 }}
        transition={{ delay: 0.5, duration: 1.1, ease: 'easeInOut' }}
        className="mt-8 h-1 rounded-full bg-gradient-to-r from-royal-500 to-teal-500"
      />
    </div>
  )
}
