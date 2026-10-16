import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import logoFull from '@/assets/logo-full.png'

type Step = 'email' | 'code' | 'password'

export default function FirstConnection() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setMessage(null)
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Saisissez votre adresse e-mail professionnelle.')
      return
    }

    setLoading(true)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false }
    })
    setLoading(false)

    // Ne pas révéler si une adresse est enregistrée dans GRAAL.
    if (otpError && !otpError.message.toLowerCase().includes('user not found')) {
      setError("Impossible d'envoyer le code pour le moment. Réessayez dans quelques instants.")
      return
    }

    setEmail(normalizedEmail)
    setStep('code')
    setMessage('Si cette adresse correspond à un compte GRAAL existant, un code de vérification vient de lui être envoyé.')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Saisissez le code à 6 chiffres reçu par e-mail.')
      return
    }

    setLoading(true)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email'
    })
    setLoading(false)

    if (verifyError) {
      setError('Code invalide ou expiré. Vérifiez le code reçu ou demandez-en un nouveau.')
      return
    }
    setStep('password')
  }

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError("La mise à jour du mot de passe a échoué. Recommencez ou contactez l'administrateur.")
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="graal-surface relative min-h-screen overflow-hidden flex flex-col justify-center px-6 py-10">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-royal-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto w-full max-w-sm"
      >
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="GRAAL Medical Solutions" className="h-24 w-auto drop-shadow-sm" />
        </div>

        <div className="glass-panel rounded-xl4 p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-royal-600 text-center mb-2">
            Activation sécurisée
          </p>
          <h1 className="text-lg font-bold text-ink-800 text-center font-display">
            {step === 'email' ? 'Première connexion' : step === 'code' ? 'Vérifiez votre e-mail' : 'Créez votre mot de passe'}
          </h1>
          <p className="text-sm text-ink-400 text-center mt-2 mb-6">
            {step === 'email'
              ? 'Activez votre accès avec l’adresse e-mail associée à votre compte GRAAL.'
              : step === 'code'
                ? `Saisissez le code à 6 chiffres envoyé à ${email}.`
                : 'Choisissez un mot de passe personnel pour sécuriser votre compte.'}
          </p>

          {step === 'email' && (
            <form onSubmit={sendCode} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Adresse e-mail</label>
                <input
                  type="email" required autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@graal.com"
                  className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <Button type="submit" fullWidth loading={loading}>Recevoir mon code</Button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verifyCode} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Code de vérification</label>
                <input
                  type="text" required inputMode="numeric" autoComplete="one-time-code"
                  pattern="[0-9]{6}" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <Button type="submit" fullWidth loading={loading}>Vérifier le code</Button>
              <button type="button" onClick={() => sendCode()} disabled={loading} className="w-full text-sm font-semibold text-royal-600 disabled:opacity-50">
                Renvoyer un code
              </button>
              <button type="button" onClick={() => { setStep('email'); setCode(''); setError(null); setMessage(null) }} className="w-full text-sm text-ink-400">
                Modifier l’adresse e-mail
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={setNewPassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Nouveau mot de passe</label>
                <input
                  type="password" required minLength={8} autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Confirmer le mot de passe</label>
                <input
                  type="password" required minLength={8} autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                />
              </div>
              <Button type="submit" fullWidth loading={loading}>Activer mon compte</Button>
            </form>
          )}

          {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
          {error && <p role="alert" className="mt-4 rounded-xl bg-flame-50 px-3 py-2 text-sm text-flame-600">{error}</p>}

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-6 w-full text-sm font-semibold text-ink-500 transition hover:text-royal-600"
          >
            Retour à la connexion
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-ink-400">
          Accès réservé aux collaborateurs GRAAL MEDICAL SOLUTIONS
        </p>
      </motion.div>
    </div>
  )
}
