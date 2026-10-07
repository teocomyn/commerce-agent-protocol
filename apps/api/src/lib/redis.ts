import crypto from 'node:crypto'
import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

// Singleton Redis client for cache, rate limits, OAuth nonces and locks.
// BullMQ uses its own connections (see redis-connection.ts), so this client
// can fail fast: during a Redis outage commands reject after ~2 s instead of
// queueing forever and hanging every API request.
let redisInstance: Redis | null = null

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      commandTimeout: 2_000,
      enableReadyCheck: false,
      lazyConnect: true,
    })

    redisInstance.on('error', (err) => {
      console.error('[Redis] Connection error:', err)
    })

    redisInstance.on('connect', () => {
      console.log('[Redis] Connected')
    })
  }
  return redisInstance
}

export const redis = getRedis()

// Helpers
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value)).catch(() => undefined)
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key).catch(() => undefined)
}

// Search results are cached under a per-merchant generation number. Bumping
// the generation invalidates every cached search of that merchant in O(1),
// instead of scanning the whole keyspace (BullMQ keys included) on each
// webhook; old entries simply expire with their TTL.
const searchGenerationKey = (merchantId: string) => `search:gen:${merchantId}`
// Bump when the search response shape or visibility rules change, so entries
// cached by an older release are never served after a deploy.
const SEARCH_CACHE_VERSION = 'v3'

export async function searchCacheKey(merchantId: string, request: unknown): Promise<string | null> {
  try {
    const generation = (await redis.get(searchGenerationKey(merchantId))) ?? '0'
    const digest = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex')
    return `search:${merchantId}:${SEARCH_CACHE_VERSION}:${generation}:${digest}`
  } catch {
    return null
  }
}

// Best effort: a failed invalidation leaves results stale for at most the
// search cache TTL, which must not fail a webhook or an enrichment job.
export async function invalidateMerchantSearchCache(merchantId: string): Promise<void> {
  try {
    await redis.incr(searchGenerationKey(merchantId))
  } catch (error) {
    console.warn('[Redis] Search cache invalidation failed:', error instanceof Error ? error.message : error)
  }
}

// Rate limiting: sliding window counter
export async function rateLimit(
  key: string,
  windowMs: number,
  max: number
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const now = Date.now()
  const windowStart = now - windowMs

  const multi = redis.multi()
  multi.zremrangebyscore(key, '-inf', windowStart)
  multi.zadd(key, now, `${now}-${Math.random()}`)
  multi.zcard(key)
  multi.pexpire(key, windowMs)

  const results = await multi.exec()
  const count = (results?.[2]?.[1] as number) ?? 0

  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetMs: now + windowMs,
  }
}
