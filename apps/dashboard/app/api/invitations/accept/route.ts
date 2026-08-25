import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import {
  createDashboardSessionToken,
  dashboardSessionCookie,
  isSameOriginMutation,
} from '@/lib/dashboard-session'
import {
  hashHumanPassword,
  hashInvitationToken,
  validateHumanPassword,
  verifyHumanPassword,
} from '@/lib/human-auth'

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as {
    token?: unknown
    name?: unknown
    password?: unknown
  } | null
  const rawToken = typeof body?.token === 'string' ? body.token : ''
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 255) : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const passwordError = validateHumanPassword(password)
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken) || !name || passwordError) {
    return NextResponse.json({ error: passwordError ?? 'Invalid invitation details' }, { status: 400 })
  }

  const now = new Date()
  const invitation = await prisma.merchantInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(rawToken) },
    include: { merchant: { select: { uninstalledAt: true } } },
  })
  if (
    !invitation || invitation.acceptedAt || invitation.revokedAt ||
    invitation.expiresAt <= now || invitation.merchant.uninstalledAt
  ) {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 401 })
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } })
  if (
    existingUser?.passwordHash &&
    !(await verifyHumanPassword(password, existingUser.passwordHash))
  ) {
    return NextResponse.json({ error: 'This account already uses a different password' }, { status: 401 })
  }
  const passwordHash = existingUser?.passwordHash ?? await hashHumanPassword(password)

  const accepted = await prisma.$transaction(async (tx) => {
    const claimed = await tx.merchantInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    })
    if (claimed.count !== 1) return null

    const user = await tx.user.upsert({
      where: { email: invitation.email },
      create: {
        externalId: `email:${invitation.email}`,
        email: invitation.email,
        name,
        passwordHash,
      },
      update: {
        name,
        ...(existingUser?.passwordHash ? {} : { passwordHash }),
      },
    })
    const membership = await tx.merchantMember.upsert({
      where: {
        userId_merchantId: { userId: user.id, merchantId: invitation.merchantId },
      },
      create: {
        userId: user.id,
        merchantId: invitation.merchantId,
        role: invitation.role,
      },
      update: { role: invitation.role, revokedAt: null },
    })
    return { user, membership }
  })
  if (!accepted) {
    return NextResponse.json({ error: 'Invitation already consumed' }, { status: 409 })
  }

  const token = createDashboardSessionToken({
    userId: accepted.user.id,
    merchantId: accepted.membership.merchantId,
    role: accepted.membership.role,
  })
  const response = NextResponse.json({ accepted: true, redirect: '/dashboard' })
  const cookie = dashboardSessionCookie(token)
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
