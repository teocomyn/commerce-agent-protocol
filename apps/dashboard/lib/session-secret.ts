const MIN_SECRET_LENGTH = 32
// Random hex or base64 output of 32 bytes always has well over 12 distinct
// characters and never repeats a block; 'a'.repeat(32), '1234…' or
// 'abcdefghijkl'.repeat(3) are not secrets.
const MIN_DISTINCT_CHARACTERS = 12
// Same placeholder policy as the API (apps/api/src/lib/secrets.ts).
const PLACEHOLDER_PATTERNS = [/change_?me/i, /^your_/i, /replace[-_]with/i]

// True when the text is a block of at most half its length, repeated.
function isRepeatedBlock(value: string): boolean {
  for (let period = 1; period <= value.length / 2; period++) {
    let repeats = true
    for (let index = period; index < value.length && repeats; index++) {
      repeats = value[index] === value[index - period]
    }
    if (repeats) return true
  }
  return false
}
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
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(
      `DASHBOARD_SESSION_SECRET still contains the example placeholder value. ${GENERATE_HINT}`,
    )
  }
  if (new Set(value).size < MIN_DISTINCT_CHARACTERS || isRepeatedBlock(value)) {
    throw new Error(
      `DASHBOARD_SESSION_SECRET is trivially guessable (too few distinct characters or a repeated pattern). ${GENERATE_HINT}`,
    )
  }
  return value
}

export function dashboardSessionSecret(): string {
  return validateDashboardSessionSecret(process.env.DASHBOARD_SESSION_SECRET)
}
