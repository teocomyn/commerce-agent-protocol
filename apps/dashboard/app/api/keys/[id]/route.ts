import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import { getDashboardMerchant } from '@/lib/merchant-context'
import { getDashboardSession, isSameOriginMutation } from '@/lib/dashboard-session'
import { invalidateApiKeyCache } from '@/lib/redis'

// DELETE /api/keys/[id] — revoke a key
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const session = await getDashboardSession(['OWNER', 'ADMIN'])
  if (!session) {
    return NextResponse.json({ error: 'Owner or admin role required' }, { status: 403 })
  }
  const { id } = await params
  const merchant = await getDashboardMerchant()
  if (!merchant) {
    return NextResponse.json({ error: 'No merchant selected' }, { status: 401 })
  }

  const key = await prisma.apiKey.findFirst({
    where: { id, merchantId: merchant.id, revokedAt: null },
    select: { id: true, keyHash: true },
  })
  if (!key) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 })
  }

  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } })
  await invalidateApiKeyCache(key.keyHash)

  return NextResponse.json({ revoked: true })
}
