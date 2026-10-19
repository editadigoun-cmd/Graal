// File d'attente hors-ligne pour la clôture de journée (motifs + photo + RPC).
// Contrairement à la saisie de visite (petits objets JSON en localStorage), la clôture
// embarque une photo binaire : on utilise IndexedDB, seul stockage local adapté à des
// blobs de plusieurs centaines de Ko sans risquer de dépasser le quota localStorage.

const DB_NAME = 'graal_offline'
const STORE = 'clotures_en_attente'
const KEY = 'pending'

export interface MotifLocal {
  programmeLigneId: string
  motifId: string
  commentaire: string | null
}

export interface PendingCloture {
  jour: string
  photoBlobs: Blob[]
  photoTypes: string[]
  latitude: number
  longitude: number
  motifsLocaux: MotifLocal[]
  reports?: { programme_ligne_id: string; jour_report: string }[]
  createdAt: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function notifyChanged() {
  window.dispatchEvent(new CustomEvent('graal:offline-cloture-changed'))
}

export async function savePendingCloture(data: PendingCloture): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(data, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  notifyChanged()
}

export async function getPendingCloture(): Promise<PendingCloture | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function clearPendingCloture(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  notifyChanged()
}
