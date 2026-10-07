import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashOwnerLoginToken, isOwnerLoginTokenFormat } from './owner-login'

describe('Shopify owner sign-in tokens', () => {
  it('accepts the unpadded base64url format minted by the API OAuth callback', () => {
    const token = crypto.randomBytes(32).toString('base64url')
    expect(isOwnerLoginTokenFormat(token)).toBe(true)
  })

  it('rejects malformed tokens before any database lookup', () => {
    expect(isOwnerLoginTokenFormat('')).toBe(false)
    expect(isOwnerLoginTokenFormat('short')).toBe(false)
    expect(isOwnerLoginTokenFormat(`${'a'.repeat(43)}=`)).toBe(false)
    expect(isOwnerLoginTokenFormat(`${'a'.repeat(42)}+`)).toBe(false)
  })

  it('stores the same SHA-256 hex digest as the API', () => {
    const token = crypto.randomBytes(32).toString('base64url')
    expect(hashOwnerLoginToken(token)).toBe(crypto.createHash('sha256').update(token).digest('hex'))
    expect(hashOwnerLoginToken(token)).toMatch(/^[a-f0-9]{64}$/)
  })
})
