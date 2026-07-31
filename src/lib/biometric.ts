// Verrou biométrique local (Face ID / empreinte) — couche de confort au-dessus d'une session
// Supabase déjà valide et persistée localement. Il ne s'agit PAS d'une ré-authentification
// serveur : la biométrie ne fait que déverrouiller l'accès à l'app sur cet appareil de confiance,
// via l'authenticator de la plateforme (WebAuthn), sans aller-retour réseau.

const CREDENTIAL_KEY = 'graal_biometric_credential_id'

export async function isBiometricAvailable() {
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function hasBiometricEnrolled() {
  return Boolean(localStorage.getItem(CREDENTIAL_KEY))
}

export async function enrollBiometric(userId: string, userLabel: string) {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'GRAAL Medical Solutions' },
      user: { id: new TextEncoder().encode(userId), name: userLabel, displayName: userLabel },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000
    }
  })
  if (cred) {
    localStorage.setItem(CREDENTIAL_KEY, (cred as PublicKeyCredential).id)
    return true
  }
  return false
}

export async function unlockWithBiometric() {
  const id = localStorage.getItem(CREDENTIAL_KEY)
  if (!id) return false
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    })
    return Boolean(assertion)
  } catch {
    return false
  }
}

export function clearBiometricEnrollment() {
  localStorage.removeItem(CREDENTIAL_KEY)
}
