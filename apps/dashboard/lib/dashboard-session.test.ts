import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDashboardSessionToken,
  verifyDashboardSessionToken,
} from './dashboard-session'

describe('signed dashboard sessions', () => {
  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = '9f2c7a1e5b3d8f4a6c0e2b7d9f1a3c5e'
  })

  it('round-trips a valid signed session', () => {
    const token = createDashboardSessionToken({
      userId: 'user-1', merchantId: 'merchant-1', role: 'OWNER',
    }, 1_000_000)
    expect(verifyDashboardSessionToken(token, 1_000_000)).toMatchObject({
      userId: 'user-1', merchantId: 'merchant-1', role: 'OWNER',
    })
  })

  it.each(['OWNER', 'ADMIN', 'ANALYST'] as const)('accepts the %s role', (role) => {
    const token = createDashboardSessionToken({ userId: 'u', merchantId: 'm', role })
    expect(verifyDashboardSessionToken(token)?.role).toBe(role)
  })

  it('rejects an expired session', () => {
    const token = createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'OWNER' }, 0)
    expect(verifyDashboardSessionToken(token, 9 * 60 * 60 * 1_000)).toBeNull()
  })

  it('rejects payload tampering', () => {
    const token = createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'ANALYST' })
    const [payload, signature] = token.split('.')
    const parsed = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>
    parsed['role'] = 'OWNER'
    const tampered = `${Buffer.from(JSON.stringify(parsed)).toString('base64url')}.${signature}`
    expect(verifyDashboardSessionToken(tampered)).toBeNull()
  })

  it('rejects malformed session tokens', () => {
    expect(verifyDashboardSessionToken('bad')).toBeNull()
    expect(verifyDashboardSessionToken('bad.parts.extra')).toBeNull()
  })

  it('requires a sufficiently strong server secret', () => {
    process.env.DASHBOARD_SESSION_SECRET = 'short'
    expect(() => createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'OWNER' }))
      .toThrow(/32 characters/)
  })

  it('refuses to sign sessions with the example placeholder secret', () => {
    process.env.DASHBOARD_SESSION_SECRET = 'change_me_to_a_random_secret_of_at_least_32_chars'
    expect(() => createDashboardSessionToken({ userId: 'u', merchantId: 'm', role: 'OWNER' }))
      .toThrow(/placeholder/)
  })
})
