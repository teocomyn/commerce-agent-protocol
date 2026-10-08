import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import { API_KEY_CACHE_TTL_SECONDS } from '@cap/shared'
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
    // The revocation above is authoritative, but the API caches successful
    // key lookups for API_KEY_CACHE_TTL_SECONDS. Say so instead of claiming
    // the key stopped working immediately.
    console.error(
      `[cap-dashboard] API key ${key.id} revoked, but its cache entry could not be invalidated: ${error instanceof Error ? error.message : String(error)}`,
    )
    return NextResponse.json({ revoked: true, effectiveWithinSeconds: API_KEY_CACHE_TTL_SECONDS })
  }

  return NextResponse.json({ revoked: true, effectiveWithinSeconds: 0 })
}
