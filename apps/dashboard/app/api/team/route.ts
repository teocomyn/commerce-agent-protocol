import { type NextRequest, NextResponse } from 'next/server'
import { prisma, type MerchantRole } from '@cap/db'
import { getDashboardSession, isSameOriginMutation } from '@/lib/dashboard-session'
import { createInvitationCredential, normalizeEmail } from '@/lib/human-auth'

const INVITABLE_ROLES: readonly MerchantRole[] = ['ADMIN', 'ANALYST']

export async function GET() {
  const session = await getDashboardSession()
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

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
  const session = await getDashboardSession(['OWNER'])
  if (!session) return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  const body = await req.json().catch(() => null) as { email?: unknown; role?: unknown } | null
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : null
  const role = typeof body?.role === 'string' ? body.role as MerchantRole : null
  if (!email || !role || !INVITABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Valid email and role are required' }, { status: 400 })
  }

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
