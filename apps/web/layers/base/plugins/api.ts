import type { FetchOptions } from 'ofetch'

export interface ApiError {
  status: number
  code?: string
  message: string
  details?: Array<{ path?: string; message: string }> | Record<string, unknown>
}

/**
 * Client HTTP unique : il ajoute le jeton et la langue, renouvelle le jeton
 * expiré une seule fois en silence, et traduit les erreurs de l'API en objets
 * exploitables par les formulaires. Les stores passent toujours par ici.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()

  let refreshing: Promise<boolean> | null = null

  const call = async <T>(request: string, options: FetchOptions = {}, retried = false): Promise<T> => {
    const auth = useAuthStore()
    const locale = (nuxtApp.$i18n as any)?.locale?.value ?? 'fr'

    const headers: Record<string, string> = {
      'Accept-Language': locale,
      ...((options.headers as Record<string, string>) || {})
    }
    if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`

    try {
      return (await $fetch<T>(request, {
        baseURL: config.public.apiBase,
        credentials: 'include',
        retry: 0,
        ...options,
        headers
      })) as T
    } catch (error: any) {
      const status = error?.response?.status ?? error?.statusCode ?? 0
      const payload = error?.response?._data?.error

      if (status === 401 && !retried && !request.startsWith('/auth/')) {
        refreshing = refreshing ?? auth.refresh()
        const renewed = await refreshing
        refreshing = null
        if (renewed) return call<T>(request, options, true)
        auth.clear()
      }

      const apiError: ApiError = {
        status,
        code: payload?.code,
        message: payload?.message || error?.message || 'Erreur réseau',
        details: payload?.details
      }
      throw apiError
    }
  }

  const api = {
    get: <T>(url: string, options?: FetchOptions) => call<T>(url, { ...options, method: 'GET' }),
    post: <T>(url: string, body?: unknown, options?: FetchOptions) =>
      call<T>(url, { ...options, method: 'POST', body: body as any }),
    patch: <T>(url: string, body?: unknown, options?: FetchOptions) =>
      call<T>(url, { ...options, method: 'PATCH', body: body as any }),
    put: <T>(url: string, body?: unknown, options?: FetchOptions) =>
      call<T>(url, { ...options, method: 'PUT', body: body as any }),
    delete: <T>(url: string, options?: FetchOptions) =>
      call<T>(url, { ...options, method: 'DELETE' }),
    raw: call
  }

  return { provide: { api } }
})
