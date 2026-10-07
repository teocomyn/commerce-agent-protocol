import crypto from 'node:crypto'
import { prisma } from '@cap/db'

// The API mints 32 random bytes encoded as unpadded base64url (43 characters)
// and stores only the SHA-256 hex digest (apps/api/src/routes/shopify/oauth.ts).
const OWNER_LOGIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isOwnerLoginTokenFormat(value: string): boolean {
  return OWNER_LOGIN_TOKEN_PATTERN.test(value)
}

export function hashOwnerLoginToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Looks up a pending Shopify owner sign-in token without consuming it.
 * Returns null for malformed, unknown, expired, consumed, or uninstalled tokens.
 */
export async function findPendingOwnerLoginToken(rawToken: string, now = new Date()) {
  if (!isOwnerLoginTokenFormat(rawToken)) return null

  const loginToken = await prisma.dashboardLoginToken.findUnique({
    where: { tokenHash: hashOwnerLoginToken(rawToken) },
    select: {
      id: true,
      userId: true,
      merchantId: true,
      expiresAt: true,
      consumedAt: true,
      merchant: { select: { shopifyDomain: true, uninstalledAt: true } },
    },
  })

  if (
    !loginToken ||
    loginToken.consumedAt ||
    loginToken.expiresAt <= now ||
    loginToken.merchant.uninstalledAt
  ) {
    return null
  }
  return loginToken
}
