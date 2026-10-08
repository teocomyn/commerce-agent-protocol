import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq'
import { getBullMQConnection } from './redis-connection.js'

const connection: ConnectionOptions = getBullMQConnection()

// ============================================================
// QUEUES
// ============================================================

// Product enrichment queue (LLM + embedding)
export const enrichmentQueue = new Queue('enrichment', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
})

// Full catalog sync queue (initial pull)
export const catalogSyncQueue = new Queue('catalog-sync', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

/**
 * Queues a full catalog sync of one shop. Every producer (OAuth install,
 * operations resync, re-enrichment after a release) shares one deduplication
 * key per shop, so two full syncs of a shop never overlap: a request made
 * while one is waiting or running is ignored. `jobId` must be unique per
 * request. Returns whether a new job was queued.
 */
export async function queueFullCatalogSync(
  merchantId: string,
  shopDomain: string,
  options: { jobId: string; delay?: number; priority?: number },
): Promise<boolean> {
  const job = await catalogSyncQueue.add('full-catalog-sync', { merchantId, shopDomain }, {
    jobId: options.jobId,
    deduplication: { id: `full-sync-${merchantId}` },
    ...(options.delay !== undefined && { delay: options.delay }),
    ...(options.priority !== undefined && { priority: options.priority }),
  })
  // A deduplicated add returns the job that is already queued.
  return job.id === options.jobId
}

export const deadLetterQueue = new Queue('dead-letter', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 5_000 },
    removeOnFail: { count: 5_000 },
  },
})

export async function sendToDeadLetter(
  sourceQueue: string,
  job: Job | undefined,
  error: Error,
): Promise<void> {
  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return
  await deadLetterQueue.add(`${sourceQueue}-failed`, {
    sourceQueue,
    sourceJobId: job.id,
    data: job.data,
    attemptsMade: job.attemptsMade,
    failedReason: error.message,
    failedAt: new Date().toISOString(),
  })
}

// ============================================================
// JOB TYPES
// ============================================================

export interface EnrichmentJobData {
  shopDomain: string
  shopifyProductId: string | number
  merchantId: string
  action: 'create' | 'update' | 'full-sync'
}

export interface FullCatalogSyncJobData {
  merchantId: string
  shopDomain: string
  kind?: 'full-catalog'
  cursor?: string // Pagination cursor for resume
}

export interface InventorySyncJobData {
  merchantId: string
  shopDomain: string
  kind: 'inventory'
  inventoryItemId: string
}

export type CatalogSyncJobData = FullCatalogSyncJobData | InventorySyncJobData

// ============================================================
// QUEUE MONITORING HELPERS
// ============================================================

export async function getQueueStats() {
  const [enrichmentCounts, catalogCounts, deadLetterCounts] = await Promise.all([
    enrichmentQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    catalogSyncQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    deadLetterQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ])

  return {
    enrichment: enrichmentCounts,
    catalogSync: catalogCounts,
    deadLetter: deadLetterCounts,
  }
}

export { connection as bullmqConnection, Queue, Worker, type Job }
