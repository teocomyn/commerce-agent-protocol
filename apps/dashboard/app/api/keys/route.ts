import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@cap/db'

// POST /api/keys — create a new API key
export async function POST(req: NextRequest) {
  const body = await req.json() as { label?: string; merchantId?: string }

  // TODO: Replace with real session-based merchant ID once auth is set up
  // For MVP, use the first merchant or a hardcoded test merchant
  let merchantId = body.merchantId
  if (!merchantId) {
    const firstMerchant = await prisma.merchant.findFirst({ select: { id: true } })
    if (!firstMerchant) {
      return NextResponse.json({ error: 'No merchant found' }, { status: 404 })
    }
    merchantId = firstMerchant.id
  }

  // Generate key: cap_live_<40 hex chars>
  const rawKey = `cap_live_${crypto.randomBytes(20).toString('hex')}`
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const prefix = rawKey.slice(0, 16)

  const apiKey = await prisma.apiKey.create({
    data: {
      merchantId,
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
  const firstMerchant = await prisma.merchant.findFirst({ select: { id: true } })
  if (!firstMerchant) return NextResponse.json([])

  const keys = await prisma.apiKey.findMany({
    where: { merchantId: firstMerchant.id, revokedAt: null },
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
