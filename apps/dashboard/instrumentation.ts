/**
 * Runs once when a Next.js server instance starts (never during `next build`).
 * Fails fast on a missing or placeholder session secret, or a missing public
 * DASHBOARD_URL in production, instead of waiting for the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'test') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { dashboardSessionSecret } = await import('./lib/session-secret')
  const { validateDashboardUrl } = await import('./lib/public-origin')
  try {
    dashboardSessionSecret()
    validateDashboardUrl()
  } catch (error) {
    // Next.js only logs a failing register() and keeps serving 500s, so exit
    // explicitly to make the deploy fail instead of running half-configured.
    console.error(`[cap-dashboard] Refusing to start: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
