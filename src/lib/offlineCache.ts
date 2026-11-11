export interface OfflineSnapshot<T> {
  data: T
  savedAt: string
}

const DB_NAME = 'provisit-offline-v1'
const STORE_NAME = 'snapshots'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Ouverture du cache impossible'))
  })
}

function snapshotKey(userId: string, dataset: string) {
  return `${userId}::${dataset}`
}

/** Cache privé au compte connecté. Ne jamais utiliser pour des données publiques partagées. */
export async function saveOfflineSnapshot<T>(userId: string, dataset: string, data: T): Promise<void> {
  if (!userId || typeof indexedDB === 'undefined') return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put({ key: snapshotKey(userId, dataset), data, savedAt: new Date().toISOString() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  } catch (error) {
    console.warn('Impossible de conserver les données hors connexion :', error)
  }
}

export async function getOfflineSnapshot<T>(userId: string, dataset: string): Promise<OfflineSnapshot<T> | null> {
  if (!userId || typeof indexedDB === 'undefined') return null
  try {
    const db = await openDb()
    const value = await new Promise<OfflineSnapshot<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(snapshotKey(userId, dataset))
      request.onsuccess = () => {
        const row = request.result
        resolve(row ? { data: row.data as T, savedAt: row.savedAt as string } : null)
      }
      request.onerror = () => reject(request.error)
    })
    db.close()
    return value
  } catch (error) {
    console.warn('Lecture du cache hors connexion impossible :', error)
    return null
  }
}

export async function clearOfflineSnapshots(userId: string): Promise<void> {
  if (!userId || typeof indexedDB === 'undefined') return
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (String(cursor.key).startsWith(`${userId}::`)) cursor.delete()
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  } catch (error) {
    console.warn('Nettoyage du cache hors connexion impossible :', error)
  }
}
