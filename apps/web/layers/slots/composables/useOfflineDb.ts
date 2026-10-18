/**
 * Petit accès IndexedDB sans dépendance : la liste du créneau et la file
 * d'opérations de check-in survivent à une coupure réseau et à un rechargement.
 */
const DB_NAME = 'gm-checkin'
const DB_VERSION = 1
const STORES = { roster: 'roster', queue: 'queue' } as const

type StoreName = (typeof STORES)[keyof typeof STORES]

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!import.meta.client || !('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponible'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.roster)) {
        db.createObjectStore(STORES.roster, { keyPath: '_id' })
      }
      if (!db.objectStoreNames.contains(STORES.queue)) {
        db.createObjectStore(STORES.queue, { keyPath: 'idempotencyKey' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(name, mode)
    const request = run(transaction.objectStore(name))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

export function useOfflineDb() {
  const saveRoster = async (players: any[]) => {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORES.roster, 'readwrite')
      const store = transaction.objectStore(STORES.roster)
      store.clear()
      for (const player of players) store.put(player)
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
    })
  }

  const readRoster = () => withStore<any[]>(STORES.roster, 'readonly', (store) => store.getAll())

  const updateRosterEntry = (player: any) =>
    withStore(STORES.roster, 'readwrite', (store) => store.put(player))

  const enqueue = (operation: any) =>
    withStore(STORES.queue, 'readwrite', (store) => store.put(operation))

  const readQueue = () => withStore<any[]>(STORES.queue, 'readonly', (store) => store.getAll())

  const removeFromQueue = (idempotencyKey: string) =>
    withStore(STORES.queue, 'readwrite', (store) => store.delete(idempotencyKey))

  const clearQueue = () => withStore(STORES.queue, 'readwrite', (store) => store.clear())

  return { saveRoster, readRoster, updateRosterEntry, enqueue, readQueue, removeFromQueue, clearQueue }
}
