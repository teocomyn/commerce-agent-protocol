import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import { findActiveMerchant } from '@/lib/merchant-context'
import { isSameOriginMutation } from '@/lib/dashboard-session'
import { isUuid, requireDashboardSession } from '@/lib/api-route'
import { invalidateApiKeyCache } from '@/lib/redis'

// DELETE /api/keys/[id] — revoke a key
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const auth = await requireDashboardSession(['OWNER', 'ADMIN'], 'Owner or admin role required')
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 })
  }
  const merchant = await findActiveMerchant(auth.value.merchantId)
  if (!merchant) {
    return NextResponse.json({ error: 'This merchant is no longer active' }, { status: 403 })
  }

  const key = await prisma.apiKey.findFirst({
    where: { id, merchantId: merchant.id, revokedAt: null },
    select: { id: true, keyHash: true },
  })
  if (!key) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 })
  }

  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } })
  try {
    await invalidateApiKeyCache(key.keyHash)
  } catch (error) {
    // The revocation above is authoritative. The API caches successful key
    // lookups in Redis for up to 5 minutes (apps/api/src/middleware/auth.ts),
    // so without this invalidation the key can keep working until that entry
    // expires. Reporting a failure here would only invite a retry of an
    // already revoked key, so log it and report the revocation.
    console.error(
      `[cap-dashboard] API key ${key.id} revoked, but its cache entry could not be invalidated: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return NextResponse.json({ revoked: true })
}
