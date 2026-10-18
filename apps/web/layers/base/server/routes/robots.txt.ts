/** L'espace parent, le back-office et l'API restent hors des moteurs. */
export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')

  return [
    'User-agent: *',
    'Disallow: /compte',
    'Disallow: /ar/compte',
    'Disallow: /admin',
    'Disallow: /ar/admin',
    'Disallow: /staff',
    'Disallow: /ar/staff',
    'Disallow: /api',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`
  ].join('\n')
})
