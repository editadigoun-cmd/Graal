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
  items.push({ localId: crypto.randomUUID(), createdAt: new Date().toISOString(), payload, produits })
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
