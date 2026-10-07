import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configuredDashboardOrigin, validateDashboardUrl } from './public-origin'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@cap/db', () => ({ prisma: {} }))

const ORIGINAL = { url: process.env.DASHBOARD_URL, env: process.env.NODE_ENV }

function restore() {
  if (ORIGINAL.url === undefined) delete process.env.DASHBOARD_URL
  else process.env.DASHBOARD_URL = ORIGINAL.url
  ;(process.env as Record<string, string | undefined>)['NODE_ENV'] = ORIGINAL.env
}

describe('dashboard public origin', () => {
  // The defaults read process.env: start every test without DASHBOARD_URL so
  // the missing-value paths do not depend on the runner's environment.
  beforeEach(() => {
    delete process.env.DASHBOARD_URL
  })
  afterEach(restore)

  it('parses DASHBOARD_URL into an origin', () => {
    expect(configuredDashboardOrigin('https://dashboard.example.test/path')).toBe('https://dashboard.example.test')
    expect(configuredDashboardOrigin('not a url')).toBeNull()
    expect(configuredDashboardOrigin('ftp://dashboard.example.test')).toBeNull()
    expect(configuredDashboardOrigin(undefined)).toBeNull()
  })

  it('requires an https DASHBOARD_URL in production only', () => {
    expect(() => validateDashboardUrl({ NODE_ENV: 'production' })).toThrow(/DASHBOARD_URL/)
    expect(() => validateDashboardUrl({ NODE_ENV: 'production', DASHBOARD_URL: 'http://dashboard.example.test' }))
      .toThrow(/DASHBOARD_URL/)
    expect(() => validateDashboardUrl({ NODE_ENV: 'production', DASHBOARD_URL: 'https://dashboard.example.test' }))
      .not.toThrow()
    expect(() => validateDashboardUrl({ NODE_ENV: 'development' })).not.toThrow()
  })

  it('rejects every origin in production when DASHBOARD_URL is missing (fail closed)', async () => {
    const { isSameOriginMutation } = await import('./dashboard-session')
    ;(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production'
    delete process.env.DASHBOARD_URL
    const forged = new Request('http://internal:3001/api/keys', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' },
    })
    expect(isSameOriginMutation(forged)).toBe(false)
    // No Origin header at all: also rejected in production.
    expect(isSameOriginMutation(new Request('http://internal:3001/api/keys', { method: 'POST' }))).toBe(false)

    process.env.DASHBOARD_URL = 'https://dashboard.example.test'
    expect(isSameOriginMutation(forged)).toBe(false)
    const legit = new Request('http://internal:3001/api/keys', {
      method: 'POST',
      headers: { origin: 'https://dashboard.example.test' },
    })
    expect(isSameOriginMutation(legit)).toBe(true)
  })
})
