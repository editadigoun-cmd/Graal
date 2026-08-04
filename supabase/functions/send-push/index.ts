// Envoie une notification push web pour une ligne de `notifications` donnée.
// Appelée en interne par le trigger Postgres notifier_push() (via pg_net), authentifiée
// par un secret partagé lu depuis Vault — jamais exposée à un JWT utilisateur, d'où
// verify_jwt=false au déploiement. Push "vide" (sans payload chiffré) : le service worker
// affiche une notification générique et va chercher le contenu réel auprès de l'API à son
// réveil, ce qui évite d'implémenter le chiffrement aes128gcm de la charge utile (RFC 8291)
// tout en respectant le protocole Web Push standard (RFC 8030) et l'authentification VAPID
// (RFC 8292, signée ici avec l'API WebCrypto native de Deno).
import { createClient } from 'jsr:@supabase/supabase-js@2'

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function textToB64url(text: string): string {
  return bytesToB64url(new TextEncoder().encode(text))
}

interface VapidJwk { kty: string; crv: string; x: string; y: string; d: string }

async function signVapidJwt(jwk: VapidJwk, audience: string, subject: string): Promise<{ jwt: string; publicKey: string }> {
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, ext: true, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject }
  const signingInput = `${textToB64url(JSON.stringify(header))}.${textToB64url(JSON.stringify(payload))}`

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(signature))}`
  const publicKeyBytes = new Uint8Array([0x04, ...b64urlToBytes(jwk.x), ...b64urlToBytes(jwk.y)])
  return { jwt, publicKey: bytesToB64url(publicKeyBytes) }
}

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get('x-graal-secret')
    if (!secret) return new Response('unauthorized', { status: 401 })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: configRows } = await admin.rpc('__get_push_config')
    const config = configRows?.[0]
    if (!config?.trigger_secret || config.trigger_secret !== secret) return new Response('unauthorized', { status: 401 })
    if (!config.private_key_jwk) return new Response('vapid not configured', { status: 200 })

    const { notification_id } = await req.json()
    const { data: notif } = await admin.from('notifications').select('profile_id').eq('id', notification_id).single()
    if (!notif) return new Response('ok', { status: 200 })

    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', notif.profile_id)
    if (!subs || subs.length === 0) return new Response('ok', { status: 200 })

    const jwk: VapidJwk = JSON.parse(config.private_key_jwk)
    const subject = config.subject || 'mailto:contact@example.com'

    for (const sub of subs) {
      const audience = new URL(sub.endpoint).origin
      const { jwt, publicKey } = await signVapidJwt(jwk, audience, subject)

      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `vapid t=${jwt}, k=${publicKey}`,
          TTL: '60',
          'Content-Length': '0'
        }
      })

      if (res.status === 404 || res.status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
})
