import type { Context } from 'hono'
import type { CapOutcome } from '../services/outcome.js'

/** Sends a service outcome as the HTTP response: same status, body and headers. */
export function sendOutcome(c: Context, outcome: CapOutcome): Response {
  for (const [name, value] of Object.entries(outcome.headers ?? {})) c.header(name, value)
  return c.json(outcome.body as object, outcome.status)
}
