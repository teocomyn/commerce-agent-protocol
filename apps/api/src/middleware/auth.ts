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

export const API_KEY_CACHE_TTL_SECONDS = 60

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

  const hash = crypto.createHash('sha256').update(apiKey).digest('hex')

  // Cache keys never contain the bearer secret and can be invalidated by hash.
  const cacheKey = `apikey:${hash}`
  let authData = await cacheGet<AuthContext & { plan: string }>(cacheKey)

  if (!authData) {
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: {
        keyHash: hash,
        revokedAt: null,
        merchant: { uninstalledAt: null },
      },
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

    // Revocation deletes this entry; if that deletion fails the key stays
    // usable until the entry expires, so keep the window short.
    await cacheSet(cacheKey, authData, API_KEY_CACHE_TTL_SECONDS)

    // Update last used (fire and forget)
    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {/* noop */})
  }

  // Rate limiting per API key. If Redis is unavailable the request is let
  // through (fail open): authentication already succeeded against Postgres,
  // and /ready reports the Redis outage so the platform can react.
  const maxRequests = RATE_LIMITS[authData.plan] ?? 100
  let limit: Awaited<ReturnType<typeof rateLimit>> | null = null
  try {
    limit = await rateLimit(
      `rl:${hash}`,
      60_000, // 1 minute window
      maxRequests
    )
  } catch (error) {
    console.warn('[Auth] Rate limiter unavailable, allowing request:', error instanceof Error ? error.message : error)
  }

  if (limit) {
    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(limit.remaining))
    c.header('X-RateLimit-Reset', String(Math.floor(limit.resetMs / 1000)))
  }

  if (limit && !limit.allowed) {
    return c.json<CAPError>({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Max ${maxRequests} requests/minute for ${authData.plan} plan.`,
        details: { reset_at: new Date(limit.resetMs).toISOString() },
      },
    }, 429)
  }

  c.set('auth', authData)
  await next()
})
