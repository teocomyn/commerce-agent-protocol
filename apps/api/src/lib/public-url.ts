// Public origin of this API. SHOPIFY_APP_URL is the deployed HTTPS URL (Shopify OAuth redirects there);
// without it, point at the local server rather than at a host this project does not run.
export function publicApiUrl(): string {
  const configured = process.env.SHOPIFY_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return `http://localhost:${process.env.PORT ?? process.env.API_PORT ?? '3000'}`
}
