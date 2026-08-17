// Reçoit les webhooks Daily.co (notamment "recording.ready-to-download") et enregistre le
// lien de l'enregistrement dans appel_enregistrements, visible ensuite par admin/superviseur
// dans l'application. Le webhook est enregistré côté Daily.co via leur API (POST /v1/webhooks)
// — voir 036_appels_verification_enregistrements.sql pour le filet de sécurité par sondage,
// qui rattrape les cas où ce webhook ne serait pas livré.
//
// Vérification de signature : Daily.co signe avec HMAC-SHA256 sur `${timestamp}.${corpsBrut}`,
// clé = secret décodé en base64, signature encodée en base64, transmise via les en-têtes
// X-Webhook-Timestamp / X-Webhook-Signature.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

async function verifySignature(rawBody: string, timestamp: string | null, signatureHeader: string | null, secretBase64: string | null): Promise<boolean> {
  if (!secretBase64) return false // pas de secret configuré : on refuse plutôt que d'accepter des requêtes non signées
  if (!timestamp || !signatureHeader) return false
  const key = await crypto.subtle.importKey(
    'raw', base64ToBytes(secretBase64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const message = `${timestamp}.${rawBody}`
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  const expected = bytesToBase64(new Uint8Array(sigBytes))
  return expected === signatureHeader
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

    const timestamp = req.headers.get('x-webhook-timestamp')
    const signature = req.headers.get('x-webhook-signature')
    const valid = await verifySignature(rawBody, timestamp, signature, webhook_secret ?? null)
    if (!valid) return new Response('invalid signature', { status: 401 })

    const event = JSON.parse(rawBody)
    // Le champ contenant les données de l'événement s'appelle "payload" d'après le SDK Daily,
    // mais la casse exacte des sous-champs (snake_case vs camelCase) n'a pas pu être vérifiée
    // avant un premier événement réel — on accepte les deux formes par prudence.
    const data = event.payload ?? event.object ?? {}
    const roomName = (data.room_name ?? data.roomName) as string | undefined
    if (!roomName) return new Response('payload incomplet, ignoré', { status: 200 })

    const { data: appel } = await serviceClient
      .from('appels_programmes')
      .select('id')
      .eq('daily_room_name', roomName)
      .maybeSingle()
    if (!appel) return new Response('appel introuvable pour cette salle', { status: 200 })

    if (event.type === 'recording.ready-to-download') {
      const downloadLink = (data.download_link ?? data.downloadLink ?? data.downloadUrl ?? data.url) as string | undefined
      const duration = (data.duration ?? data.durationSeconds) as number | undefined
      const recordingId = (data.recording_id ?? data.recordingId ?? data.id) as string | undefined
      if (!downloadLink) return new Response('lien manquant, ignoré', { status: 200 })
      await serviceClient.from('appel_enregistrements').upsert({
        appel_id: appel.id, url: downloadLink, duree_secondes: duration ?? null, daily_recording_id: recordingId ?? null
      }, { onConflict: 'daily_recording_id', ignoreDuplicates: true })
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
