// Reçoit les webhooks Daily.co (notamment "recording.ready-to-download") et enregistre le
// lien de l'enregistrement dans appel_enregistrements, visible ensuite par admin/superviseur
// dans l'application. URL à configurer dans le dashboard Daily.co (Developers > Webhooks)
// une fois le compte créé — voir 034_appels_programmes.sql pour les secrets à renseigner.
//
// ATTENTION : le nom exact des champs du payload (event type, chemin du lien de
// téléchargement) est basé sur la documentation Daily.co au moment de l'écriture de cette
// fonction — à vérifier/ajuster une fois le compte réel connecté et un premier webhook reçu
// en pratique (consulter les logs de la fonction), car ces détails peuvent évoluer.
import { createClient } from 'jsr:@supabase/supabase-js@2'

async function verifySignature(rawBody: string, signatureHeader: string | null, secret: string | null): Promise<boolean> {
  if (!secret) return true // pas de secret configuré : on accepte (à sécuriser dès que possible)
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return expected === signatureHeader.replace(/^sha256=/, '')
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text()
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: config } = await serviceClient.rpc('__get_daily_config').single()
    const { webhook_secret } = (config ?? {}) as { webhook_secret: string | null }

    const signature = req.headers.get('x-webhook-hmac-sha256') ?? req.headers.get('daily-signature')
    const valid = await verifySignature(rawBody, signature, webhook_secret ?? null)
    if (!valid) return new Response('invalid signature', { status: 401 })

    const event = JSON.parse(rawBody)
    const roomName = event.payload?.room_name as string | undefined
    if (!roomName) return new Response('payload incomplet, ignoré', { status: 200 })

    const { data: appel } = await serviceClient
      .from('appels_programmes')
      .select('id')
      .eq('daily_room_name', roomName)
      .maybeSingle()
    if (!appel) return new Response('appel introuvable pour cette salle', { status: 200 })

    if (event.type === 'recording.ready-to-download') {
      const downloadLink = (event.payload?.download_link ?? event.payload?.downloadUrl ?? event.payload?.url) as string | undefined
      const duration = event.payload?.duration as number | undefined
      if (!downloadLink) return new Response('lien manquant, ignoré', { status: 200 })
      await serviceClient.from('appel_enregistrements').insert({
        appel_id: appel.id, url: downloadLink, duree_secondes: duration ?? null
      })
      await serviceClient.from('appels_programmes').update({ statut: 'TERMINE' }).eq('id', appel.id)
    } else if (event.type === 'meeting.ended') {
      // Marque l'appel terminé même sans enregistrement (ex : palier Daily.co sans
      // enregistrement cloud) — sinon "Rejoindre" resterait affiché indéfiniment.
      await serviceClient.from('appels_programmes').update({ statut: 'TERMINE' })
        .eq('id', appel.id).eq('statut', 'EN_COURS')
    } else {
      return new Response('ignored', { status: 200 })
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    return new Response(String(e), { status: 500 })
  }
})
