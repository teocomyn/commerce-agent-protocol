import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { capDashboardRedis?: Redis }

export const dashboardRedis = globalForRedis.capDashboardRedis ?? new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    // Fail within 2 s instead of stalling sign-ins on a hung connection.
    commandTimeout: 2_000,
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

const ATTEMPT_WINDOW_SECONDS = 15 * 60
const INVITATION_ATTEMPT_LIMIT = 10

// Login attempts per 15-minute window, counted in independent buckets.
// See app/api/auth/login/route.ts for how the bucket keys are derived.
const LOGIN_ATTEMPT_LIMITS = {
  account: 10, // one email on one shop, from any client address
  ip: 50, // one client address, across every account
} as const

export type DashboardLoginBucket = keyof typeof LOGIN_ATTEMPT_LIMITS

// Limits fail open: a Redis outage must not turn a correct password into a
// 500. Password verification itself still runs on every attempt.
async function consumeDashboardAttempt(
  redisKey: string,
  limit: number,
): Promise<DashboardAttemptResult> {
  try {
    return await countDashboardAttempt(redisKey, limit)
  } catch (error) {
    console.warn('[cap-dashboard] Attempt limiter unavailable, allowing request:', error instanceof Error ? error.message : error)
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

async function countDashboardAttempt(
  redisKey: string,
  limit: number,
): Promise<DashboardAttemptResult> {
  const count = await dashboardRedis.incr(redisKey)
  if (count === 1) await dashboardRedis.expire(redisKey, ATTEMPT_WINDOW_SECONDS)
  let ttl = await dashboardRedis.ttl(redisKey)
  if (ttl === -1) {
    // The key lost (or never received) its expiry, e.g. after a crash between
    // INCR and EXPIRE. Re-arm it so the counter cannot lock users out forever.
    await dashboardRedis.expire(redisKey, ATTEMPT_WINDOW_SECONDS)
    ttl = ATTEMPT_WINDOW_SECONDS
  } else if (ttl === -2) {
    // The counter expired between INCR and TTL: the window is already over.
    ttl = 1
  }
  return { allowed: count <= limit, retryAfterSeconds: Math.max(1, ttl) }
}

export async function consumeDashboardLoginAttempt(
  bucket: DashboardLoginBucket,
  key: string,
): Promise<DashboardAttemptResult> {
  return consumeDashboardAttempt(`dashboard:login:${bucket}:${key}`, LOGIN_ATTEMPT_LIMITS[bucket])
}

export async function consumeDashboardInvitationAttempt(
  key: string,
  limit = INVITATION_ATTEMPT_LIMIT,
): Promise<DashboardAttemptResult> {
  return consumeDashboardAttempt(`dashboard:invitation:${key}`, limit)
}

export async function clearDashboardLoginAttempts(
  bucket: DashboardLoginBucket,
  key: string,
): Promise<void> {
  await dashboardRedis.del(`dashboard:login:${bucket}:${key}`).catch((error: unknown) => {
    console.warn('[cap-dashboard] Could not reset login attempts:', error instanceof Error ? error.message : error)
  })
}
