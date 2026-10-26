import { defineStore } from 'pinia'

/** Portraits téléchargés de front, pour ne pas sérialiser soixante requêtes. */
const PHOTO_CONCURRENCY = 4

/**
 * Check-in du rendez-vous administratif. La liste du créneau et les portraits
 * des convoqués sont chargés à l'avance et conservés en IndexedDB ; chaque
 * opération porte une clé d'idempotence, ce qui permet de rejouer la file au
 * retour du réseau sans jamais encaisser deux fois.
 */
export const useCheckinStore = defineStore('checkin', {
  state: () => ({
    slotId: '' as string,
    slot: null as any,
    roster: [] as any[],
    queue: [] as any[],
    /** Portrait de chaque dossier, par identifiant : lien local vers le Blob. */
    photos: {} as Record<string, string>,
    online: true,
    pending: false,
    error: '',
    lastMessage: ''
  }),

  getters: {
    pendingCount: (state) => state.queue.length,
    checkedInCount: (state) => state.roster.filter((p) => p.status === 'checked_in').length,
    expectedCount: (state) => state.roster.length,
    photoCount: (state) => Object.keys(state.photos).length,
    photoFor: (state) => (registrationId: string) => state.photos[String(registrationId)] || '',
    findByToken: (state) => (token: string) =>
      state.roster.find((player) => player.qrToken === token) || null
  },

  actions: {
    async loadRoster(slotId: string) {
      const { $api } = useNuxtApp()
      const db = useOfflineDb()
      this.pending = true
      this.error = ''
      try {
        const { data } = await $api.get<{ data: any }>(`/slots/${slotId}/roster`)
        this.slotId = slotId
        this.slot = data.slot
        this.roster = data.players
        await db.saveRoster(data.players)
        await this.loadPhotos(data.players)
        this.lastMessage = ''
        return data
      } catch (error: any) {
        // Hors ligne : on retombe sur la liste déjà enregistrée.
        this.error = error.message
        this.roster = await db.readRoster().catch(() => [])
        await this.loadPhotos(this.roster)
        return null
      } finally {
        this.pending = false
        await this.refreshQueue()
      }
    },

    /**
     * Portraits de la liste, gardés en octets pour tenir hors ligne.
     *
     * C'est la contrepartie du scan : le badge ne porte qu'un jeton, et c'est
     * cet écran qui montre le visage, le nom et le numéro de dossier. Un lien
     * signé n'y suffirait pas — il expire en cinq minutes et suppose une
     * connexion, alors que le rendez-vous se tient parfois sans réseau.
     *
     * Les vignettes déjà en cache sont réutilisées telles quelles ; seules
     * manquent celles d'un dossier nouveau ou d'une photo remplacée depuis.
     */
    async loadPhotos(players: any[]) {
      if (!import.meta.client) return
      const db = useOfflineDb()
      const { blobFor } = useFiles()
      const cached = new Map(
        (await db.readPhotos().catch(() => [])).map((row) => [row.registrationId, row])
      )

      const blobs = new Map<string, Blob>()
      const missing: Array<{ id: string; fileId: string }> = []

      for (const player of players) {
        const fileId = player.player?.photoFileId
        if (!fileId) continue
        const id = String(player._id)
        const hit = cached.get(id)
        if (hit && hit.fileId === String(fileId)) blobs.set(id, hit.blob)
        else if (this.online) missing.push({ id, fileId: String(fileId) })
      }

      const fetchNext = async () => {
        while (missing.length) {
          const next = missing.shift()
          if (!next) return
          try {
            const blob = await blobFor(next.fileId, 'thumb')
            blobs.set(next.id, blob)
            await db.savePhoto({ registrationId: next.id, fileId: next.fileId, blob })
          } catch {
            // Portrait illisible ou absent : la ligne restera sans visage.
          }
        }
      }
      await Promise.all(Array.from({ length: PHOTO_CONCURRENCY }, fetchNext))

      this.revokePhotos()
      const urls: Record<string, string> = {}
      for (const [id, blob] of blobs) urls[id] = URL.createObjectURL(blob)
      this.photos = urls

      /*
       * Le cache suit la même discipline que la liste : un créneau à la fois.
       * On ne l'élague qu'en ligne — hors ligne, les portraits gardés sont tout
       * ce qu'on a, et les effacer rendrait le contrôle d'identité impossible.
       */
      if (this.online) await db.prunePhotos([...blobs.keys()]).catch(() => null)
    },

    /** Les liens locaux ne survivent pas à un rechargement de liste. */
    revokePhotos() {
      if (!import.meta.client) return
      for (const url of Object.values(this.photos)) URL.revokeObjectURL(url)
      this.photos = {}
    },

    /**
     * À qui appartient ce badge ?
     *
     * La liste chargée répond d'abord, pour que le scan fonctionne sans réseau.
     * Un jeton inconnu d'elle n'est pas forcément un faux badge : c'est le plus
     * souvent un convoqué d'un autre créneau qui se présente ici. Quand le
     * réseau est là, l'API le dit — le staff saute ainsi la recherche manuelle
     * dans les créneaux voisins.
     */
    async identify(token: string) {
      const player = this.findByToken(token)
      if (player) return { player, elsewhere: null as any }
      if (!this.online) return { player: null, elsewhere: null as any }

      const { $api } = useNuxtApp()
      try {
        const { data } = await $api.post<{ data: any }>('/checkin/scan', { qrToken: token })
        return { player: null, elsewhere: data.registration }
      } catch {
        return { player: null, elsewhere: null as any }
      }
    },

    async refreshQueue() {
      const db = useOfflineDb()
      this.queue = await db.readQueue().catch(() => [])
    },

    /**
     * Enregistre une inscription (check-in) : direct si le réseau répond, en
     * file sinon.
     *
     * `identityChecked` vient de l'écran, qui montre le portrait du dossier :
     * c'est la réponse du staff à la question « le visage correspond-il ? ».
     * L'API l'exige vrai, le bouton de validation reste donc fermé tant que la
     * case n'est pas cochée.
     */
    async checkIn(
      player: any,
      payload: {
        payment: any
        identityChecked: boolean
        bulletinChecked: boolean
        contractSigned: boolean
      }
    ) {
      const { $api } = useNuxtApp()
      const db = useOfflineDb()
      const operation = {
        idempotencyKey: `${player._id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        registrationId: player._id,
        occurredAt: new Date().toISOString(),
        payment: payload.payment,
        identityChecked: payload.identityChecked,
        bulletinChecked: payload.bulletinChecked,
        contractSigned: payload.contractSigned
      }

      if (this.online) {
        try {
          const { data } = await $api.post<{ data: any }>(`/checkin/${player._id}`, {
            payment: payload.payment,
            identityChecked: payload.identityChecked,
            bulletinChecked: payload.bulletinChecked,
            contractSigned: payload.contractSigned
          })
          const updated = {
            ...player,
            status: 'checked_in',
            bibNumber: data.registration.bibNumber,
            payment: data.registration.payment
          }
          this.applyLocal(updated)
          await db.updateRosterEntry(updated)
          return { ok: true, offline: false, bibNumber: data.registration.bibNumber }
        } catch (error: any) {
          if (error.status && error.status !== 0) {
            this.error = error.message
            return { ok: false, offline: false, error: error.message }
          }
          // Erreur réseau : on bascule en mode hors ligne.
          this.online = false
        }
      }

      await db.enqueue(operation)
      const updated = { ...player, status: 'checked_in', payment: payload.payment, pendingSync: true }
      this.applyLocal(updated)
      await db.updateRosterEntry(updated)
      await this.refreshQueue()
      return { ok: true, offline: true }
    },

    applyLocal(player: any) {
      const index = this.roster.findIndex((row) => row._id === player._id)
      if (index >= 0) this.roster.splice(index, 1, player)
      else this.roster.push(player)
    },

    /** Rejoue le lot d'opérations hors ligne ; les doublons sont ignorés par l'API. */
    async sync() {
      const { $api } = useNuxtApp()
      const db = useOfflineDb()
      await this.refreshQueue()
      if (!this.queue.length) return { applied: 0 }

      this.pending = true
      this.error = ''
      try {
        const { data } = await $api.post<{ data: any }>('/checkin/sync', {
          operations: this.queue.map((operation) => ({
            idempotencyKey: operation.idempotencyKey,
            registrationId: operation.registrationId,
            occurredAt: operation.occurredAt,
            payment: operation.payment,
            identityChecked: operation.identityChecked,
            bulletinChecked: operation.bulletinChecked,
            contractSigned: operation.contractSigned
          }))
        })

        for (const result of data.results) {
          if (result.outcome !== 'failed') await db.removeFromQueue(result.idempotencyKey)
        }
        await this.refreshQueue()
        if (this.slotId) await this.loadRoster(this.slotId)
        this.online = true
        return data
      } catch (error: any) {
        this.error = error.message
        return { applied: 0 }
      } finally {
        this.pending = false
      }
    },

    async closeSlot() {
      const { $api } = useNuxtApp()
      const { data } = await $api.post<{ data: any }>(`/slots/${this.slotId}/close`)
      await this.loadRoster(this.slotId)
      return data
    },

    watchConnection() {
      if (!import.meta.client) return
      this.online = navigator.onLine
      const goOnline = () => {
        this.online = true
        this.sync()
      }
      const goOffline = () => {
        this.online = false
      }
      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)
      onScopeDispose(() => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      })
    }
  }
})
