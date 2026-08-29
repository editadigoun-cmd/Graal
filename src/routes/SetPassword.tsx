import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import logoFull from '@/assets/logo-full.png'

export default function SetPassword() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
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
    if (updateError) setError(updateError.message)
    else navigate('/', { replace: true })
  }

  return (
    <div className="graal-surface relative min-h-screen overflow-hidden flex flex-col justify-center px-6 py-10">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-royal-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto w-full max-w-sm"
      >
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="GRAAL Medical Solutions" className="h-24 w-auto drop-shadow-sm" />
        </div>

        <div className="glass-panel rounded-xl4 p-7">
          {authLoading ? (
            <p className="text-sm text-ink-400 text-center py-6">Vérification du lien…</p>
          ) : !session ? (
            <>
              <h1 className="text-lg font-bold text-ink-800 text-center font-display">Lien invalide ou expiré</h1>
              <p className="text-sm text-ink-400 text-center mt-2 mb-6">
                Ce lien n'est plus valide. Demandez à votre administrateur de renvoyer une invitation.
              </p>
              <Button fullWidth onClick={() => navigate('/login')}>Retour à la connexion</Button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold text-ink-800 text-center font-display">Définissez votre mot de passe</h1>
              <p className="text-sm text-ink-400 text-center mt-1 mb-6">Bienvenue sur GRAAL Medical Solutions</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Nouveau mot de passe</label>
                  <input
                    type="password" required autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-500 mb-1.5 block">Confirmer le mot de passe</label>
                  <input
                    type="password" required autoComplete="new-password" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-ink-200 bg-white/80 px-4 py-3 text-[15px] outline-none transition focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                  />
                </div>

                {error && (
                  <p className="text-sm text-flame-600 bg-flame-50 rounded-xl px-3 py-2">{error}</p>
                )}

                <Button type="submit" fullWidth loading={loading}>Activer mon compte</Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
