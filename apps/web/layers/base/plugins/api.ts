import type { FetchOptions } from 'ofetch'

export interface ApiError {
  status: number
  code?: string
  /** Clé de traduction `apiError.*` posée par l'API. */
  key?: string
  message: string
  details?: Array<{ path?: string; message: string }> | Record<string, unknown>
}

/**
 * Quand l'API n'a rien renvoyé — serveur injoignable, CORS, délai dépassé — ofetch
 * produit un message technique du genre `[POST] "…/auth/login": <no response> Failed
 * to fetch`. Il ne doit jamais atteindre l'écran : on lui substitue une clé traduite.
 */
function fallbackCode(status: number, error: any): string {
  if (status === 0) {
    const name = String(error?.name || '')
    const message = String(error?.message || '')
    const timedOut = name === 'AbortError' || name === 'TimeoutError' || /timeout/i.test(message)
    return timedOut ? 'timeout' : 'network'
  }
  if (status >= 500) return 'server'
  return 'unexpected'
}

/**
 * Les messages de Zod sont en anglais ("String must contain at least 5 character(s)").
 * On les remplace par une clé `validation.*` déduite du code de l'anomalie, avec les
 * bornes transmises par l'API. Sans correspondance, le message d'origine est conservé :
 * les règles `custom` des schémas partagés sont déjà rédigées en français.
 */
function validationKey(detail: any): { key: string; params: Record<string, unknown> } | null {
  const bounds = { min: detail?.minimum, max: detail?.maximum }
  switch (detail?.code) {
    case 'invalid_type':
      return detail?.received === 'undefined'
        ? { key: 'required', params: {} }
        : { key: 'invalid', params: {} }
    case 'too_small':
      return detail?.type === 'string'
        ? { key: 'tooShort', params: bounds }
        : { key: 'tooSmall', params: bounds }
    case 'too_big':
      return detail?.type === 'string'
        ? { key: 'tooLong', params: bounds }
        : { key: 'tooBig', params: bounds }
    case 'invalid_string':
      if (detail?.validation === 'email') return { key: 'email', params: {} }
      if (detail?.validation === 'url') return { key: 'url', params: {} }
      return { key: 'invalid', params: {} }
    case 'invalid_date':
      return { key: 'date', params: {} }
    case 'invalid_enum_value':
      return { key: 'enum', params: {} }
    default:
      return null
  }
}

/**
 * Client HTTP unique : il ajoute le jeton et la langue, renouvelle le jeton
 * expiré une seule fois en silence, et traduit les erreurs de l'API en objets
 * exploitables par les formulaires. Les stores passent toujours par ici.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  /** Traduit si la clé existe, sinon renvoie undefined pour laisser la main au repli. */
  const translate = (path: string, params?: Record<string, unknown>): string | undefined => {
    const i18n = nuxtApp.$i18n as any
    if (typeof i18n?.t !== 'function') return undefined
    if (typeof i18n.te === 'function' && !i18n.te(path)) return undefined
    const translated = params ? i18n.t(path, params) : i18n.t(path)
    return translated && translated !== path ? translated : undefined
  }

  /** Réécrit chaque message de champ dans la langue du visiteur. */
  const localiseDetails = (details: any) => {
    if (!Array.isArray(details)) return details
    return details.map((detail: any) => {
      const match = validationKey(detail)
      const message = match ? translate(`validation.${match.key}`, match.params) : undefined
      return message ? { ...detail, message } : detail
    })
  }

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

      // Ordre de préférence : la clé traduite de l'API, puis son message français,
      // puis notre repli réseau. Le message brut d'ofetch n'est jamais affiché.
      const fallback = fallbackCode(status, error)
      const apiError: ApiError = {
        status,
        code: payload?.code || fallback,
        key: payload?.key,
        message:
          (payload?.key && translate(`apiError.${payload.key}`)) ||
          payload?.message ||
          translate(`error.${fallback}`) ||
          'Erreur réseau',
        details: localiseDetails(payload?.details)
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
