import { defineStore } from 'pinia'

export const useSchoolsStore = defineStore('schools', {
  state: () => ({
    list: [] as any[],
    pending: false,
    error: ''
  }),

  actions: {
    async search(params: { q?: string; type?: string } = {}) {
      const { $api } = useNuxtApp()
      this.pending = true
      try {
        const query = new URLSearchParams()
        if (params.q) query.set('q', params.q)
        if (params.type) query.set('type', params.type)
        const { data } = await $api.get<{ data: any[] }>(`/schools?${query}`)
        this.list = data
        return data
      } catch (error: any) {
        this.error = error.message
        return []
      } finally {
        this.pending = false
      }
    },

    async fetchProfile(slug: string) {
      const { $api } = useNuxtApp()
      const { data } = await $api.get<{ data: any }>(`/schools/${slug}`)
      return data
    }
  }
})
