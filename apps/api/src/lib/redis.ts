import Redis from 'ioredis'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

// Singleton Redis client
let redisInstance: Redis | null = null

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
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
  const value = await redis.get(key)
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value))
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key)
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
