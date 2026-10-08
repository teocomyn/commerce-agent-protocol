import type { CAPError } from '@cap/shared'

/**
 * Transport-neutral result of a CAP operation. The REST routes turn it into
 * an HTTP response and the MCP tools into a tool result, so both channels
 * return the same body, status and error codes.
 */
export interface CapOutcome<T = unknown> {
  status: 200 | 400 | 403 | 404 | 409 | 422 | 500 | 502 | 503
  body: T | CAPError
  headers?: Record<string, string>
}

export const ok = <T>(body: T, headers?: Record<string, string>): CapOutcome<T> => ({
  status: 200,
  body,
  ...(headers && { headers }),
})

export const failure = (
  status: Exclude<CapOutcome['status'], 200>,
  code: string,
  message: string,
  details?: unknown,
): CapOutcome<never> => ({
  status,
  body: { error: { code, message, ...(details !== undefined && { details }) } } as CAPError,
})
