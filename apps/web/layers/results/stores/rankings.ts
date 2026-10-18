import { defineStore } from 'pinia'

/**
 * Classements publics. Pendant les journées de tournoi, la page les
 * rafraîchit périodiquement ; l'API sert un cache recalculé à chaque résultat.
 */
export const useRankingsStore = defineStore('rankings', {
  state: () => ({
    players: { strikers: [] as any[], defenders: [] as any[] },
    schools: null as any,
    computedAt: null as string | null,
    pending: false,
    error: ''
  }),

  actions: {
    async fetch(editionId: string, options: { ageCategory?: string } = {}) {
      const { $api } = useNuxtApp()
      this.pending = true
      this.error = ''
      try {
        const query = new URLSearchParams({ limit: '50' })
        if (options.ageCategory) query.set('ageCategory', options.ageCategory)

        const [players, schools] = await Promise.all([
          $api.get<{ data: any }>(`/editions/${editionId}/rankings/players?${query}`),
          $api.get<{ data: any; meta?: any }>(`/editions/${editionId}/rankings/schools`)
        ])

        this.players = players.data
        this.schools = schools.data
        this.computedAt = schools.meta?.computedAt ?? null
        return { players: this.players, schools: this.schools }
      } catch (error: any) {
        this.error = error.message
        return null
      } finally {
        this.pending = false
      }
    },

    /** Rafraîchissement périodique, arrêté quand la page est quittée. */
    startPolling(editionId: string, intervalMs = 60000, options: { ageCategory?: string } = {}) {
      const timer = setInterval(() => this.fetch(editionId, options), intervalMs)
      if (import.meta.client) {
        onScopeDispose(() => clearInterval(timer))
      }
      return () => clearInterval(timer)
    }
  }
})
