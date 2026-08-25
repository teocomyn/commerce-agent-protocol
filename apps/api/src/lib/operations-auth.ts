import crypto from 'node:crypto'

export function operationsTokenConfigured(): boolean {
  return (process.env.CAP_OPERATIONS_TOKEN?.length ?? 0) >= 32
}

export function verifyOperationsToken(provided: string | undefined): boolean {
  const configured = process.env.CAP_OPERATIONS_TOKEN
  if (!configured || configured.length < 32 || !provided) return false
  const expected = Buffer.from(configured)
  const received = Buffer.from(provided)
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

export function extractOperationsToken(headers: Headers): string | undefined {
  const direct = headers.get('X-CAP-Operations-Token')
  if (direct) return direct
  const authorization = headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined
  return authorization.slice('Bearer '.length)
}
