// Supprime définitivement un compte utilisateur — réservé aux administrateurs.
// La suppression de auth.users cascade vers profiles (002_profiles_teams.sql) puis vers
// toutes les tables métier rattachées par vm_id (visites, programmes, clôtures, reporting…).
// Si le compte a des données qui ne cascadent pas (ex : messages envoyés, programme validé
// en tant que superviseur), Postgres refuse la suppression avec une violation de clé
// étrangère — c'est volontaire : ça protège l'historique réel, seul un compte sans activité
// peut être supprimé définitivement. Utiliser la désactivation pour les autres cas.
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
    const { id } = (await req.json()) as { id: string }
    if (!id) return json({ error: 'Identifiant du compte manquant.' }, 400)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Non authentifié' }, 401)

    if (userData.user.id === id) {
      return json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, 400)
    }

    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', userData.user.id).single()
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Action réservée aux administrateurs.' }, 403)
    }

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(id)

    if (deleteError) {
      const msg = deleteError.message.toLowerCase()
      if (msg.includes('foreign key') || msg.includes('violates')) {
        return json({
          error: "Ce compte a des données associées (messages envoyés, programme validé, reporting visé…) qui empêchent une suppression définitive. Désactivez-le plutôt."
        }, 409)
      }
      return json({ error: deleteError.message }, 400)
    }

    return json({ success: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
