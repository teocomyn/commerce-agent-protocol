import type { CAPError } from '@cap/shared'
import { SHOPIFY_MAX_CALL_MS } from './shopify.js'

// Must outlast the Shopify cart call, whose duration is bounded (retries and
// Retry-After included): a key is only reported as unknown once the first
// request can no longer be creating a cart.
export const IDEMPOTENCY_IN_PROGRESS_MS = Math.max(2 * 60 * 1_000, SHOPIFY_MAX_CALL_MS + 30_000)

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
