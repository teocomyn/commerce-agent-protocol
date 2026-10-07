import type { CAPError } from '@cap/shared'

// Longer than the Shopify call can take (3 attempts of 10 s plus backoff).
export const IDEMPOTENCY_IN_PROGRESS_MS = 2 * 60 * 1_000

export interface StoredCheckoutOutcome {
  status: 200 | 409 | 502
  body: unknown
}

export const OUTCOME_UNKNOWN_BODY: CAPError = {
  error: {
    code: 'IDEMPOTENCY_KEY_OUTCOME_UNKNOWN',
    message:
      'The first request with this Idempotency-Key did not finish; Shopify may or may not have created a cart. Retry with a new Idempotency-Key.',
  },
}

export function storedOutcome(response: unknown): StoredCheckoutOutcome | null {
  if (!response || typeof response !== 'object') return null
  const outcome = response as Partial<StoredCheckoutOutcome>
  return typeof outcome.status === 'number' && 'body' in outcome
    ? { status: outcome.status, body: outcome.body }
    : null
}
