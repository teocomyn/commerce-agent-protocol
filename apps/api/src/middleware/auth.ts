import crypto from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { prisma } from '@cap/db'
import { rateLimit, cacheGet, cacheSetIfAbsent } from '../lib/redis.js'
import {
  API_KEY_CACHE_TTL_SECONDS,
  apiKeyCacheKey,
  apiKeyRateLimitKey,
  type CAPError,
} from '@cap/shared'

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

// One warning per minute while the limiter is down, not one per request.
const LIMITER_WARNING_INTERVAL_MS = 60_000
let lastLimiterWarningAt = 0

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
  // An invalidation tombstone is a string, not a cached lookup: it sends the
  // request to Postgres and keeps the result out of the cache.
  const cacheKey = apiKeyCacheKey(hash)
  const cached = await cacheGet<AuthContext | string>(cacheKey)
  let authData = cached !== null && typeof cached === 'object' ? cached : null

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

    // NX: never replaces a tombstone written by a revocation that committed
    // while this lookup was in flight. If an invalidation fails entirely the
    // key stays usable until the entry expires, so keep the window short.
    await cacheSetIfAbsent(cacheKey, authData, API_KEY_CACHE_TTL_SECONDS)

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
      apiKeyRateLimitKey(hash),
      60_000, // 1 minute window
      maxRequests
    )
  } catch (error) {
    if (Date.now() - lastLimiterWarningAt >= LIMITER_WARNING_INTERVAL_MS) {
      lastLimiterWarningAt = Date.now()
      console.warn('[Auth] Rate limiter unavailable, allowing requests:', error instanceof Error ? error.message : error)
    }
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
