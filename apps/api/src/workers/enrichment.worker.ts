import { Worker } from 'bullmq'
import { prisma } from '@cap/db'
import {
  bullmqConnection,
  catalogSyncQueue,
  deadLetterQueue,
  enrichmentQueue,
  maintenanceQueue,
  flushDeadLetterWrites,
  recordDeadLetter,
  type EnrichmentJobData,
} from '../lib/queue.js'
import { redis } from '../lib/redis.js'
import { assertRuntimeSecrets } from '../lib/secrets.js'
import { registerGracefulShutdown } from '../lib/shutdown.js'
import { runEnrichmentJob } from '../lib/enrichment-pipeline.js'

assertRuntimeSecrets(process.env, { mode: 'worker' })

export const enrichmentWorker = new Worker<EnrichmentJobData>(
  'enrichment',
  (job) => runEnrichmentJob(job.data, job),
  {
    connection: bullmqConnection,
    concurrency: 3, // Process up to 3 products simultaneously
  }
)

enrichmentWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err)
  recordDeadLetter('enrichment', job, err)
})

enrichmentWorker.on('completed', (job, result) => {
  const geoScore = (result as { geoScore?: number }).geoScore
  console.log(`[Worker] Job ${job.id} completed.${geoScore == null ? '' : ` GEO score: ${geoScore}`}`)
})

registerGracefulShutdown('enrichment-worker', [
  // Waits for active jobs to finish instead of letting them stall and re-run.
  { name: 'worker', close: () => enrichmentWorker.close() },
  { name: 'dead-letter writes', close: () => flushDeadLetterWrites() },
  {
    name: 'queues',
    close: () => Promise.all([
      enrichmentQueue.close(),
      catalogSyncQueue.close(),
      maintenanceQueue.close(),
      deadLetterQueue.close(),
    ]),
  },
  { name: 'redis', close: () => redis.quit() },
  { name: 'postgres', close: () => prisma.$disconnect() },
], 110_000)

console.log('[Worker] Enrichment worker started')
