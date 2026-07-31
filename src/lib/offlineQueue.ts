// File d'attente hors-ligne pour la saisie de visite (le seul geste terrain qui doit rester
// possible sans réseau — la clôture, elle, exige un upload de photo et reste en ligne).
// Persistée en localStorage : suffisant pour de petits objets JSON, contrairement aux photos.

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
