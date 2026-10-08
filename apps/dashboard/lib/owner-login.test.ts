import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUniqueMock = vi.hoisted(() => vi.fn())
vi.mock('@cap/db', () => ({
  prisma: { dashboardLoginToken: { findUnique: findUniqueMock } },
}))

const { findPendingOwnerLoginToken, hashOwnerLoginToken, isOwnerLoginTokenFormat } = await import('./owner-login')

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

  describe('findPendingOwnerLoginToken', () => {
    beforeEach(() => findUniqueMock.mockReset())

    it('never queries the database for a malformed token', async () => {
      await expect(findPendingOwnerLoginToken('short')).resolves.toBeNull()
      await expect(findPendingOwnerLoginToken('')).resolves.toBeNull()
      expect(findUniqueMock).not.toHaveBeenCalled()
    })

    it('looks up a well-formed token by its hash and rejects expired ones', async () => {
      const token = crypto.randomBytes(32).toString('base64url')
      const now = new Date('2026-10-08T12:00:00Z')
      findUniqueMock.mockResolvedValueOnce({
        id: 'login-token',
        userId: 'user',
        merchantId: 'merchant',
        expiresAt: new Date(now.getTime() - 1),
        consumedAt: null,
        merchant: { shopifyDomain: 'shop.myshopify.com', uninstalledAt: null },
      })
      await expect(findPendingOwnerLoginToken(token, now)).resolves.toBeNull()
      expect(findUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
        where: { tokenHash: hashOwnerLoginToken(token) },
      }))
    })

    const now = new Date('2026-10-08T12:00:00Z')
    const pendingRow = {
      id: 'login-token',
      userId: 'user',
      merchantId: 'merchant',
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      merchant: { shopifyDomain: 'shop.myshopify.com', uninstalledAt: null },
    }

    it('returns the row of a pending token', async () => {
      findUniqueMock.mockResolvedValueOnce(pendingRow)
      await expect(findPendingOwnerLoginToken(crypto.randomBytes(32).toString('base64url'), now))
        .resolves.toEqual(pendingRow)
    })

    it.each([
      ['unknown', null],
      ['consumed', { ...pendingRow, consumedAt: new Date(now.getTime() - 1_000) }],
      ['uninstalled-merchant', { ...pendingRow, merchant: { ...pendingRow.merchant, uninstalledAt: now } }],
    ])('rejects an %s token', async (_case, row) => {
      findUniqueMock.mockResolvedValueOnce(row)
      await expect(findPendingOwnerLoginToken(crypto.randomBytes(32).toString('base64url'), now)).resolves.toBeNull()
    })
  })

  it('stores the same SHA-256 hex digest as the API', () => {
    const token = crypto.randomBytes(32).toString('base64url')
    expect(hashOwnerLoginToken(token)).toBe(crypto.createHash('sha256').update(token).digest('hex'))
    expect(hashOwnerLoginToken(token)).toMatch(/^[a-f0-9]{64}$/)
  })
})
