import { Worker } from 'bullmq'
import { prisma, type Prisma } from '@cap/db'
import {
  bullmqConnection,
  catalogSyncQueue,
  deadLetterQueue,
  enrichmentQueue,
  maintenanceQueue,
  flushDeadLetterWrites,
  recordDeadLetter,
  type CatalogSyncJobData,
} from '../lib/queue.js'
import { runRetention } from '../lib/retention.js'
import { fetchShopifyInventorySnapshot, fetchShopifyProducts } from '../lib/shopify.js'
import { InactiveInstallError, getValidShopifyAdminToken } from '../lib/shopify-token.js'
import { applyInventorySnapshot } from '../lib/inventory.js'
import { invalidateMerchantSearchCache, redis } from '../lib/redis.js'
import { assertRuntimeSecrets } from '../lib/secrets.js'
import { registerGracefulShutdown } from '../lib/shutdown.js'

assertRuntimeSecrets(process.env, { mode: 'worker' })

export const catalogSyncWorker = new Worker<CatalogSyncJobData>(
  'catalog-sync',
  async (job) => {
    const { merchantId, shopDomain } = job.data
    let token: string
    try {
      token = await getValidShopifyAdminToken(merchantId)
    } catch (error) {
      if (!(error instanceof InactiveInstallError)) throw error
      console.log(`[CatalogSync] Skipping job ${job.id}: ${shopDomain} is no longer installed`)
      return { skipped: 'merchant-inactive' }
    }

    if (job.data.kind === 'inventory') {
      const snapshot = await fetchShopifyInventorySnapshot(
        shopDomain,
        token,
        job.data.inventoryItemId,
      )
      const products = await prisma.$queryRaw<Array<{ id: string; variants: unknown }>>`
        SELECT id, variants
        FROM products_raw
        WHERE merchant_id = ${merchantId}::uuid
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(variants) AS variant
            WHERE variant->>'inventory_item_id' = ${String(snapshot.inventory_item_id)}
          )
      `
      // Product not synchronized yet. Its enrichment job schedules a snapshot
      // once the row exists; in case that job never runs, look once more
      // later instead of dropping a webhook-driven update.
      if (products.length === 0) {
        if (!job.data.deferred) {
          await catalogSyncQueue.add(
            'inventory-level-sync',
            { ...job.data, deferred: true },
            { delay: 120_000, priority: 2, jobId: `${job.id}-deferred` },
          )
        }
        return { inventoryItemId: snapshot.inventory_item_id, productsUpdated: 0, skipped: 'not-normalized' }
      }
      await prisma.$transaction(products.map((product) => prisma.productRaw.update({
        where: { id: product.id },
        data: {
          variants: applyInventorySnapshot(product.variants, snapshot) as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
      })))
      await invalidateMerchantSearchCache(merchantId)
      return { inventoryItemId: snapshot.inventory_item_id, productsUpdated: products.length }
    }

    const { cursor } = job.data

    console.log(`[CatalogSync] Starting sync for ${shopDomain} (cursor: ${cursor ?? 'start'})`)

    let pageInfo = cursor
    let totalProcessed = 0
    let totalPages = 0

    do {
      const { products, nextPageInfo } = await fetchShopifyProducts(shopDomain, token, pageInfo)

      totalPages++
      await job.log(`Fetched page ${totalPages}: ${products.length} products`)

      // Enqueue each product for enrichment
      const enrichmentJobs = products.map((product) => ({
        name: 'enrich-product',
        data: {
          shopDomain,
          shopifyProductId: product.id.toString(),
          merchantId,
          action: 'create' as const,
        },
        opts: {
          priority: 3, // Lower priority than webhook-triggered jobs
          jobId: `full-sync-${merchantId}-${product.id}-${job.id}`,
          removeOnComplete: true,
        },
      }))

      // Inventory snapshots are scheduled by each enrichment job once its
      // product row exists; scheduling them here raced the enrichment and
      // filled the dead-letter queue on large catalogs.
      await enrichmentQueue.addBulk(enrichmentJobs)

      totalProcessed += products.length
      pageInfo = nextPageInfo

      await job.updateProgress(Math.min(90, totalProcessed / 10))

      // Small delay to avoid hammering Shopify API
      if (nextPageInfo) {
        await new Promise(r => setTimeout(r, 500))
      }
    } while (pageInfo)

    // Update merchant settings with sync status
    await prisma.$executeRaw`
      UPDATE merchants
      SET settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({
        lastFullSync: new Date().toISOString(),
        totalProducts: totalProcessed,
      })}::jsonb,
      updated_at = NOW()
      WHERE id = ${merchantId}::uuid
    `

    await job.updateProgress(100)
    console.log(`[CatalogSync] ✓ ${shopDomain}: ${totalProcessed} products queued for enrichment`)

    return { totalProcessed, totalPages }
  },
  {
    connection: bullmqConnection,
    concurrency: 2,
  }
)

catalogSyncWorker.on('failed', (job, err) => {
  console.error(`[CatalogSync] Job ${job?.id} failed:`, err)
  recordDeadLetter('catalog-sync', job, err)
})

// Daily data retention (GDPR) at 03:00 UTC. upsertJobScheduler is idempotent,
// so every worker start converges on a single schedule.
export const maintenanceWorker = new Worker(
  'maintenance',
  async () => {
    const result = await runRetention()
    console.log('[Maintenance] Retention completed:', result)
    return result
  },
  { connection: bullmqConnection, concurrency: 1 },
)

maintenanceWorker.on('failed', (job, err) => {
  console.error(`[Maintenance] Job ${job?.id} failed:`, err)
  recordDeadLetter('maintenance', job, err)
})

registerGracefulShutdown('catalog-worker', [
  // Waits for active jobs (a page of the catalog or a snapshot) to finish.
  { name: 'workers', close: () => Promise.all([catalogSyncWorker.close(), maintenanceWorker.close()]) },
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

// Registered after the shutdown handler and not awaited: a Redis outage at
// startup must not block the process before it can react to SIGTERM.
void maintenanceQueue.upsertJobScheduler(
  'daily-retention',
  { pattern: '0 3 * * *', tz: 'UTC' },
  { name: 'retention' },
).catch((error: unknown) => console.error('[Maintenance] Could not register the daily retention schedule:', error))

console.log('[Worker] Catalog sync worker started')
