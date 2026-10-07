import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@cap/db'
import { isSameOriginMutation } from '@/lib/dashboard-session'
import { isUuid, parseJsonBody, requireDashboardSession } from '@/lib/api-route'

const changeRoleSchema = z.object({ role: z.enum(['ADMIN', 'ANALYST']) })

async function manageableMembership(id: string, merchantId: string, currentUserId: string) {
  return prisma.merchantMember.findFirst({
    where: {
      id,
      merchantId,
      userId: { not: currentUserId },
      role: { not: 'OWNER' },
      revokedAt: null,
    },
    select: { id: true },
  })
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
  const membership = await manageableMembership(id, session.merchantId, session.userId)
  if (!membership) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  // A new role signs the member out of every device (session version bump).
  await prisma.merchantMember.update({ where: { id }, data: { role, sessionVersion: { increment: 1 } } })
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
  const membership = await manageableMembership(id, session.merchantId, session.userId)
  if (!membership) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  await prisma.merchantMember.update({
    where: { id },
    data: { revokedAt: new Date(), sessionVersion: { increment: 1 } },
  })
  return NextResponse.json({ revoked: true })
}
