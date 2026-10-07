import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@cap/db'
import { findActiveMerchant } from '@/lib/merchant-context'
import { isSameOriginMutation } from '@/lib/dashboard-session'
import { parseJsonBody, requireDashboardSession } from '@/lib/api-route'

// api_keys.label is VARCHAR(255). A blank label is stored as null.
const createKeySchema = z.object({
  label: z.string().trim().max(255).nullish(),
})

// POST /api/keys — create a new API key
export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const auth = await requireDashboardSession(['OWNER', 'ADMIN'], 'Owner or admin role required')
  if (!auth.ok) return auth.response
  const body = await parseJsonBody(req, createKeySchema, 'Label must be text of at most 255 characters')
  if (!body.ok) return body.response
  const merchant = await findActiveMerchant(auth.value.merchantId)
  if (!merchant) {
    return NextResponse.json({ error: 'This merchant is no longer active' }, { status: 403 })
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
      label: body.value.label || null,
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
  const auth = await requireDashboardSession()
  if (!auth.ok) return auth.response
  const merchant = await findActiveMerchant(auth.value.merchantId)
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
