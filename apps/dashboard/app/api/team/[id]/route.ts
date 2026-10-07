import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma, type Prisma } from '@cap/db'
import { isSameOriginMutation } from '@/lib/dashboard-session'
import { isUuid, parseJsonBody, requireDashboardSession } from '@/lib/api-route'

const changeRoleSchema = z.object({ role: z.enum(['ADMIN', 'ANALYST']) })

// An active, non-owner membership of this merchant other than the caller's.
// Writes repeat this condition so a concurrent revocation or role change is
// never overwritten by a decision made on a stale read.
function manageableMembership(id: string, merchantId: string, currentUserId: string) {
  return {
    id,
    merchantId,
    userId: { not: currentUserId },
    role: { not: 'OWNER' },
    revokedAt: null,
  } satisfies Prisma.MerchantMemberWhereInput
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const auth = await requireDashboardSession(['OWNER'], 'Owner role required')
  if (!auth.ok) return auth.response
  const session = auth.value
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  const body = await parseJsonBody(req, changeRoleSchema, 'Role must be ADMIN or ANALYST')
  if (!body.ok) return body.response
  const { role } = body.value
  const manageable = manageableMembership(id, session.merchantId, session.userId)
  // A new role signs the member out of every device (session version bump);
  // assigning the role they already have changes nothing.
  const { count } = await prisma.merchantMember.updateMany({
    where: { ...manageable, role: { notIn: ['OWNER', role] } },
    data: { role, sessionVersion: { increment: 1 } },
  })
  if (count === 0 && !await prisma.merchantMember.findFirst({ where: manageable, select: { id: true } })) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }
  return NextResponse.json({ updated: true, role })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const auth = await requireDashboardSession(['OWNER'], 'Owner role required')
  if (!auth.ok) return auth.response
  const session = auth.value
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  const { count } = await prisma.merchantMember.updateMany({
    where: manageableMembership(id, session.merchantId, session.userId),
    data: { revokedAt: new Date(), sessionVersion: { increment: 1 } },
  })
  if (count === 0) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  return NextResponse.json({ revoked: true })
}
