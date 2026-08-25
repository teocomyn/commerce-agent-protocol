import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { capDashboardRedis?: Redis }

export const dashboardRedis = globalForRedis.capDashboardRedis ?? new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
  },
)

if (process.env.NODE_ENV !== 'production') globalForRedis.capDashboardRedis = dashboardRedis

export async function invalidateApiKeyCache(keyHash: string): Promise<void> {
  try {
    await dashboardRedis.del(`apikey:${keyHash}`, `rl:${keyHash}`)
  } catch (error) {
    // Revocation is authoritative in Postgres. Surface cache failure so callers
    // don't falsely claim immediate revocation.
    throw new Error(
      `API key revoked in database but cache invalidation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function consumeDashboardLoginAttempt(key: string): Promise<{
  allowed: boolean
  retryAfterSeconds: number
}> {
  const redisKey = `dashboard:login:${key}`
  const count = await dashboardRedis.incr(redisKey)
  if (count === 1) await dashboardRedis.expire(redisKey, 15 * 60)
  const ttl = await dashboardRedis.ttl(redisKey)
  return { allowed: count <= 10, retryAfterSeconds: Math.max(1, ttl) }
}

export async function clearDashboardLoginAttempts(key: string): Promise<void> {
  await dashboardRedis.del(`dashboard:login:${key}`)
}
