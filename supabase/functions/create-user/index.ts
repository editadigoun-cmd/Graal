// Crée un compte utilisateur (VM, superviseur ou admin) et lui envoie une invitation par
// email — réservé aux administrateurs. Le profil est créé automatiquement par le trigger
// handle_new_auth_user() (voir 002_profiles_teams.sql) à partir des métadonnées fournies ici.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405)

  try {
    const body = await req.json()
    const { email, full_name, role, secteur, equipe_id } = body as {
      email: string; full_name: string; role: 'vm' | 'superviseur' | 'admin'
      secteur?: 'A' | 'B' | null; equipe_id?: string | null
    }

    if (!email || !full_name || !role) {
      return json({ error: 'Email, nom complet et rôle sont obligatoires.' }, 400)
    }
    if (role === 'vm' && (!secteur || !equipe_id)) {
      return json({ error: 'Un VM doit avoir un secteur et une équipe.' }, 400)
    }

    // Vérifie que l'appelant est bien administrateur, avec son propre jeton (respecte les RLS)
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Non authentifié' }, 401)

    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', userData.user.id).single()
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Action réservée aux administrateurs.' }, 403)
    }

    // Client "service role" — seul ce contexte peut créer un utilisateur auth.
    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role, secteur: secteur ?? null, equipe_id: equipe_id ?? null }
    })

    if (inviteError) return json({ error: inviteError.message }, 400)

    return json({ id: invited.user.id, email: invited.user.email })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
