import crypto from 'node:crypto'
import { isPlaceholderSecret } from './secrets.js'

export function operationsTokenConfigured(): boolean {
  const configured = process.env.CAP_OPERATIONS_TOKEN ?? ''
  return configured.length >= 32 && !isPlaceholderSecret(configured) && new Set(configured).size >= 12
}

export function verifyOperationsToken(provided: string | undefined): boolean {
  const configured = process.env.CAP_OPERATIONS_TOKEN
  if (!configured || !operationsTokenConfigured() || !provided) return false
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
