import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import {
  createDashboardSessionToken,
  dashboardSessionCookie,
  isSameOriginMutation,
} from '@/lib/dashboard-session'
import { normalizeEmail, verifyHumanPassword } from '@/lib/human-auth'
import {
  clearDashboardLoginAttempts,
  consumeDashboardLoginAttempt,
} from '@/lib/redis'

const DUMMY_PASSWORD_HASH = `scrypt$00000000000000000000000000000000$${'0'.repeat(64)}`

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as {
    email?: unknown
    password?: unknown
    shop?: unknown
  } | null
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : null
  const password = typeof body?.password === 'string' ? body.password : ''
  const shop = typeof body?.shop === 'string' ? body.shop.trim().toLowerCase() : ''
  if (!email || !password || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const source = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const attemptKey = crypto.createHash('sha256').update(`${source}:${email}:${shop}`).digest('hex')
  const rateLimit = await consumeDashboardLoginAttempt(attemptKey)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: {
          revokedAt: null,
          merchant: { shopifyDomain: shop, uninstalledAt: null },
        },
        take: 1,
      },
    },
  })
  const validPassword = await verifyHumanPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  )
  const membership = user?.memberships[0]
  if (!validPassword || !user || !membership) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  await clearDashboardLoginAttempts(attemptKey)
  const token = createDashboardSessionToken({
    userId: user.id,
    merchantId: membership.merchantId,
    role: membership.role,
  })
  const response = NextResponse.json({ authenticated: true, redirect: '/dashboard' })
  const cookie = dashboardSessionCookie(token)
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
