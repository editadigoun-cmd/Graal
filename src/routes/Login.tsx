import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { IconStethoscope, IconTrendingUp, IconCheckCircle } from '@/components/ui/icons'
import logoFull from '@/assets/logo-full.svg'
import logoMark from '@/assets/logo-mark.svg'
import { isBiometricAvailable, hasBiometricEnrolled, unlockWithBiometric } from '@/lib/biometric'

const FEATURES = [
  { icon: IconStethoscope, title: 'Suivi terrain en temps réel', text: 'Visites, portefeuille client et clôtures de journée centralisés.' },
  { icon: IconCheckCircle, title: 'Conformité automatisée', text: 'Règles métier appliquées côté serveur, sans dérogation possible.' },
  { icon: IconTrendingUp, title: 'Reporting intelligent', text: 'Scoring mensuel et analyses hebdomadaires générés pour vos équipes.' }
]

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
    <div className="relative min-h-screen lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-royal-900 via-ink-900 to-ink-900" />
        <div className="pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-royal-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: `url(${logoMark})`, backgroundRepeat: 'repeat', backgroundSize: '140px' }}
        />

        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex items-center gap-3"
        >
          <img src={logoMark} alt="" className="h-10 w-10" />
          <div>
            <p className="text-sm font-extrabold tracking-wide text-white font-display leading-none">GRAAL</p>
            <p className="text-[10px] font-semibold tracking-wide text-white/50">MEDICAL SOLUTIONS</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-md"
        >
          <h1 className="text-3xl font-bold leading-tight text-white font-display">
            La plateforme de référence pour la visite médicale.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Pilotage des équipes terrain, conformité et reporting réunis dans un seul espace, pensé pour les organisations exigeantes.
          </p>

          <div className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-white/50 mt-0.5">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="relative text-[11px] text-white/35">
          Document confidentiel — usage réservé aux collaborateurs GRAAL MEDICAL SOLUTIONS
        </p>
      </div>

      <div className="graal-surface relative flex min-h-screen flex-col justify-center overflow-hidden px-6 py-10 lg:px-16">
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-royal-500/10 blur-3xl lg:hidden" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl lg:hidden" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto w-full max-w-sm"
        >
          <div className="flex justify-center mb-8 lg:hidden">
            <img src={logoFull} alt="GRAAL Medical Solutions" className="h-24 w-auto drop-shadow-sm" />
          </div>

          <div className="glass-panel rounded-xl4 p-7 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <h1 className="text-lg font-bold text-ink-800 text-center lg:text-left font-display">Connexion</h1>
            <p className="text-sm text-ink-400 text-center lg:text-left mt-1 mb-6">Accédez à votre espace GRAAL</p>

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

          <p className="mt-6 text-center lg:text-left text-[11px] text-ink-400">
            Document confidentiel — usage réservé aux collaborateurs GRAAL MEDICAL SOLUTIONS
          </p>
        </motion.div>
      </div>
    </div>
  )
}
