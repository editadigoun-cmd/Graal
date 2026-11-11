import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { getOfflineSnapshot, saveOfflineSnapshot, clearOfflineSnapshots } from '@/lib/offlineCache'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    if (!navigator.onLine) {
      const cached = await getOfflineSnapshot<Profile>(userId, 'profile')
      setProfile(cached?.data ?? null)
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data && !data.actif) {
      // Compte désactivé par un administrateur : on met fin à la session immédiatement,
      // même si le jeton d'accès courant est encore valide.
      await supabase.auth.signOut()
      setSession(null)
      setProfile(null)
      return
    }
    setProfile(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session)
        if (data.session) {
          return loadProfile(data.session.user.id)
        }
      })
      .catch((err) => {
        // Une session qui ne peut pas être récupérée (ex : Supabase mal configuré, réseau
        // indisponible) ne doit jamais laisser l'app bloquée indéfiniment sur l'écran de lancement.
        console.error('Échec de récupération de la session Supabase :', err)
      })
      .finally(() => setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? traduireErreur(error.message) : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

function traduireErreur(message: string) {
  if (message.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (message.includes('Email not confirmed')) return 'Compte non confirmé. Contactez votre administrateur.'
  return 'Connexion impossible. Vérifiez votre connexion internet.'
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>')
  return ctx
}
