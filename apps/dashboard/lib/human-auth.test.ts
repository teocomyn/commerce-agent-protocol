import { describe, expect, it } from 'vitest'
import {
  createInvitationCredential,
  hashHumanPassword,
  hashInvitationToken,
  isInvitationTokenFormat,
  normalizeEmail,
  validateHumanPassword,
  verifyHumanPassword,
} from './human-auth'

describe('human dashboard authentication', () => {
  it('normalizes valid emails and rejects malformed input', () => {
    expect(normalizeEmail('  Teo@Example.COM ')).toBe('teo@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail('a@b')).toBeNull()
  })

  it('enforces password length boundaries', () => {
    expect(validateHumanPassword('too-short')).toMatch(/at least 12/)
    expect(validateHumanPassword('a'.repeat(12))).toBeNull()
    expect(validateHumanPassword('a'.repeat(129))).toMatch(/at most 128/)
  })

  it('hashes passwords with a random salt and verifies them safely', async () => {
    const first = await hashHumanPassword('a secure password')
    const second = await hashHumanPassword('a secure password')
    expect(first).not.toBe(second)
    await expect(verifyHumanPassword('a secure password', first)).resolves.toBe(true)
    await expect(verifyHumanPassword('wrong password', first)).resolves.toBe(false)
    await expect(verifyHumanPassword('a secure password', 'invalid')).resolves.toBe(false)
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
