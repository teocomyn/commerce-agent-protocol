import { afterEach, describe, expect, it } from 'vitest'
import {
  dashboardSessionSecret,
  validateDashboardSessionSecret,
} from './session-secret'

const ORIGINAL_SECRET = process.env.DASHBOARD_SESSION_SECRET

describe('dashboard session secret validation', () => {
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.DASHBOARD_SESSION_SECRET
    else process.env.DASHBOARD_SESSION_SECRET = ORIGINAL_SECRET
  })

  it('accepts a random secret of at least 32 characters', () => {
    const secret = 'a3f1c9e04b7d2a6f8e1c3b5d7f9a0c2e4b6d8f0a1c3e5a7b9d1f3a5c7e9b0d2f'
    expect(validateDashboardSessionSecret(secret)).toBe(secret)
  })

  it('rejects missing and short secrets with a generation hint', () => {
    expect(() => validateDashboardSessionSecret(undefined)).toThrow(/32 characters/)
    expect(() => validateDashboardSessionSecret('')).toThrow(/32 characters/)
    expect(() => validateDashboardSessionSecret('short')).toThrow(/openssl rand -hex 32/)
  })

  it('rejects the .env.example placeholder', () => {
    expect(() => validateDashboardSessionSecret('change_me_to_a_random_secret_of_at_least_32_chars'))
      .toThrow(/placeholder/)
  })

  it.each([
    'CHANGE_ME_please_replace_this_value_before_deploying',
    'prefix-change_me-suffix-0123456789abcdef0123456789',
    'your_dashboard_session_secret_with_enough_length',
    'YOUR_SECRET_HERE_0123456789abcdef0123456789abcdef',
  ])('rejects placeholder-looking secret %s', (secret) => {
    expect(() => validateDashboardSessionSecret(secret)).toThrow(/openssl rand -hex 32/)
  })

  it('reads the secret from DASHBOARD_SESSION_SECRET', () => {
    process.env.DASHBOARD_SESSION_SECRET = 'change_me_to_a_random_secret_of_at_least_32_chars'
    expect(() => dashboardSessionSecret()).toThrow(/placeholder/)
    process.env.DASHBOARD_SESSION_SECRET = 'f'.repeat(64)
    expect(dashboardSessionSecret()).toBe('f'.repeat(64))
  })
})
