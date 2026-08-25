import { Worker } from 'bullmq'
import { prisma, type Prisma } from '@cap/db'
import { bullmqConnection, catalogSyncQueue, enrichmentQueue, sendToDeadLetter, type CatalogSyncJobData } from '../lib/queue.js'
import { fetchShopifyInventorySnapshot, fetchShopifyProducts } from '../lib/shopify.js'
import { getValidShopifyAdminToken } from '../lib/shopify-token.js'
import { applyInventorySnapshot } from '../lib/inventory.js'
import { invalidateMerchantSearchCache } from '../lib/redis.js'

export const catalogSyncWorker = new Worker<CatalogSyncJobData>(
  'catalog-sync',
  async (job) => {
    const { merchantId, shopDomain } = job.data
    const token = await getValidShopifyAdminToken(merchantId)

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
      if (products.length === 0) {
        throw new Error(`Inventory item ${snapshot.inventory_item_id} is not normalized yet`)
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

      await enrichmentQueue.addBulk(enrichmentJobs)

      const inventoryItemIds = new Set(products.flatMap((product) => product.variants.flatMap(
        (variant) => variant.inventory_item_id == null ? [] : [String(variant.inventory_item_id)],
      )))
      await catalogSyncQueue.addBulk([...inventoryItemIds].map((inventoryItemId) => ({
        name: 'inventory-level-sync',
        data: { merchantId, shopDomain, kind: 'inventory' as const, inventoryItemId },
        opts: {
          priority: 2,
          delay: 30_000,
          jobId: `initial-inventory-${merchantId}-${inventoryItemId}-${job.id}`,
        },
      })))

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
  void sendToDeadLetter('catalog-sync', job, err)
})

console.log('[Worker] Catalog sync worker started')
