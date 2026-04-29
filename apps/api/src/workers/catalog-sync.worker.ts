import { Worker } from 'bullmq'
import { prisma } from '@cap/db'
import { bullmqConnection, enrichmentQueue, type CatalogSyncJobData } from '../lib/queue.js'
import { fetchShopifyProducts, decryptToken } from '../lib/shopify.js'

export const catalogSyncWorker = new Worker<CatalogSyncJobData>(
  'catalog-sync',
  async (job) => {
    const { merchantId, shopDomain, cursor } = job.data
    const token = decryptToken(job.data.shopifyToken)

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
          jobId: `${merchantId}-${product.id}`, // Deduplicate
        },
      }))

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
    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        settings: {
          lastFullSync: new Date().toISOString(),
          totalProducts: totalProcessed,
        },
      },
    })

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
})

console.log('[Worker] Catalog sync worker started')
