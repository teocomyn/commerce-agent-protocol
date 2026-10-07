import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DUMMY_PASSWORD_HASH,
  createInvitationCredential,
  hashHumanPassword,
  hashInvitationToken,
  isInvitationTokenFormat,
  needsRehash,
  normalizeEmail,
  validateHumanPassword,
  verifyHumanPassword,
} from './human-auth'

// Same construction as the pre-2026-10 hashHumanPassword(): the hex text is the
// salt, Node's default scrypt parameters (N=16384, r=8, p=1), 32-byte key.
function legacyHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 32).toString('hex')}`
}

function weakModernHash(password: string): string {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, 64, { N: 2 ** 14, r: 8, p: 1 })
  return `scrypt$N=16384,r=8,p=1$${salt.toString('base64')}$${key.toString('base64')}`
}

describe('human dashboard authentication', () => {
  it('normalizes valid emails and rejects malformed input', () => {
    expect(normalizeEmail('  Teo@Example.COM ')).toBe('teo@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail('a@b')).toBeNull()
  })

  it('enforces password length boundaries', () => {
    expect(validateHumanPassword('too-short')).toMatch(/at least 12/)
    expect(validateHumanPassword('a'.repeat(12))).toBeNull()
    expect(validateHumanPassword('a'.repeat(256))).toBeNull()
    expect(validateHumanPassword('a'.repeat(257))).toMatch(/at most 256/)
  })

  it('refuses to hash or verify passwords longer than 256 characters', async () => {
    await expect(hashHumanPassword('a'.repeat(257))).rejects.toThrow(/at most 256/)
    const stored = await hashHumanPassword('a'.repeat(256))
    await expect(verifyHumanPassword('a'.repeat(256), stored)).resolves.toBe(true)
    await expect(verifyHumanPassword('a'.repeat(257), stored)).resolves.toBe(false)
  })

  it('hashes passwords with a random salt and verifies them safely', async () => {
    const first = await hashHumanPassword('a secure password')
    const second = await hashHumanPassword('a secure password')
    expect(first).not.toBe(second)
    await expect(verifyHumanPassword('a secure password', first)).resolves.toBe(true)
    await expect(verifyHumanPassword('wrong password', first)).resolves.toBe(false)
    await expect(verifyHumanPassword('a secure password', 'invalid')).resolves.toBe(false)
  })

  it('stores the scrypt parameters, a 16-byte salt and a 64-byte key in the hash', async () => {
    const stored = await hashHumanPassword('a secure password')
    const [algorithm, params, salt, key] = stored.split('$')
    expect(algorithm).toBe('scrypt')
    expect(params).toBe('N=32768,r=8,p=1')
    expect(Buffer.from(salt!, 'base64')).toHaveLength(16)
    expect(Buffer.from(key!, 'base64')).toHaveLength(64)
    expect(needsRehash(stored)).toBe(false)
  })

  it('still verifies legacy hashes and flags them for rehashing', async () => {
    const stored = legacyHash('a legacy password')
    await expect(verifyHumanPassword('a legacy password', stored)).resolves.toBe(true)
    await expect(verifyHumanPassword('wrong password', stored)).resolves.toBe(false)
    expect(needsRehash(stored)).toBe(true)
  })

  it('verifies hashes with weaker stored parameters and flags them for rehashing', async () => {
    const stored = weakModernHash('a secure password')
    await expect(verifyHumanPassword('a secure password', stored)).resolves.toBe(true)
    expect(needsRehash(stored)).toBe(true)
  })

  it('rejects malformed or unsupported hashes', async () => {
    const stored = await hashHumanPassword('a secure password')
    const [, , salt, key] = stored.split('$')
    for (const corrupted of [
      `scrypt$N=30000,r=8,p=1$${salt}$${key}`,
      `scrypt$N=${2 ** 21},r=8,p=1$${salt}$${key}`,
      // Valid shape, but beyond the memory budget scrypt runs with.
      `scrypt$N=${2 ** 20},r=8,p=1$${salt}$${key}`,
      `scrypt$N=32768,r=8$${salt}$${key}`,
      `bcrypt$N=32768,r=8,p=1$${salt}$${key}`,
      `scrypt$N=32768,r=8,p=1$${salt}$not base64!`,
      'scrypt$salt$abc',
    ]) {
      await expect(verifyHumanPassword('a secure password', corrupted)).resolves.toBe(false)
      expect(needsRehash(corrupted)).toBe(true)
    }
  })

  it('uses a current-format dummy hash that matches no password', async () => {
    expect(needsRehash(DUMMY_PASSWORD_HASH)).toBe(false)
    await expect(verifyHumanPassword('a secure password', DUMMY_PASSWORD_HASH)).resolves.toBe(false)
  })

  it('creates expiring invitation tokens and stores only their digest', () => {
    const now = Date.UTC(2026, 7, 25)
    const invitation = createInvitationCredential(now)
    expect(invitation.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isInvitationTokenFormat(invitation.token)).toBe(true)
    expect(isInvitationTokenFormat(`${invitation.token}=`)).toBe(false)
    expect(isInvitationTokenFormat('')).toBe(false)
    expect(invitation.tokenHash).toBe(hashInvitationToken(invitation.token))
    expect(invitation.tokenHash).not.toContain(invitation.token)
    expect(invitation.expiresAt.getTime()).toBe(now + 7 * 24 * 60 * 60 * 1_000)
  })
})
