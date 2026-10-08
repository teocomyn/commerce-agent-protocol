import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import { isSameOriginMutation } from '@/lib/dashboard-session'
import { isUuid, requireDashboardSession } from '@/lib/api-route'

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
  if (!isUuid(id)) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
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
