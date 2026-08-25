import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import { getDashboardSession, isSameOriginMutation } from '@/lib/dashboard-session'

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
  const revoked = await prisma.merchantInvitation.updateMany({
    where: {
      id,
      merchantId: session.merchantId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  })
  if (revoked.count !== 1) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }
  return NextResponse.json({ revoked: true })
}
