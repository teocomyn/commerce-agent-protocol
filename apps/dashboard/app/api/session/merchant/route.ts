import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@cap/db'
import {
  createDashboardSessionToken,
  dashboardSessionCookie,
  isSameOriginMutation,
  membershipVersion,
} from '@/lib/dashboard-session'
import {
  OWNER_LOGIN_COOKIE,
  findPendingOwnerLoginToken,
  isOwnerLoginTokenFormat,
  ownerLoginCookieOptions,
} from '@/lib/owner-login'

/**
 * Landing URL of the cross-site redirect from the API after Shopify OAuth.
 * It never consumes the token or creates a session: a cross-site GET cannot be
 * distinguished from login CSRF. The token moves into a short-lived HttpOnly
 * cookie and the browser goes to a same-origin confirmation page, whose POST
 * consumes it. The token is not kept in the confirmation URL or history.
 */
export async function GET(req: NextRequest) {
  const rawToken = req.nextUrl.searchParams.get('token') ?? ''
  const response = NextResponse.redirect(new URL('/session/confirm', req.url), 303)
  if (isOwnerLoginTokenFormat(rawToken)) {
    response.cookies.set(OWNER_LOGIN_COOKIE, rawToken, ownerLoginCookieOptions())
  } else {
    response.cookies.set(OWNER_LOGIN_COOKIE, '', ownerLoginCookieOptions(0))
  }
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  // The sign-in token travels in the HttpOnly handoff cookie, not in the body.
  const rawToken = req.cookies.get(OWNER_LOGIN_COOKIE)?.value ?? ''

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
    select: { role: true, revokedAt: true, sessionVersion: true },
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
    mv: membershipVersion(membership),
  })
  const response = NextResponse.json({ authenticated: true, redirect: '/dashboard' })
  const cookie = dashboardSessionCookie(sessionToken)
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  response.cookies.set(OWNER_LOGIN_COOKIE, '', ownerLoginCookieOptions(0))
  response.headers.set('Cache-Control', 'no-store')
  return response
}
