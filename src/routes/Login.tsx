import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import logoFull from '@/assets/logo-full.svg'
import { isBiometricAvailable, hasBiometricEnrolled, unlockWithBiometric } from '@/lib/biometric'

export default function Login() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [canBiometric, setCanBiometric] = useState(false)

  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    isBiometricAvailable().then((ok) => setCanBiometric(ok && hasBiometricEnrolled()))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError(error)
  }

  async function handleBiometric() {
    const ok = await unlockWithBiometric()
    if (ok && session) navigate('/', { replace: true })
    else if (ok) setError('Aucune session active. Connectez-vous une première fois avec votre mot de passe.')
    else setError('Vérification biométrique refusée ou annulée.')
  }

  return (
    <div className="graal-surface relative min-h-screen overflow-hidden flex flex-col justify-center px-6 py-10">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-royal-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto w-full max-w-sm"
      >
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="GRAAL Medical Solutions" className="h-24 w-auto drop-shadow-sm" />
        </div>

        <div className="glass-panel rounded-xl4 p-7">
          <h1 className="text-lg font-bold text-ink-800 text-center font-display">Connexion</h1>
          <p className="text-sm text-ink-400 text-center mt-1 mb-6">Accédez à votre espace GRAAL</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Email</label>
              <input
                type="email" required autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@graal.com"
                className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 pr-16 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-royal-600"
                >
                  {showPassword ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-flame-600 bg-flame-50 rounded-xl px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button type="submit" fullWidth loading={loading}>Se connecter</Button>
          </form>

          {canBiometric && (
            <button
              onClick={handleBiometric}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-white/60 py-3 text-sm font-semibold text-ink-600 active:scale-[0.98] transition"
            >
              Déverrouiller avec Face ID / empreinte
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-ink-400">
          Document confidentiel — usage réservé aux collaborateurs GRAAL MEDICAL SOLUTIONS
        </p>
      </motion.div>
    </div>
  )
}
