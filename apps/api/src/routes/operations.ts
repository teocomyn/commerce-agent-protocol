import { Hono } from 'hono'
import { prisma } from '@cap/db'
import {
  catalogSyncQueue,
  deadLetterQueue,
  enrichmentQueue,
  getQueueStats,
} from '../lib/queue.js'
import { redis } from '../lib/redis.js'
import {
  extractOperationsToken,
  operationsTokenConfigured,
  verifyOperationsToken,
} from '../lib/operations-auth.js'

const operationsRouter = new Hono()

operationsRouter.use('*', async (c, next) => {
  if (!operationsTokenConfigured()) {
    return c.json({
      error: {
        code: 'OPERATIONS_AUTH_NOT_CONFIGURED',
        message: 'Operations access is not configured',
      },
    }, 503)
  }
  if (!verifyOperationsToken(extractOperationsToken(c.req.raw.headers))) {
    return c.json({
      error: { code: 'OPERATIONS_UNAUTHORIZED', message: 'Invalid operations token' },
    }, 401)
  }
  await next()
})

operationsRouter.get('/queues', async (c) => {
  return c.json({
    queues: await getQueueStats(),
    timestamp: new Date().toISOString(),
  })
})

operationsRouter.get('/dead-letter', async (c) => {
  const requestedLimit = Number(c.req.query('limit') ?? 25)
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(100, Math.max(1, requestedLimit))
    : 25
  const jobs = await deadLetterQueue.getJobs(
    ['waiting', 'active', 'delayed', 'failed', 'completed'],
    0,
    limit - 1,
    false,
  )
  return c.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      name: job.name,
      sourceQueue: (job.data as { sourceQueue?: unknown }).sourceQueue ?? null,
      sourceJobId: (job.data as { sourceJobId?: unknown }).sourceJobId ?? null,
      failedReason: (job.data as { failedReason?: unknown }).failedReason ?? null,
      failedAt: (job.data as { failedAt?: unknown }).failedAt ?? null,
      data: (job.data as { data?: unknown }).data ?? null,
      timestamp: job.timestamp,
    })),
    timestamp: new Date().toISOString(),
  })
})

operationsRouter.post('/dead-letter/:id/replay', async (c) => {
  const body = await c.req.json().catch(() => null) as { confirm?: boolean } | null
  if (body?.confirm !== true) {
    return c.json({
      error: {
        code: 'REPLAY_CONFIRMATION_REQUIRED',
        message: 'Set confirm=true only after the underlying defect is fixed',
      },
    }, 400)
  }

  const job = await deadLetterQueue.getJob(c.req.param('id'))
  if (!job) {
    return c.json({ error: { code: 'DLQ_JOB_NOT_FOUND', message: 'Dead-letter job not found' } }, 404)
  }
  const deadLetter = job.data as {
    sourceQueue?: string
    sourceJobId?: string
    data?: unknown
  }
  const destination = deadLetter.sourceQueue === 'enrichment'
    ? enrichmentQueue
    : deadLetter.sourceQueue === 'catalog-sync'
      ? catalogSyncQueue
      : null
  if (!destination || !deadLetter.data) {
    return c.json({
      error: { code: 'DLQ_JOB_INVALID', message: 'Dead-letter job cannot be replayed safely' },
    }, 422)
  }

  const replayed = await destination.add(
    `replay-${job.name}`,
    deadLetter.data,
    { jobId: `replay-${job.id}-${Date.now()}` },
  )
  await job.remove()
  return c.json({
    replayed: true,
    source_queue: deadLetter.sourceQueue,
    source_job_id: deadLetter.sourceJobId ?? null,
    replay_job_id: replayed.id,
  })
})

// Queues a full catalog sync for every active install, e.g. after a release
// that changes how products are stored (merchant claims, statuses). Calls
// Shopify and may call OpenAI for every product whose content changed.
operationsRouter.post('/catalog-sync', async (c) => {
  const body = await c.req.json().catch(() => null) as { confirm?: boolean } | null
  if (body?.confirm !== true) {
    return c.json({
      error: {
        code: 'CATALOG_SYNC_CONFIRMATION_REQUIRED',
        message: 'Set confirm=true to queue a full catalog sync for every active install',
      },
    }, 400)
  }
  const merchants = await prisma.merchant.findMany({
    where: { uninstalledAt: null, shopifyToken: { not: null } },
    select: { id: true, shopifyDomain: true },
  })
  const requestedAt = Date.now()
  await catalogSyncQueue.addBulk(merchants.map((merchant) => ({
    name: 'full-catalog-sync',
    data: { merchantId: merchant.id, shopDomain: merchant.shopifyDomain },
    opts: { jobId: `operations-resync-${merchant.id}-${requestedAt}` },
  })))
  return c.json({ queued: merchants.length })
})

operationsRouter.get('/metrics', async (c) => {
  const [queues, webhookStatuses, activeMerchants] = await Promise.all([
    getQueueStats(),
    prisma.webhookEvent.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.merchant.count({ where: { uninstalledAt: null, shopifyToken: { not: null } } }),
  ])
  const lines = [
    '# HELP cap_merchants_active Active Shopify installations.',
    '# TYPE cap_merchants_active gauge',
    `cap_merchants_active ${activeMerchants}`,
    '# HELP cap_queue_jobs BullMQ jobs by queue and state.',
    '# TYPE cap_queue_jobs gauge',
  ]
  for (const [queue, counts] of Object.entries(queues)) {
    for (const [state, count] of Object.entries(counts)) {
      lines.push(`cap_queue_jobs{queue="${queue}",state="${state}"} ${count}`)
    }
  }
  lines.push(
    '# HELP cap_webhook_events_total Persisted Shopify webhook events by status.',
    '# TYPE cap_webhook_events_total gauge',
  )
  for (const group of webhookStatuses) {
    lines.push(`cap_webhook_events_total{status="${group.status}"} ${group._count._all}`)
  }
  return c.text(`${lines.join('\n')}\n`, 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Cache-Control': 'no-store',
  })
})

export async function checkReadiness(): Promise<{
  ready: boolean
  checks: { postgres: 'ok' | 'error'; redis: 'ok' | 'error' }
  latencyMs: number
}> {
  const startedAt = Date.now()
  const timeout = <T>(promise: Promise<T>) => Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Readiness timeout')), 2_000)),
  ])
  const [postgres, redisResult] = await Promise.allSettled([
    timeout(prisma.$queryRaw`SELECT 1`),
    timeout(redis.ping()),
  ])
  const checks = {
    postgres: postgres.status === 'fulfilled' ? 'ok' as const : 'error' as const,
    redis: redisResult.status === 'fulfilled' ? 'ok' as const : 'error' as const,
  }
  return {
    ready: checks.postgres === 'ok' && checks.redis === 'ok',
    checks,
    latencyMs: Date.now() - startedAt,
  }
}

export { operationsRouter }
