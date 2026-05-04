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

// ============================================================
// JOB TYPES
// ============================================================

export interface EnrichmentJobData {
  shopDomain: string
  shopifyProductId: string | number
  merchantId: string
  action: 'create' | 'update' | 'full-sync'
}

export interface CatalogSyncJobData {
  merchantId: string
  shopDomain: string
  shopifyToken: string
  cursor?: string // Pagination cursor for resume
}

// ============================================================
// QUEUE MONITORING HELPERS
// ============================================================

export async function getQueueStats() {
  const [enrichmentCounts, catalogCounts] = await Promise.all([
    enrichmentQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    catalogSyncQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ])

  return {
    enrichment: enrichmentCounts,
    catalogSync: catalogCounts,
  }
}

export { connection as bullmqConnection, Queue, Worker, type Job }
