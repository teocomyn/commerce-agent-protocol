import { type NextRequest, NextResponse } from 'next/server'
import { prisma, type MerchantRole } from '@cap/db'
import { getDashboardSession, isSameOriginMutation } from '@/lib/dashboard-session'

const MANAGED_ROLES: readonly MerchantRole[] = ['ADMIN', 'ANALYST']

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
  const session = await getDashboardSession(['OWNER'])
  if (!session) return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  const body = await req.json().catch(() => null) as { role?: unknown } | null
  const role = typeof body?.role === 'string' ? body.role as MerchantRole : null
  if (!role || !MANAGED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Role must be ADMIN or ANALYST' }, { status: 400 })
  }
  const { id } = await params
  const membership = await manageableMembership(id, session.merchantId, session.userId)
  if (!membership) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  await prisma.merchantMember.update({ where: { id }, data: { role } })
  return NextResponse.json({ updated: true, role })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const session = await getDashboardSession(['OWNER'])
  if (!session) return NextResponse.json({ error: 'Owner role required' }, { status: 403 })
  const { id } = await params
  const membership = await manageableMembership(id, session.merchantId, session.userId)
  if (!membership) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  await prisma.merchantMember.update({ where: { id }, data: { revokedAt: new Date() } })
  return NextResponse.json({ revoked: true })
}
