import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@cap/db'
import { isSameOriginMutation } from '@/lib/dashboard-session'
import { createInvitationCredential, normalizeEmail } from '@/lib/human-auth'
import { parseJsonBody, requireDashboardSession } from '@/lib/api-route'

const INVALID_INVITATION = 'Valid email and role are required'

const invitationSchema = z.object({
  email: z.string().max(320),
  role: z.enum(['ADMIN', 'ANALYST']),
})

export async function GET() {
  const auth = await requireDashboardSession()
  if (!auth.ok) return auth.response
  const session = auth.value

  const [members, invitations] = await Promise.all([
    prisma.merchantMember.findMany({
      where: { merchantId: session.merchantId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.merchantInvitation.findMany({
      where: {
        merchantId: session.merchantId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({
    members: members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      revokedAt: member.revokedAt?.toISOString() ?? null,
      isCurrentUser: member.userId === session.userId,
    })),
    invitations: invitations.map((invitation) => ({
      ...invitation,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    })),
    canManage: session.role === 'OWNER',
  })
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const auth = await requireDashboardSession(['OWNER'], 'Owner role required')
  if (!auth.ok) return auth.response
  const session = auth.value
  const body = await parseJsonBody(req, invitationSchema, INVALID_INVITATION)
  if (!body.ok) return body.response
  const { role } = body.value
  const email = normalizeEmail(body.value.email)
  if (!email) return NextResponse.json({ error: INVALID_INVITATION }, { status: 400 })

  const existingMember = await prisma.merchantMember.findFirst({
    where: { merchantId: session.merchantId, revokedAt: null, user: { email } },
    select: { id: true },
  })
  if (existingMember) {
    return NextResponse.json({ error: 'This user is already an active member' }, { status: 409 })
  }

  const credential = createInvitationCredential()
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.merchantInvitation.updateMany({
      where: {
        merchantId: session.merchantId,
        email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    })
    return tx.merchantInvitation.create({
      data: {
        merchantId: session.merchantId,
        email,
        role,
        tokenHash: credential.tokenHash,
        invitedByUserId: session.userId,
        expiresAt: credential.expiresAt,
      },
    })
  })
  const baseUrl = process.env.DASHBOARD_URL ?? req.nextUrl.origin
  const invitationUrl = new URL(`/invite/${credential.token}`, baseUrl).toString()

  return NextResponse.json({
    id: invitation.id,
    email,
    role,
    invitationUrl,
    expiresAt: invitation.expiresAt.toISOString(),
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
