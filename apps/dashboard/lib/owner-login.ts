import crypto from 'node:crypto'
import { prisma } from '@cap/db'

// The API mints 32 random bytes encoded as unpadded base64url (43 characters)
// and stores only the SHA-256 hex digest (apps/api/src/routes/shopify/oauth.ts).
const OWNER_LOGIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

// The token travels from the API redirect to the confirmation POST in this
// short-lived HttpOnly cookie, so it never stays in a URL or browser history.
export const OWNER_LOGIN_COOKIE = 'cap_owner_login'
export const OWNER_LOGIN_COOKIE_MAX_AGE_SECONDS = 5 * 60

export function ownerLoginCookieOptions(maxAge = OWNER_LOGIN_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    // Lax: the cookie is set on the cross-site redirect from the API and must
    // be sent on the following top-level navigation to the confirmation page.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

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
