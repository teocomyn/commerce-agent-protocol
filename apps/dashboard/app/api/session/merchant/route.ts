import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@cap/db'
import {
  createDashboardSessionToken,
  dashboardSessionCookie,
  isSameOriginMutation,
} from '@/lib/dashboard-session'
import { findPendingOwnerLoginToken, isOwnerLoginTokenFormat } from '@/lib/owner-login'

/**
 * Landing URL of the cross-site redirect from the API after Shopify OAuth.
 * It never consumes the token or sets a cookie: a cross-site GET cannot be
 * distinguished from login CSRF, so the browser is sent to a same-origin
 * confirmation page that POSTs the token back.
 */
export async function GET(req: NextRequest) {
  const rawToken = req.nextUrl.searchParams.get('token') ?? ''
  const url = new URL('/session/confirm', req.url)
  if (isOwnerLoginTokenFormat(rawToken)) url.searchParams.set('token', rawToken)

  const response = NextResponse.redirect(url, 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { token?: unknown } | null
  const rawToken = typeof body?.token === 'string' ? body.token : ''

  const now = new Date()
  const loginToken = await findPendingOwnerLoginToken(rawToken, now)
  if (!loginToken) {
    return NextResponse.json({ error: 'Invalid or expired login token' }, { status: 401 })
  }

  const membership = await prisma.merchantMember.findUnique({
    where: {
      userId_merchantId: {
        userId: loginToken.userId,
        merchantId: loginToken.merchantId,
      },
    },
    select: { role: true, revokedAt: true },
  })
  if (!membership || membership.revokedAt) {
    return NextResponse.json({ error: 'Membership is not active' }, { status: 403 })
  }

  const consumed = await prisma.dashboardLoginToken.updateMany({
    where: { id: loginToken.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  })
  if (consumed.count !== 1) {
    return NextResponse.json({ error: 'Login token already consumed' }, { status: 401 })
  }

  const sessionToken = createDashboardSessionToken({
    userId: loginToken.userId,
    merchantId: loginToken.merchantId,
    role: membership.role,
  })
  const response = NextResponse.json({ authenticated: true, redirect: '/dashboard' })
  const cookie = dashboardSessionCookie(sessionToken)
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
