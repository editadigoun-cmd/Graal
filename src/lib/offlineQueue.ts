// File d'attente hors-ligne pour la saisie de visite. Persistée en localStorage : suffisant pour
// de petits objets JSON — la clôture a sa propre file (offlineCloture.ts), en IndexedDB, car elle
// doit aussi conserver la photo (blob).

export interface VisiteEnAttente {
  localId: string
  createdAt: string
  payload: Record<string, unknown>
  produits: string[]
}

const KEY = 'graal_offline_visites'

function readAll(): VisiteEnAttente[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeAll(items: VisiteEnAttente[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent('graal:offline-queue-changed'))
}

export function enqueueVisite(payload: Record<string, unknown>, produits: string[]) {
  const items = readAll()
  // Capturer l'heure de réalisation sur le téléphone au moment exact de la mise en attente.
  // Elle sera envoyée comme horodatage métier, jamais remplacée par l'heure de synchronisation.
  const createdAt = new Date().toISOString()
  items.push({
    localId: crypto.randomUUID(),
    createdAt,
    payload: { ...payload, horodatage: payload.horodatage ?? createdAt },
    produits
  })
  writeAll(items)
}

export function peekQueue() {
  return readAll()
}

export function queueLength() {
  return readAll().length
}

export function removeFromQueue(localId: string) {
  writeAll(readAll().filter((i) => i.localId !== localId))
}
