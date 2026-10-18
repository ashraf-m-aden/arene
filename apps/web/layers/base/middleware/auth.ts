/** Route réservée aux comptes connectés : renvoie vers la connexion. */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  if (import.meta.client && auth.status === 'idle') await auth.init()
  if (auth.isLoggedIn) return

  const localePath = useLocalePath()
  return navigateTo({ path: localePath('/connexion'), query: { suivant: to.fullPath } })
})
