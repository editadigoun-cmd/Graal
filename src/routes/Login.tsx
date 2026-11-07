import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { IconStethoscope, IconTrendingUp, IconCheckCircle } from '@/components/ui/icons'
import markImage from '@/assets/logo-mark.png'
const logoFull = markImage
const logoMark = markImage
import WelcomeScreen from '@/routes/WelcomeScreen'
import { isBiometricAvailable, hasBiometricEnrolled, unlockWithBiometric } from '@/lib/biometric'

const FEATURES = [
  { icon: IconStethoscope, title: 'Suivi terrain en temps réel', text: 'Visites, portefeuille client et clôtures de journée centralisés.' },
  { icon: IconCheckCircle, title: 'Conformité automatisée', text: 'Règles métier appliquées côté serveur, sans dérogation possible.' },
  { icon: IconTrendingUp, title: 'Reporting intelligent', text: 'Scoring mensuel et analyses hebdomadaires générés pour vos équipes.' }
]

export default function Login() {
  const { signIn, session } = useAuth()
  const navigate = useNavigate()
  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [canBiometric, setCanBiometric] = useState(false)
  const [firstLoginOpen, setFirstLoginOpen] = useState(false)
  const [firstLoginStep, setFirstLoginStep] = useState<'email' | 'otp' | 'password'>('email')
  const [firstLoginEmail, setFirstLoginEmail] = useState('')
  const [firstLoginOtp, setFirstLoginOtp] = useState('')
  const [firstLoginPassword, setFirstLoginPassword] = useState('')
  const [firstLoginConfirm, setFirstLoginConfirm] = useState('')
  const [firstLoginLoading, setFirstLoginLoading] = useState(false)
  const [firstLoginError, setFirstLoginError] = useState<string | null>(null)
  const [firstLoginNotice, setFirstLoginNotice] = useState<string | null>(null)

  useEffect(() => {
    if (session && !firstLoginOpen) navigate('/', { replace: true })
  }, [session, navigate, firstLoginOpen])

  useEffect(() => {
    isBiometricAvailable().then((ok) => setCanBiometric(ok && hasBiometricEnrolled()))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
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

  async function requestFirstLoginCode(e: React.FormEvent) {
    e.preventDefault()
    setFirstLoginError(null)
    setFirstLoginNotice(null)
    setFirstLoginLoading(true)
    const normalizedEmail = firstLoginEmail.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false },
    })
    setFirstLoginLoading(false)
    if (error) {
      setFirstLoginError("Impossible d'envoyer le code. Vérifiez l'adresse e-mail ou réessayez dans une minute.")
      return
    }
    setFirstLoginEmail(normalizedEmail)
    setFirstLoginStep('otp')
    setFirstLoginNotice('Si cette adresse correspond à un compte PROVISIT, un code de vérification vient d’être envoyé.')
  }

  async function verifyFirstLoginCode(e: React.FormEvent) {
    e.preventDefault()
    setFirstLoginError(null)
    setFirstLoginNotice(null)
    setFirstLoginLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email: firstLoginEmail,
      token: firstLoginOtp.trim(),
      type: 'email',
    })
    setFirstLoginLoading(false)
    if (error) {
      setFirstLoginError('Code invalide ou expiré. Vérifiez le code reçu et réessayez.')
      return
    }
    setFirstLoginStep('password')
    setFirstLoginNotice('Adresse vérifiée. Vous pouvez maintenant définir votre mot de passe.')
  }

  async function handleSetFirstLoginPassword(e: React.FormEvent) {
    e.preventDefault()
    setFirstLoginError(null)
    setFirstLoginNotice(null)
    if (firstLoginPassword.length < 8) {
      setFirstLoginError('Choisissez un mot de passe de 8 caractères minimum.')
      return
    }
    if (firstLoginPassword !== firstLoginConfirm) {
      setFirstLoginError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setFirstLoginLoading(true)
    const { error } = await supabase.auth.updateUser({ password: firstLoginPassword })
    if (error) {
      setFirstLoginLoading(false)
      setFirstLoginError('Impossible d’enregistrer le mot de passe. Recommencez la vérification si le code a expiré.')
      return
    }
    await supabase.auth.signOut()
    setFirstLoginLoading(false)
    setFirstLoginOpen(false)
    setFirstLoginStep('email')
    setFirstLoginOtp('')
    setFirstLoginPassword('')
    setFirstLoginConfirm('')
    setPassword('')
    setError(null)
    setFirstLoginNotice(null)
    setEmail(firstLoginEmail)
    setError(null)
    setFirstLoginError(null)
    setSuccessMessage('Mot de passe défini avec succès. Connectez-vous avec votre nouveau mot de passe.')
  }

  async function closeFirstLogin() {
    if (session) await supabase.auth.signOut()
    setFirstLoginOpen(false)
    setFirstLoginStep('email')
    setFirstLoginOtp('')
    setFirstLoginPassword('')
    setFirstLoginConfirm('')
    setFirstLoginError(null)
    setFirstLoginNotice(null)
  }

  return (
    <div className="relative min-h-[100svh] bg-[#F7FAFC] lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#102F4B] lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#163E63] via-[#123653] to-[#0B263D]" />
        <div className="pointer-events-none absolute -top-32 -left-20 h-96 w-96 rounded-full bg-[#1FA37A]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-[#F28C28]/15 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: `url(${logoMark})`, backgroundRepeat: 'repeat', backgroundSize: '140px' }}
        />

        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex items-center gap-3"
        >
          <img src={markImage} alt="PROVISIT" className="h-12 w-auto max-w-[230px] object-contain" />
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
          Accès sécurisé · PROVISIT
        </p>
      </div>

      <div className="graal-surface relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-6 py-10 lg:px-16">
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-royal-500/10 blur-3xl lg:hidden" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl lg:hidden" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto w-full max-w-sm"
        >
          <div className="flex justify-center mb-8 lg:hidden">
            <img src={markImage} alt="PROVISIT" className="h-16 w-auto max-w-[260px] object-contain" />
          </div>

          <div className="glass-panel rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(22,62,99,.09)] backdrop-blur-xl sm:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            {firstLoginOpen ? (
              <>
                <h1 className="text-lg font-bold text-ink-800 text-center lg:text-left font-display">Première connexion</h1>
                <p className="text-sm text-ink-400 text-center lg:text-left mt-1 mb-6">
                  Vérifiez votre adresse professionnelle pour créer votre mot de passe.
                </p>

                {firstLoginStep === 'email' && (
                  <form onSubmit={requestFirstLoginCode} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-ink-500 mb-1.5 block">E-mail du compte PROVISIT</label>
                      <input type="email" required autoComplete="email" value={firstLoginEmail}
                        onChange={(e) => setFirstLoginEmail(e.target.value)} placeholder="prenom.nom@provisit.app"
                        className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3.5 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
                    </div>
                    <Button type="submit" fullWidth loading={firstLoginLoading}>Recevoir le code par e-mail</Button>
                  </form>
                )}

                {firstLoginStep === 'otp' && (
                  <form onSubmit={verifyFirstLoginCode} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Code de vérification (6 chiffres)</label>
                      <input type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                        pattern="[0-9]{6}" value={firstLoginOtp} onChange={(e) => setFirstLoginOtp(e.target.value.replace(/\\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] tracking-[0.3em] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
                      <p className="mt-2 text-xs text-ink-400">Code envoyé à {firstLoginEmail}</p>
                    </div>
                    <Button type="submit" fullWidth loading={firstLoginLoading}>Vérifier le code</Button>
                    <button type="button" onClick={() => { setFirstLoginStep('email'); setFirstLoginOtp(''); setFirstLoginError(null); setFirstLoginNotice(null) }}
                      className="w-full text-sm font-semibold text-royal-600">Modifier l’adresse e-mail</button>
                  </form>
                )}

                {firstLoginStep === 'password' && (
                  <form onSubmit={handleSetFirstLoginPassword} className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Nouveau mot de passe</label>
                      <input type="password" required minLength={8} autoComplete="new-password" value={firstLoginPassword}
                        onChange={(e) => setFirstLoginPassword(e.target.value)} placeholder="8 caractères minimum"
                        className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Confirmer le mot de passe</label>
                      <input type="password" required minLength={8} autoComplete="new-password" value={firstLoginConfirm}
                        onChange={(e) => setFirstLoginConfirm(e.target.value)} placeholder="Répétez le mot de passe"
                        className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
                    </div>
                    <Button type="submit" fullWidth loading={firstLoginLoading}>Enregistrer mon mot de passe</Button>
                  </form>
                )}

                {(firstLoginError || firstLoginNotice) && (
                  <p role="status" className={`mt-4 rounded-xl px-3 py-2 text-sm ${firstLoginError ? 'text-flame-600 bg-flame-50' : 'text-emerald-700 bg-emerald-50'}`}>
                    {firstLoginError || firstLoginNotice}
                  </p>
                )}
                <button type="button" onClick={closeFirstLogin}
                  className="mt-5 w-full text-sm font-semibold text-ink-500 hover:text-royal-600">
                  Retour à la connexion
                </button>
              </>
            ) : (
              <>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#1FA37A]">Espace sécurisé</p><h1 className="text-2xl font-extrabold tracking-tight text-[#163E63] text-center lg:text-left font-display">Connexion</h1>
            <p className="text-sm text-ink-400 text-center lg:text-left mt-1 mb-6">Accédez à votre espace PROVISIT</p>

            {successMessage && (
              <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {successMessage}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Email</label>
                <input
                  type="email" required autoComplete="username" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@provisit.app"
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

            <button type="button" onClick={() => {
              setFirstLoginOpen(true)
              setFirstLoginStep('email')
              setFirstLoginEmail(email)
              setFirstLoginError(null)
              setFirstLoginNotice(null)
              setError(null)
              setSuccessMessage(null)
            }} className="mt-4 w-full text-sm font-semibold text-royal-600 hover:text-royal-700">
              Première connexion ? Définir mon mot de passe
            </button>

            {canBiometric && (
              <button
                onClick={handleBiometric}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-white/60 py-3 text-sm font-semibold text-ink-600 active:scale-[0.98] transition"
              >
                Déverrouiller avec Face ID / empreinte
              </button>
            )}
              </>
            )}
          </div>

          <p className="mt-6 text-center lg:text-left text-[11px] text-ink-400">
            Accès réservé aux collaborateurs et partenaires autorisés
          </p>
        </motion.div>
      </div>
    </div>
  )
}
