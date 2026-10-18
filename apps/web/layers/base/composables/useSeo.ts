/**
 * Métadonnées d'une page publique : titre court, description, image de partage,
 * canonique, et données structurées JSON-LD. Les pages privées appellent
 * `useNoIndex()` à la place.
 */
export function useSeoPage(options: {
  title: string
  description?: string
  image?: string
  type?: 'website' | 'article'
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>
}) {
  const config = useRuntimeConfig()
  const route = useRoute()
  const { locale } = useI18n()

  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '')
  const canonical = `${siteUrl}${route.path}`
  const image = options.image || `${siteUrl}/og-default.svg`
  const title = options.title.slice(0, 60)
  const description = (options.description || '').slice(0, 155)

  useSeoMeta({
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogType: options.type || 'website',
    ogUrl: canonical,
    ogImage: image,
    ogLocale: locale.value === 'ar' ? 'ar_DJ' : 'fr_DJ',
    ogSiteName: 'Génération Mérite',
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: image
  })

  useHead({
    link: [{ rel: 'canonical', href: canonical }],
    script: options.jsonLd
      ? [
          {
            type: 'application/ld+json',
            innerHTML: JSON.stringify(options.jsonLd)
          }
        ]
      : []
  })

  return { canonical, siteUrl }
}

/** Espace parent et back-office : exclus de l'indexation. */
export function useNoIndex(title: string) {
  useHead({
    title,
    meta: [{ name: 'robots', content: 'noindex, nofollow' }]
  })
}

/** Fil d'Ariane structuré, posé sur les pages profondes. */
export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  const config = useRuntimeConfig()
  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '')
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`
    }))
  }
}
