import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@cap/db'
import { clientAddress, parseJsonBody } from '@/lib/api-route'
import {
  createDashboardSessionToken,
  dashboardSessionCookie,
  isSameOriginMutation,
  membershipVersion,
} from '@/lib/dashboard-session'
import {
  DUMMY_PASSWORD_HASH,
  MAX_HUMAN_PASSWORD_LENGTH,
  hashHumanPassword,
  needsRehash,
  normalizeEmail,
  verifyHumanPassword,
} from '@/lib/human-auth'
import {
  clearDashboardLoginAttempts,
  consumeDashboardLoginAttempt,
} from '@/lib/redis'

// Passwords longer than the cap are rejected here, before any hashing work.
const loginSchema = z.object({
  email: z.string().max(320).transform(normalizeEmail).pipe(z.string()),
  password: z.string().min(1).max(MAX_HUMAN_PASSWORD_LENGTH),
  shop: z.string().max(255).trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
})

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const body = await parseJsonBody(
    req,
    loginSchema,
    'Enter a valid email, Shopify domain and password',
  )
  if (!body.ok) return body.response
  const { email, password, shop } = body.value

  // Two independent buckets (limits in lib/redis.ts); either one being
  // exhausted rejects the attempt:
  // - per client address, taken from X-Forwarded-For (see clientAddress());
  // - per account, sha256(email:shop). It does not depend on X-Forwarded-For,
  //   so rotating or forging addresses cannot multiply guesses on one account.
  const addressKey = sha256(clientAddress(req))
  const accountKey = sha256(`${email}:${shop}`)
  const blocked = (await Promise.all([
    consumeDashboardLoginAttempt('ip', addressKey),
    consumeDashboardLoginAttempt('account', accountKey),
  ])).filter((attempt) => !attempt.allowed)
  if (blocked.length > 0) {
    const retryAfterSeconds = Math.max(...blocked.map((attempt) => attempt.retryAfterSeconds))
    return NextResponse.json(
      { error: 'Too many login attempts' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    )
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      memberships: {
        where: {
          revokedAt: null,
          merchant: { shopifyDomain: shop, uninstalledAt: null },
        },
        select: { merchantId: true, role: true, updatedAt: true },
        take: 1,
      },
    },
  })
  const validPassword = await verifyHumanPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  )
  const membership = user?.memberships[0]
  if (!validPassword || !user?.passwordHash || !membership) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Only the account bucket is reset: resetting the address bucket would let
  // anyone holding one valid account clear it between guesses on others.
  await clearDashboardLoginAttempts('account', accountKey)

  if (needsRehash(user.passwordHash)) {
    // Rehash-on-login: upgrade a legacy or weaker hash while the plaintext is
    // at hand. The compare-and-swap leaves a concurrent password change
    // untouched, and a failed upgrade never blocks the sign-in.
    try {
      await prisma.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash: await hashHumanPassword(password) },
      })
    } catch (error) {
      console.error(
        `[cap-dashboard] Password rehash failed for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const token = createDashboardSessionToken({
    userId: user.id,
    merchantId: membership.merchantId,
    role: membership.role,
    mv: membershipVersion(membership.updatedAt),
  })
  const response = NextResponse.json({ authenticated: true, redirect: '/dashboard' })
  const cookie = dashboardSessionCookie(token)
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
