// Public origin of the marketing site: canonical URLs, Open Graph, robots and the sitemap derive from it.
// Set NEXT_PUBLIC_SITE_URL once a domain is confirmed; on Vercel the production hostname is used meanwhile.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3002'
}

export const SITE_URL = resolveSiteUrl()
