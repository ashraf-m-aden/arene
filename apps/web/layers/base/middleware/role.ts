/**
 * Route réservée à un rôle. La page déclare le rôle attendu :
 * `definePageMeta({ middleware: ['auth', 'role'], role: 'staff' })`
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  if (import.meta.client && auth.status === 'idle') await auth.init()

  const required = to.meta.role as 'staff' | 'admin' | undefined
  if (!required) return

  const granted =
    required === 'admin' ? auth.isAdmin : auth.isStaff

  if (!granted) {
    throw createError({ statusCode: 403, statusMessage: 'Accès réservé à l’organisation' })
  }
})
