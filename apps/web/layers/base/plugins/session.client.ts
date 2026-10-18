/** Au chargement côté client, on tente de retrouver une session ouverte. */
export default defineNuxtPlugin(async () => {
  const auth = useAuthStore()
  await auth.init()
})
