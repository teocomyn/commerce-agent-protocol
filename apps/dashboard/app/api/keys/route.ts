import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'
import { getDashboardMerchant } from '@/lib/merchant-context'
import { getDashboardSession, isSameOriginMutation } from '@/lib/dashboard-session'

// POST /api/keys — create a new API key
export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const session = await getDashboardSession(['OWNER', 'ADMIN'])
  if (!session) {
    return NextResponse.json({ error: 'Owner or admin role required' }, { status: 403 })
  }
  const body = await req.json() as { label?: string }
  const merchant = await getDashboardMerchant()
  if (!merchant) {
    return NextResponse.json({ error: 'No merchant selected' }, { status: 401 })
  }

  // Generate key: cap_live_<40 hex chars>
  const rawKey = `cap_live_${crypto.randomBytes(20).toString('hex')}`
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const prefix = rawKey.slice(0, 16)

  const apiKey = await prisma.apiKey.create({
    data: {
      merchantId: merchant.id,
      keyHash: hash,
      keyPrefix: prefix,
      label: body.label ?? null,
    },
  })

  return NextResponse.json({
    id: apiKey.id,
    key: rawKey, // Shown once
    prefix,
    label: apiKey.label,
    createdAt: apiKey.createdAt.toISOString(),
  })
}

// GET /api/keys
export async function GET() {
  const session = await getDashboardSession()
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const merchant = await getDashboardMerchant()
  if (!merchant) return NextResponse.json([])

  const keys = await prisma.apiKey.findMany({
    where: { merchantId: merchant.id, revokedAt: null },
    select: { id: true, keyPrefix: true, label: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(keys.map(k => ({
    id: k.id,
    prefix: k.keyPrefix,
    label: k.label,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  })))
}
