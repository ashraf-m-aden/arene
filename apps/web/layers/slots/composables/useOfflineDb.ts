/**
 * Petit accès IndexedDB sans dépendance : la liste du créneau, les portraits
 * des convoqués et la file d'opérations de check-in survivent à une coupure
 * réseau et à un rechargement.
 */
const DB_NAME = 'arene-checkin'
/** v2 : ajout du magasin des portraits, préchargés avec la liste. */
const DB_VERSION = 2
const STORES = { roster: 'roster', queue: 'queue', photos: 'photos' } as const

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
      if (!db.objectStoreNames.contains(STORES.photos)) {
        db.createObjectStore(STORES.photos, { keyPath: 'registrationId' })
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

  /*
   * Portraits des convoqués, gardés sous forme d'octets.
   *
   * L'écran de check-in doit afficher un visage sans réseau : un lien signé ne
   * suffirait pas, il suppose une connexion et expire en cinq minutes. On
   * conserve donc le `Blob` lui-même, avec l'identifiant du fichier d'origine —
   * si le candidat remplace sa photo, la vignette en cache est périmée et doit
   * être retéléchargée.
   */
  const savePhoto = (entry: { registrationId: string; fileId: string; blob: Blob }) =>
    withStore(STORES.photos, 'readwrite', (store) => store.put(entry))

  const readPhotos = () =>
    withStore<Array<{ registrationId: string; fileId: string; blob: Blob }>>(
      STORES.photos,
      'readonly',
      (store) => store.getAll()
    )

  /** Les portraits des dossiers qui ne sont plus dans la liste sont oubliés. */
  const prunePhotos = async (keep: string[]) => {
    const kept = new Set(keep)
    const photos = await readPhotos().catch(() => [])
    for (const photo of photos) {
      if (!kept.has(photo.registrationId)) {
        await withStore(STORES.photos, 'readwrite', (store) =>
          store.delete(photo.registrationId)
        ).catch(() => null)
      }
    }
  }

  return {
    saveRoster,
    readRoster,
    updateRosterEntry,
    enqueue,
    readQueue,
    removeFromQueue,
    clearQueue,
    savePhoto,
    readPhotos,
    prunePhotos
  }
}
