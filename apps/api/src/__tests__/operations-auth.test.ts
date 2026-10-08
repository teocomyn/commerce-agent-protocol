import { afterEach, describe, expect, it } from 'vitest'
import {
  extractOperationsToken,
  operationsTokenConfigured,
  verifyOperationsToken,
} from '../lib/operations-auth.js'

describe('operations authentication', () => {
  afterEach(() => {
    delete process.env.CAP_OPERATIONS_TOKEN
  })

  it('requires a secret of at least 32 characters', () => {
    process.env.CAP_OPERATIONS_TOKEN = 'too-short'
    expect(operationsTokenConfigured()).toBe(false)
    expect(verifyOperationsToken('too-short')).toBe(false)
  })

  it('rejects the example token from .env.example', () => {
    process.env.CAP_OPERATIONS_TOKEN = 'change_me_to_a_random_operations_secret'
    expect(operationsTokenConfigured()).toBe(false)
    expect(verifyOperationsToken(process.env.CAP_OPERATIONS_TOKEN)).toBe(false)
  })

  it('compares a configured token safely', () => {
    process.env.CAP_OPERATIONS_TOKEN = 'operations-secret-with-at-least-32-characters'
    expect(operationsTokenConfigured()).toBe(true)
    expect(verifyOperationsToken(process.env.CAP_OPERATIONS_TOKEN)).toBe(true)
    expect(verifyOperationsToken('wrong-token')).toBe(false)
  })

  it('accepts a dedicated header or bearer token', () => {
    expect(extractOperationsToken(new Headers({
      'X-CAP-Operations-Token': 'direct-token',
      Authorization: 'Bearer ignored-token',
    }))).toBe('direct-token')
    expect(extractOperationsToken(new Headers({
      Authorization: 'Bearer bearer-token',
    }))).toBe('bearer-token')
  })
})
