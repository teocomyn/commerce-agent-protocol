import { prisma } from '@cap/db'
import { ENRICHMENT_VERSION } from './enrichment-output.js'
import { catalogSyncQueue } from './queue.js'

// Leaves time for every service of a deploy to run the new release before the
// products are enriched again, so no job is processed by an older worker.
const BACKFILL_DELAY_MS = 10 * 60 * 1_000

/**
 * Products enriched by an older release (a new prompt or normalization, or
 * claims cleared by a migration) are enriched again without an operator step:
 * one full sync is queued per active install whose last completed full sync
 * ran under another ENRICHMENT_VERSION. The job id is stable per shop and
 * version, so restarts and concurrent workers queue it once.
 */
export async function queueOutdatedEnrichmentResyncs(): Promise<number> {
  const merchants = await prisma.$queryRaw<Array<{ id: string; shopify_domain: string }>>`
    SELECT id, shopify_domain
    FROM merchants
    WHERE uninstalled_at IS NULL
      AND shopify_token IS NOT NULL
      AND COALESCE(settings->>'enrichmentVersion', '') <> ${ENRICHMENT_VERSION}
  `
  if (merchants.length === 0) return 0
  await catalogSyncQueue.addBulk(merchants.map((merchant) => ({
    name: 'full-catalog-sync',
    data: { merchantId: merchant.id, shopDomain: merchant.shopify_domain },
    opts: {
      jobId: `enrichment-version-${ENRICHMENT_VERSION}-${merchant.id}`,
      delay: BACKFILL_DELAY_MS,
      priority: 5,
    },
  })))
  return merchants.length
}
