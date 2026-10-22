import { defineStore } from 'pinia'

/** Garde l'édition courante en cache pour tout le site. */
export const useEditionsStore = defineStore('editions', {
  state: () => ({
    current: null as any,
    bySlug: {} as Record<string, any>,
    list: [] as any[],
    pending: false,
    error: ''
  }),

  getters: {
    isRegistrationOpen: (state) => editionWindowState(state.current) === 'open',
    currentSlug: (state) => state.current?.slug ?? null
  },

  actions: {
    async fetchCurrent(force = false) {
      if (this.current && !force) return this.current
      const { $api } = useNuxtApp()
      this.pending = true
      try {
        const { data } = await $api.get<{ data: any }>('/editions/current')
        this.current = data
        if (data?.slug) this.bySlug[data.slug] = data
        return data
      } catch (error: any) {
        this.error = error.message
        return null
      } finally {
        this.pending = false
      }
    },

    async fetchList() {
      const { $api } = useNuxtApp()
      const { data } = await $api.get<{ data: any[] }>('/editions')
      this.list = data
      return data
    },

    async createEdition(payload: Record<string, unknown>) {
      const { $api } = useNuxtApp()
      const { data } = await $api.post<{ data: any }>('/editions', payload)
      return data
    },

    async updateEdition(id: string, patch: Record<string, unknown>) {
      const { $api } = useNuxtApp()
      const { data } = await $api.patch<{ data: any }>(`/editions/${id}`, patch)
      if (data?.slug) this.bySlug[data.slug] = data
      if (this.current?._id === id) this.current = data
      return data
    },

    async fetchBySlug(slug: string, force = false) {
      if (this.bySlug[slug] && !force) return this.bySlug[slug]
      const { $api } = useNuxtApp()
      const { data } = await $api.get<{ data: any }>(`/editions/${slug}`)
      this.bySlug[slug] = data
      return data
    },

    async fetchSlots(editionId: string) {
      const { $api } = useNuxtApp()
      const { data } = await $api.get<{ data: any[] }>(`/editions/${editionId}/slots`)
      return data
    },

    async fetchStats(editionId: string) {
      const { $api } = useNuxtApp()
      const { data } = await $api.get<{ data: any }>(`/editions/${editionId}/stats`)
      return data
    }
  }
})
