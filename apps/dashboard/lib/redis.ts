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

export interface DashboardAttemptResult {
  allowed: boolean
  retryAfterSeconds: number
}

const ATTEMPT_LIMIT = 10
const ATTEMPT_WINDOW_SECONDS = 15 * 60

async function consumeDashboardAttempt(redisKey: string): Promise<DashboardAttemptResult> {
  const count = await dashboardRedis.incr(redisKey)
  if (count === 1) await dashboardRedis.expire(redisKey, ATTEMPT_WINDOW_SECONDS)
  let ttl = await dashboardRedis.ttl(redisKey)
  if (ttl < 0) {
    // The key lost (or never received) its expiry, e.g. after a crash between
    // INCR and EXPIRE. Re-arm it so the counter cannot lock users out forever.
    await dashboardRedis.expire(redisKey, ATTEMPT_WINDOW_SECONDS)
    ttl = ATTEMPT_WINDOW_SECONDS
  }
  return { allowed: count <= ATTEMPT_LIMIT, retryAfterSeconds: Math.max(1, ttl) }
}

export async function consumeDashboardLoginAttempt(key: string): Promise<DashboardAttemptResult> {
  return consumeDashboardAttempt(`dashboard:login:${key}`)
}

export async function consumeDashboardInvitationAttempt(key: string): Promise<DashboardAttemptResult> {
  return consumeDashboardAttempt(`dashboard:invitation:${key}`)
}

export async function clearDashboardLoginAttempts(key: string): Promise<void> {
  await dashboardRedis.del(`dashboard:login:${key}`)
}
