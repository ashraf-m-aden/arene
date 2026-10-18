import { defineStore } from 'pinia'

/**
 * Check-in du jour J. La liste du créneau est chargée à l'avance et conservée
 * en IndexedDB ; chaque opération porte une clé d'idempotence, ce qui permet
 * de rejouer la file au retour du réseau sans jamais encaisser deux fois.
 */
export const useCheckinStore = defineStore('checkin', {
  state: () => ({
    slotId: '' as string,
    slot: null as any,
    roster: [] as any[],
    queue: [] as any[],
    online: true,
    pending: false,
    error: '',
    lastMessage: ''
  }),

  getters: {
    pendingCount: (state) => state.queue.length,
    checkedInCount: (state) => state.roster.filter((p) => p.status === 'checked_in').length,
    expectedCount: (state) => state.roster.length,
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
        this.lastMessage = ''
        return data
      } catch (error: any) {
        // Hors ligne : on retombe sur la liste déjà enregistrée.
        this.error = error.message
        this.roster = await db.readRoster().catch(() => [])
        return null
      } finally {
        this.pending = false
        await this.refreshQueue()
      }
    },

    async refreshQueue() {
      const db = useOfflineDb()
      this.queue = await db.readQueue().catch(() => [])
    },

    /** Enregistre un check-in : direct si le réseau répond, en file sinon. */
    async checkIn(player: any, payload: { payment: any; bulletinChecked: boolean }) {
      const { $api } = useNuxtApp()
      const db = useOfflineDb()
      const operation = {
        idempotencyKey: `${player._id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        registrationId: player._id,
        occurredAt: new Date().toISOString(),
        payment: payload.payment,
        identityChecked: true,
        bulletinChecked: payload.bulletinChecked
      }

      if (this.online) {
        try {
          const { data } = await $api.post<{ data: any }>(`/checkin/${player._id}`, {
            payment: payload.payment,
            identityChecked: true,
            bulletinChecked: payload.bulletinChecked
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
            bulletinChecked: operation.bulletinChecked
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
