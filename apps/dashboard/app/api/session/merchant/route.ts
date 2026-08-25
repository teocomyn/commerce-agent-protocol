import crypto from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@cap/db'
import {
  createDashboardSessionToken,
  dashboardSessionCookie,
} from '@/lib/dashboard-session'

export async function GET(req: NextRequest) {
  const rawToken = req.nextUrl.searchParams.get('token')
  if (!rawToken) {
    return NextResponse.json({ error: 'Missing login token' }, { status: 400 })
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const now = new Date()
  const loginToken = await prisma.dashboardLoginToken.findUnique({
    where: { tokenHash },
    include: {
      merchant: { select: { uninstalledAt: true } },
      user: { select: { id: true } },
    },
  })

  if (
    !loginToken ||
    loginToken.consumedAt ||
    loginToken.expiresAt <= now ||
    loginToken.merchant.uninstalledAt
  ) {
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
    userId: loginToken.user.id,
    merchantId: loginToken.merchantId,
    role: membership.role,
  })
  const url = new URL('/dashboard', req.url)
  url.searchParams.set('connected', 'true')

  const response = NextResponse.redirect(url)
  const cookie = dashboardSessionCookie(sessionToken)
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')

  return response
}
