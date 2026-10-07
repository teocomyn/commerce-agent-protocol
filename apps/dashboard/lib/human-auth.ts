import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(crypto.scrypt)
const SCRYPT_KEY_LENGTH = 32
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function validateHumanPassword(value: string): string | null {
  if (value.length < 12) return 'Password must contain at least 12 characters'
  if (value.length > 128) return 'Password must contain at most 128 characters'
  return null
}

export async function hashHumanPassword(password: string): Promise<string> {
  const validationError = validateHumanPassword(password)
  if (validationError) throw new Error(validationError)
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyHumanPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = stored.split('$')
  if (algorithm !== 'scrypt' || !salt || !expectedHex || !/^[a-f0-9]{64}$/.test(expectedHex)) {
    return false
  }
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH) as Buffer
  const expected = Buffer.from(expectedHex, 'hex')
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected)
}

export function createInvitationCredential(nowMs = Date.now()): {
  token: string
  tokenHash: string
  expiresAt: Date
} {
  const token = crypto.randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(nowMs + INVITATION_TTL_MS),
  }
}

export function isInvitationTokenFormat(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
