import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error('Supabase env vars are missing (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).')
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Nécessaire pour que les liens d'invitation et de réinitialisation de mot de passe
    // (envoyés par create-user) transforment les jetons présents dans l'URL en session.
    detectSessionInUrl: true
  }
})
