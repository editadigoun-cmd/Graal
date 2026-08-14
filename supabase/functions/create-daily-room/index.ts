// Crée (à la demande, la première fois qu'on clique "Rejoindre") une salle d'appel Daily.co
// pour un appel programmé, avec enregistrement cloud automatique activé, et renvoie son URL.
// Les appels suivants renvoient directement l'URL déjà créée (pas de doublon de salle).
// Authentifié par le JWT de l'appelant : seul un participant du forum concerné (ou un admin)
// peut déclencher la création — vérifié via une lecture RLS normale (pas service_role) avant
// de basculer en service_role pour l'écriture, qu'aucune policy client ne permet.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { appel_id } = await req.json().catch(() => ({}))
    if (!appel_id) return jsonError('appel_id requis', 400)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return jsonError('Non authentifié', 401)

    // RLS normale : si l'appel n'est pas visible (pas participant, pas admin), ceci renvoie
    // null — donc pas besoin de re-vérifier l'appartenance manuellement.
    const { data: appel, error: appelError } = await userClient
      .from('appels_programmes')
      .select('id, daily_room_url, statut')
      .eq('id', appel_id)
      .maybeSingle()
    if (appelError) return jsonError(appelError.message, 500)
    if (!appel) return jsonError("Appel introuvable ou non autorisé", 404)
    if (appel.statut === 'ANNULE') return jsonError('Cet appel a été annulé.', 400)

    if (appel.daily_room_url) {
      return new Response(JSON.stringify({ url: appel.daily_room_url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: config, error: configError } = await serviceClient.rpc('__get_daily_config').single()
    if (configError) return jsonError(configError.message, 500)
    const { api_key, domain } = config as { api_key: string | null; domain: string | null }
    if (!api_key) {
      return jsonError("Aucun compte d'appel configuré pour l'instant — contactez l'administrateur.", 503)
    }

    const roomName = `appel-${appel_id}`
    const expUnix = Math.floor(Date.now() / 1000) + 6 * 3600 // salle valable 6h après la création

    const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: roomName,
        properties: { enable_recording: 'cloud', exp: expUnix, enable_chat: true }
      })
    })
    if (!dailyRes.ok) {
      const body = await dailyRes.text()
      return jsonError(`Échec de création de la salle d'appel : ${body}`, 502)
    }
    const room = await dailyRes.json() as { name: string; url?: string }
    const roomUrl = room.url ?? `https://${domain}/${room.name}`

    const { error: updateError } = await serviceClient
      .from('appels_programmes')
      .update({ daily_room_name: room.name, daily_room_url: roomUrl, statut: 'EN_COURS' })
      .eq('id', appel_id)
    if (updateError) return jsonError(updateError.message, 500)

    return new Response(JSON.stringify({ url: roomUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return jsonError(String(e), 500)
  }
})
