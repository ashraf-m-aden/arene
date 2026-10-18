import { defineStore } from 'pinia'

export type Role = 'parent' | 'staff' | 'admin'

export interface SessionUser {
  _id: string
  firstName: string
  lastName: string
  fullName?: string
  email?: string
  phone?: string
  role: Role
  locale: 'fr' | 'ar'
}

/**
 * Session : le jeton d'accès reste en mémoire (15 minutes), le jeton de
 * rafraîchissement vit dans un cookie httpOnly posé par l'API.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as SessionUser | null,
    accessToken: '' as string,
    status: 'idle' as 'idle' | 'loading' | 'ready',
    lastError: '' as string
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.user),
    isStaff: (state) => state.user?.role === 'staff' || state.user?.role === 'admin',
    isAdmin: (state) => state.user?.role === 'admin',
    initials: (state) =>
      state.user ? `${state.user.firstName?.[0] ?? ''}${state.user.lastName?.[0] ?? ''}` : ''
  },

  actions: {
    setSession(payload: { accessToken: string; user: SessionUser }) {
      this.accessToken = payload.accessToken
      this.user = payload.user
      this.status = 'ready'
      this.lastError = ''
    },

    clear() {
      this.accessToken = ''
      this.user = null
      this.status = 'ready'
    },

    async login(identifier: string, password: string) {
      const { $api } = useNuxtApp()
      this.status = 'loading'
      try {
        const { data } = await $api.post<{ data: any }>('/auth/login', { identifier, password })
        this.setSession(data)
        return data.user as SessionUser
      } catch (error: any) {
        this.lastError = error.message
        this.status = 'ready'
        throw error
      }
    },

    async register(payload: Record<string, unknown>) {
      const { $api } = useNuxtApp()
      const { data } = await $api.post<{ data: any }>('/auth/register', payload)
      this.setSession(data)
      return data.user as SessionUser
    },

    async requestOtp(phone: string) {
      const { $api } = useNuxtApp()
      return $api.post('/auth/otp/request', { phone })
    },

    async verifyOtp(phone: string, code: string) {
      const { $api } = useNuxtApp()
      const { data } = await $api.post<{ data: any }>('/auth/otp/verify', { phone, code })
      this.setSession(data)
      return data.user as SessionUser
    },

    /** Renouvellement silencieux : vrai si une session valide a été retrouvée. */
    async refresh() {
      const { $api } = useNuxtApp()
      try {
        const { data } = await $api.post<{ data: any }>('/auth/refresh')
        this.setSession(data)
        return true
      } catch {
        this.clear()
        return false
      }
    },

    async logout() {
      const { $api } = useNuxtApp()
      await $api.post('/auth/logout').catch(() => null)
      this.clear()
      await navigateTo(useLocalePath()('/'))
    },

    /** Appelé au premier rendu client pour retrouver une session ouverte. */
    async init() {
      if (this.status !== 'idle') return
      this.status = 'loading'
      await this.refresh()
      this.status = 'ready'
    }
  }
})
