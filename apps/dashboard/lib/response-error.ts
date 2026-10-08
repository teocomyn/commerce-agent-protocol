export const NETWORK_ERROR_MESSAGE = 'Could not reach the dashboard server. Check your connection and try again.'

/**
 * Message to show for a failed dashboard API call: the server's `{ error }`
 * text when it sent one, otherwise the caller's fallback. Safe for client
 * components (no server-only imports).
 */
export async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null
  const message = typeof body?.error === 'string' ? body.error.trim() : ''
  return message || fallback
}
