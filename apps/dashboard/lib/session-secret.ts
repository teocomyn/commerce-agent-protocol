const MIN_SECRET_LENGTH = 32
// Random hex or base64 output of 32 bytes always has well over 12 distinct
// characters; values like 'a'.repeat(32) or '1234…' do not.
const MIN_DISTINCT_CHARACTERS = 12
const GENERATE_HINT = 'Generate one with `openssl rand -hex 32` and set it in the dashboard environment.'

/**
 * Validates the HMAC secret used to sign dashboard sessions. Kept free of
 * Next.js and Prisma imports so the boot check in instrumentation.ts and the
 * unit tests can load it without side effects.
 */
export function validateDashboardSessionSecret(value: string | undefined): string {
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `DASHBOARD_SESSION_SECRET must contain at least ${MIN_SECRET_LENGTH} characters. ${GENERATE_HINT}`,
    )
  }
  if (/change_me/i.test(value) || /^your_/i.test(value)) {
    throw new Error(
      `DASHBOARD_SESSION_SECRET still contains the example placeholder value. ${GENERATE_HINT}`,
    )
  }
  if (new Set(value).size < MIN_DISTINCT_CHARACTERS) {
    throw new Error(
      `DASHBOARD_SESSION_SECRET is trivially guessable (too few distinct characters). ${GENERATE_HINT}`,
    )
  }
  return value
}

export function dashboardSessionSecret(): string {
  return validateDashboardSessionSecret(process.env.DASHBOARD_SESSION_SECRET)
}
