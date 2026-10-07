import crypto from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDashboardSessionToken,
  isSessionMembershipCurrent,
  membershipVersion,
  verifyDashboardSessionToken,
} from './dashboard-session'

const SECRET = '12345678901234567890123456789012'
const MEMBERSHIP_UPDATED_AT = new Date('2026-10-07T12:00:00.123Z')
const MV = MEMBERSHIP_UPDATED_AT.getTime()

function signPayload(fields: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(fields)).toString('base64url')
  return `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`
}

describe('signed dashboard sessions', () => {
  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = SECRET
  })

  it('round-trips a valid signed session', () => {
    const token = createDashboardSessionToken({
      userId: 'user-1', merchantId: 'merchant-1', role: 'OWNER', mv: MV,
    }, 1_000_000)
    expect(verifyDashboardSessionToken(token, 1_000_000)).toEqual({
      userId: 'user-1', merchantId: 'merchant-1', role: 'OWNER', mv: MV, expiresAt: 1_000 + 8 * 60 * 60,
    })
  })

  it.each(['OWNER', 'ADMIN', 'ANALYST'] as const)('accepts the %s role', (role) => {
    const token = createDashboardSessionToken({ userId: 'u', merchantId: 'm', role, mv: MV })
    expect(verifyDashboardSessionToken(token)?.role).toBe(role)
  })

  it('rejects an expired session', () => {
    const token = createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'OWNER', mv: MV }, 0)
    expect(verifyDashboardSessionToken(token, 9 * 60 * 60 * 1_000)).toBeNull()
  })

  it('rejects payload tampering', () => {
    const token = createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'ANALYST', mv: MV })
    const [payload, signature] = token.split('.')
    const parsed = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>
    parsed['role'] = 'OWNER'
    const tampered = `${Buffer.from(JSON.stringify(parsed)).toString('base64url')}.${signature}`
    expect(verifyDashboardSessionToken(tampered)).toBeNull()
  })

  it('does not sign fields outside the session shape', () => {
    const token = createDashboardSessionToken({
      userId: 'u', merchantId: 'm', role: 'ADMIN', mv: MV, extra: 'ignored',
    } as Parameters<typeof createDashboardSessionToken>[0])
    expect(verifyDashboardSessionToken(token)).not.toHaveProperty('extra')
  })

  it('rejects correctly signed sessions issued without a membership version', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60
    const legacy = signPayload({ userId: 'u', merchantId: 'm', role: 'OWNER', expiresAt })
    expect(verifyDashboardSessionToken(legacy)).toBeNull()
    for (const mv of [String(MV), 1.5, null]) {
      const invalid = signPayload({ userId: 'u', merchantId: 'm', role: 'OWNER', mv, expiresAt })
      expect(verifyDashboardSessionToken(invalid)).toBeNull()
    }
    const current = signPayload({ userId: 'u', merchantId: 'm', role: 'OWNER', mv: MV, expiresAt })
    expect(verifyDashboardSessionToken(current)?.mv).toBe(MV)
  })

  it('rejects malformed session tokens', () => {
    expect(verifyDashboardSessionToken('bad')).toBeNull()
    expect(verifyDashboardSessionToken('bad.parts.extra')).toBeNull()
  })

  it('requires a sufficiently strong server secret', () => {
    process.env.DASHBOARD_SESSION_SECRET = 'short'
    expect(() => createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'OWNER', mv: MV }))
      .toThrow(/32 characters/)
  })

  it('refuses to sign sessions with the example placeholder secret', () => {
    process.env.DASHBOARD_SESSION_SECRET = 'change_me_to_a_random_secret_of_at_least_32_chars'
    expect(() => createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'OWNER', mv: MV }))
      .toThrow(/placeholder/)
  })
})

describe('membership version check', () => {
  const session = { role: 'ADMIN' as const, mv: MV }
  const membership = { role: 'ADMIN' as const, revokedAt: null, updatedAt: MEMBERSHIP_UPDATED_AT }

  it('derives the version from the membership updatedAt in milliseconds', () => {
    expect(membershipVersion(MEMBERSHIP_UPDATED_AT)).toBe(MV)
  })

  it('accepts a session whose membership is unchanged', () => {
    expect(isSessionMembershipCurrent(session, membership)).toBe(true)
    expect(isSessionMembershipCurrent(session, { ...membership, updatedAt: new Date(MV) })).toBe(true)
  })

  it('rejects a session once the membership row has been written again', () => {
    expect(isSessionMembershipCurrent(session, { ...membership, updatedAt: new Date(MV + 1) })).toBe(false)
    expect(isSessionMembershipCurrent(session, { ...membership, updatedAt: new Date(MV - 1) })).toBe(false)
  })

  it('rejects a session whose role or membership no longer matches', () => {
    expect(isSessionMembershipCurrent(session, { ...membership, role: 'ANALYST' })).toBe(false)
    expect(isSessionMembershipCurrent(session, { ...membership, revokedAt: new Date() })).toBe(false)
    expect(isSessionMembershipCurrent(session, null)).toBe(false)
  })
})
