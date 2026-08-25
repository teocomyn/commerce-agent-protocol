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
