// Crée un compte utilisateur (VM, superviseur ou admin) et lui envoie une invitation par
// email — réservé aux administrateurs. Le profil est créé automatiquement par le trigger
// handle_new_auth_user() (voir 002_profiles_teams.sql) à partir des métadonnées fournies ici.
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non supportée' }), { status: 405 })

  try {
    const body = await req.json()
    const { email, full_name, role, secteur, equipe_id } = body as {
      email: string; full_name: string; role: 'vm' | 'superviseur' | 'admin'
      secteur?: 'A' | 'B' | null; equipe_id?: string | null
    }

    if (!email || !full_name || !role) {
      return new Response(JSON.stringify({ error: 'Email, nom complet et rôle sont obligatoires.' }), { status: 400 })
    }
    if (role === 'vm' && (!secteur || !equipe_id)) {
      return new Response(JSON.stringify({ error: 'Un VM doit avoir un secteur et une équipe.' }), { status: 400 })
    }

    // Vérifie que l'appelant est bien administrateur, avec son propre jeton (respecte les RLS)
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 })

    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', userData.user.id).single()
    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Action réservée aux administrateurs.' }), { status: 403 })
    }

    // Client "service role" — seul ce contexte peut créer un utilisateur auth.
    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role, secteur: secteur ?? null, equipe_id: equipe_id ?? null }
    })

    if (inviteError) return new Response(JSON.stringify({ error: inviteError.message }), { status: 400 })

    return new Response(JSON.stringify({ id: invited.user.id, email: invited.user.email }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
