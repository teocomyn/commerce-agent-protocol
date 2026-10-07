/**
 * Public origin of the dashboard (scheme, host and port browsers use).
 * Kept free of Next.js and Prisma imports so instrumentation.ts and unit
 * tests can load it.
 */
export function configuredDashboardOrigin(value: string | undefined = process.env.DASHBOARD_URL): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

/**
 * Production must know its public origin: same-origin checks and redirects
 * cannot trust the Host or X-Forwarded-* headers a client can send.
 */
export function validateDashboardUrl(env: NodeJS.ProcessEnv = process.env): void {
  if (env['NODE_ENV'] !== 'production') return
  const origin = configuredDashboardOrigin(env['DASHBOARD_URL'])
  if (!origin || !origin.startsWith('https://')) {
    throw new Error('DASHBOARD_URL must be set to the public https URL of the dashboard in production.')
  }
}
