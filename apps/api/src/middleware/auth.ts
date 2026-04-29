import crypto from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { prisma } from '@cap/db'
import { rateLimit, cacheGet, cacheSet } from '../lib/redis.js'
import type { CAPError } from '@cap/shared'

// ============================================================
// API KEY AUTH MIDDLEWARE
// ============================================================

export interface AuthContext {
  merchantId: string
  apiKeyId: string
  plan: string
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

const RATE_LIMITS: Record<string, number> = {
  free: 100,
  starter: 1000,
  growth: 5000,
  pro: 10000,
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const apiKey = c.req.header('X-CAP-Key')

  if (!apiKey) {
    return c.json<CAPError>({
      error: { code: 'MISSING_API_KEY', message: 'X-CAP-Key header is required' },
    }, 401)
  }

  // Validate format
  if (!apiKey.startsWith('cap_live_') && !apiKey.startsWith('cap_test_')) {
    return c.json<CAPError>({
      error: { code: 'INVALID_API_KEY', message: 'Invalid API key format' },
    }, 401)
  }

  // Check cache first to avoid DB hit on every request
  const cacheKey = `apikey:${apiKey}`
  let authData = await cacheGet<AuthContext & { plan: string }>(cacheKey)

  if (!authData) {
    // Hash the key and look up in DB
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex')

    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { keyHash: hash, revokedAt: null },
      include: { merchant: { select: { id: true, plan: true } } },
    })

    if (!apiKeyRecord) {
      return c.json<CAPError>({
        error: { code: 'INVALID_API_KEY', message: 'API key not found or revoked' },
      }, 401)
    }

    authData = {
      merchantId: apiKeyRecord.merchant.id,
      apiKeyId: apiKeyRecord.id,
      plan: apiKeyRecord.merchant.plan,
    }

    // Cache for 5 minutes
    await cacheSet(cacheKey, authData, 300)

    // Update last used (fire and forget)
    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {/* noop */})
  }

  // Rate limiting per API key
  const maxRequests = RATE_LIMITS[authData.plan] ?? 100
  const { allowed, remaining, resetMs } = await rateLimit(
    `rl:${apiKey}`,
    60_000, // 1 minute window
    maxRequests
  )

  c.header('X-RateLimit-Limit', String(maxRequests))
  c.header('X-RateLimit-Remaining', String(remaining))
  c.header('X-RateLimit-Reset', String(Math.floor(resetMs / 1000)))

  if (!allowed) {
    return c.json<CAPError>({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Max ${maxRequests} requests/minute for ${authData.plan} plan.`,
        details: { reset_at: new Date(resetMs).toISOString() },
      },
    }, 429)
  }

  c.set('auth', authData)
  await next()
})
