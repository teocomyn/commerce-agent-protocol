import { prisma } from '@cap/db'
import { ENRICHMENT_VERSION } from './enrichment-output.js'
import { queueFullCatalogSync } from './queue.js'

// Leaves time for every service of a deploy to run the new release before the
// products are enriched again, so no job is processed by an older worker.
const BACKFILL_DELAY_MS = 10 * 60 * 1_000

/** Whether the shop's last completed full sync ran under `version`. */
export async function fullSyncRanUnder(merchantId: string, version: string): Promise<boolean> {
  const [merchant] = await prisma.$queryRaw<Array<{ version: string | null }>>`
    SELECT settings->>'enrichmentVersion' AS version FROM merchants WHERE id = ${merchantId}::uuid
  `
  return merchant?.version === version
}

/**
 * Products enriched by an older release (a new prompt or normalization, or
 * claims cleared by a migration) are enriched again without an operator step:
 * one full sync is queued per active install whose last completed full sync
 * ran under another ENRICHMENT_VERSION. A shop whose full sync is already
 * waiting or running (this one after a restart, or any other producer) is
 * not queued twice. Returns the number of shops newly queued.
 */
export async function queueOutdatedEnrichmentResyncs(): Promise<number> {
  const merchants = await prisma.$queryRaw<Array<{ id: string; shopify_domain: string }>>`
    SELECT id, shopify_domain
    FROM merchants
    WHERE uninstalled_at IS NULL
      AND shopify_token IS NOT NULL
      AND COALESCE(settings->>'enrichmentVersion', '') <> ${ENRICHMENT_VERSION}
  `
  const requestedAt = Date.now()
  const queued = await Promise.all(merchants.map((merchant) => queueFullCatalogSync(
    merchant.id,
    merchant.shopify_domain,
    {
      jobId: `enrichment-version-${ENRICHMENT_VERSION}-${merchant.id}-${requestedAt}`,
      delay: BACKFILL_DELAY_MS,
      priority: 5,
      // A full sync may run under the new version before this one (install,
      // manual resync): then this job has nothing left to do.
      unlessEnrichmentVersion: ENRICHMENT_VERSION,
    },
  )))
  return queued.filter(Boolean).length
}
