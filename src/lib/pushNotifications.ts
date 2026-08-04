import { supabase } from './supabase'

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return !!subscription
}

export async function subscribeToPush(profileId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'Non supporté sur ce navigateur.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: 'Permission refusée.' }

  const { data: param } = await supabase.from('parametres').select('value').eq('key', 'vapid_public_key').maybeSingle()
  const publicKey = param?.value as string | undefined
  if (!publicKey) return { ok: false, error: 'Notifications push non configurées côté serveur.' }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, error: 'Abonnement invalide.' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { profile_id: profileId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' }
  )
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe()
  }
}
