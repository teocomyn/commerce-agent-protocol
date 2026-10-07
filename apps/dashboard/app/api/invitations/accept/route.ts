import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma, prisma } from '@cap/db'
import { clientAddress, parseJsonBody } from '@/lib/api-route'
import {
  type DashboardSession,
  createDashboardSessionToken,
  dashboardSessionCookie,
  getDashboardSession,
  isSameOriginMutation,
  membershipVersion,
} from '@/lib/dashboard-session'
import {
  hashHumanPassword,
  hashInvitationToken,
  isInvitationTokenFormat,
  validateHumanPassword,
} from '@/lib/human-auth'
import { consumeDashboardInvitationAttempt } from '@/lib/redis'

const SIGN_IN_REQUIRED = 'Sign in with the invited account, then open this invitation link again.'

// name and password are only used when the invitee creates a new password.
const acceptInvitationSchema = z.object({
  token: z.string(),
  name: z.string().trim().max(255).optional(),
  password: z.string().optional(),
})

class InvitationRejected extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// How the invitee proves they own the invited email:
// - an existing password-protected account proves it with its own signed
//   session (this route never checks passwords, so it is not a password oracle);
// - otherwise the invitee creates the account's first password.
type Acceptance =
  | { kind: 'existing-account'; userId: string }
  | { kind: 'new-password'; name: string; passwordHash: string }

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const body = await parseJsonBody(req, acceptInvitationSchema, 'Invalid invitation details')
  if (!body.ok) return body.response
  const { token: rawToken, name = '', password = '' } = body.value
  if (!isInvitationTokenFormat(rawToken)) {
    return NextResponse.json({ error: 'Invalid invitation details' }, { status: 400 })
  }

  const tokenHash = hashInvitationToken(rawToken)
  const sourceKey = crypto.createHash('sha256').update(clientAddress(req)).digest('hex')
  const blocked = (await Promise.all([
    consumeDashboardInvitationAttempt(`ip:${sourceKey}`),
    consumeDashboardInvitationAttempt(`token:${tokenHash}`),
  ])).filter((attempt) => !attempt.allowed)
  if (blocked.length > 0) {
    const retryAfterSeconds = Math.max(...blocked.map((attempt) => attempt.retryAfterSeconds))
    return NextResponse.json(
      { error: 'Too many invitation attempts' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    )
  }

  const now = new Date()
  const invitation = await prisma.merchantInvitation.findUnique({
    where: { tokenHash },
    include: { merchant: { select: { uninstalledAt: true } } },
  })
  if (
    !invitation || invitation.acceptedAt || invitation.revokedAt ||
    invitation.expiresAt <= now || invitation.merchant.uninstalledAt
  ) {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 401 })
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, passwordHash: true },
  })

  let acceptance: Acceptance
  if (existingUser?.passwordHash) {
    const session = await getDashboardSession()
    if (!session || session.userId !== existingUser.id) {
      return NextResponse.json({ error: SIGN_IN_REQUIRED }, { status: 401 })
    }
    acceptance = { kind: 'existing-account', userId: session.userId }
  } else {
    const passwordError = validateHumanPassword(password)
    if (!name || passwordError) {
      return NextResponse.json({ error: passwordError ?? 'Invalid invitation details' }, { status: 400 })
    }
    acceptance = { kind: 'new-password', name, passwordHash: await hashHumanPassword(password) }
  }

  let accepted: Omit<DashboardSession, 'expiresAt'>
  try {
    accepted = await prisma.$transaction(async (tx) => {
      const claimed = await tx.merchantInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      })
      if (claimed.count !== 1) throw new InvitationRejected(409, 'Invitation already consumed')

      // Re-read inside the transaction: the account may have been created or
      // secured since the checks above. A password is only ever written to a
      // brand-new account or to one whose passwordHash is still null.
      const currentUser = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true, passwordHash: true },
      })
      let userId: string
      if (acceptance.kind === 'existing-account') {
        if (!currentUser || currentUser.id !== acceptance.userId) {
          throw new InvitationRejected(401, SIGN_IN_REQUIRED)
        }
        userId = currentUser.id
      } else if (!currentUser) {
        const created = await tx.user.create({
          data: {
            externalId: `email:${invitation.email}`,
            email: invitation.email,
            name: acceptance.name,
            passwordHash: acceptance.passwordHash,
          },
          select: { id: true },
        })
        userId = created.id
      } else {
        const secured = await tx.user.updateMany({
          where: { id: currentUser.id, passwordHash: null },
          data: { name: acceptance.name, passwordHash: acceptance.passwordHash },
        })
        if (secured.count !== 1) throw new InvitationRejected(401, SIGN_IN_REQUIRED)
        userId = currentUser.id
      }

      const membership = await tx.merchantMember.upsert({
        where: {
          userId_merchantId: { userId, merchantId: invitation.merchantId },
        },
        create: {
          userId,
          merchantId: invitation.merchantId,
          role: invitation.role,
        },
        update: { role: invitation.role, revokedAt: null },
      })
      // The upsert bumps updatedAt, so sessions issued for an earlier
      // membership of this user at this merchant stop working.
      return {
        userId,
        merchantId: membership.merchantId,
        role: membership.role,
        mv: membershipVersion(membership.updatedAt),
      }
    })
  } catch (error) {
    // Throwing rolls the whole transaction back, so a rejected attempt never
    // consumes the invitation.
    if (error instanceof InvitationRejected) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // A concurrent request created an account for this email first.
      return NextResponse.json({ error: SIGN_IN_REQUIRED }, { status: 401 })
    }
    throw error
  }

  const token = createDashboardSessionToken(accepted)
  const response = NextResponse.json({ accepted: true, redirect: '/dashboard' })
  const cookie = dashboardSessionCookie(token)
  response.cookies.set(cookie.name, cookie.value, cookie.options)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
