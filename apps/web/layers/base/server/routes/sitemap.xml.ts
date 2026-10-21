/**
 * Sitemap alimenté par l'API : éditions publiées, écoles et galeries.
 * Une entrée par langue, avec ses alternatives hreflang.
 */
interface Entry {
  path: string
  changefreq?: string
  priority?: number
  lastmod?: string
}

const STATIC_PAGES: Entry[] = [
  { path: '/', changefreq: 'daily', priority: 1 },
  { path: '/editions', changefreq: 'weekly', priority: 0.8 },
  { path: '/inscription', changefreq: 'weekly', priority: 0.9 },
  { path: '/ecoles', changefreq: 'weekly', priority: 0.7 },
  { path: '/galeries', changefreq: 'weekly', priority: 0.6 },
  { path: '/faq', changefreq: 'monthly', priority: 0.5 },
  { path: '/a-propos', changefreq: 'yearly', priority: 0.4 },
  { path: '/confidentialite', changefreq: 'yearly', priority: 0.3 }
]

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '')
  const apiBase = String(config.public.apiBase).replace(/\/$/, '')

  const safeGet = async <T>(url: string, fallback: T): Promise<T> => {
    try {
      const response = await $fetch<{ data: T }>(`${apiBase}${url}`)
      return response.data ?? fallback
    } catch {
      return fallback
    }
  }

  const [editions, schools] = await Promise.all([
    safeGet<any[]>('/editions', []),
    safeGet<any[]>('/schools?limit=100', [])
  ])

  const galleryLists = await Promise.all(
    editions.map((edition: any) => safeGet<any[]>(`/editions/${edition._id}/galleries`, []))
  )

  const entries: Entry[] = [
    ...STATIC_PAGES,
    ...editions.flatMap((edition: any) => [
      {
        path: `/editions/${edition.slug}`,
        changefreq: 'daily',
        priority: 0.9,
        lastmod: edition.updatedAt
      },
      {
        path: `/editions/${edition.slug}/classements`,
        changefreq: 'hourly',
        priority: 0.7,
        lastmod: edition.updatedAt
      },
      {
        path: `/editions/${edition.slug}/reglement`,
        changefreq: 'monthly',
        priority: 0.6,
        lastmod: edition.updatedAt
      }
    ]),
    ...schools.map((school: any) => ({
      path: `/ecoles/${school.slug}`,
      changefreq: 'weekly',
      priority: 0.5,
      lastmod: school.updatedAt
    })),
    ...galleryLists.flat().map((gallery: any) => ({
      path: `/galeries/${gallery.slug}`,
      changefreq: 'weekly',
      priority: 0.5,
      lastmod: gallery.publishedAt || gallery.updatedAt
    }))
  ]

  const url = (locale: string, path: string) =>
    `${siteUrl}${locale === 'ar' ? '/ar' : ''}${path === '/' && locale === 'ar' ? '' : path}`

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map((entry) =>
    ['fr', 'ar']
      .map(
        (locale) => `  <url>
    <loc>${url(locale, entry.path)}</loc>
${entry.lastmod ? `    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>\n` : ''}    <changefreq>${entry.changefreq || 'weekly'}</changefreq>
    <priority>${entry.priority ?? 0.5}</priority>
    <xhtml:link rel="alternate" hreflang="fr" href="${url('fr', entry.path)}"/>
    <xhtml:link rel="alternate" hreflang="ar" href="${url('ar', entry.path)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${url('fr', entry.path)}"/>
  </url>`
      )
      .join('\n')
  )
  .join('\n')}
</urlset>`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=1800')
  return body
})
