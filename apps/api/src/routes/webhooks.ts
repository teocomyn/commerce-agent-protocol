import crypto from 'node:crypto'
import { Hono } from 'hono'
import { prisma, type Prisma } from '@cap/db'
import { verifyShopifyWebhook } from '../lib/shopify.js'
import { catalogSyncQueue, enrichmentQueue } from '../lib/queue.js'
import { invalidateApiKeyCache, invalidateMerchantSearchCache } from '../lib/redis.js'
import { extractCheckoutTrackingToken } from '../lib/webhook-utils.js'
import { applyInventoryLevelUpdate } from '../lib/inventory.js'
import { redactCustomerOrders, redactShop } from '../lib/retention.js'

const webhookRouter = new Hono()

webhookRouter.post('/shopify', async (c) => {
  const hmac = c.req.header('X-Shopify-Hmac-Sha256')
  const body = await c.req.text()
  if (!verifyShopifyWebhook(body, hmac)) {
    return c.json({ error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid signature' } }, 401)
  }

  const topic = c.req.header('X-Shopify-Topic')?.toLowerCase()
  const shopDomain = c.req.header('X-Shopify-Shop-Domain')?.toLowerCase()
  if (!shopDomain || !topic) {
    return c.json({ error: { code: 'INVALID_WEBHOOK', message: 'Missing required headers' } }, 400)
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body) as Record<string, unknown>
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON payload' } }, 400)
  }

  const merchant = await prisma.merchant.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { id: true },
  })
  if (!merchant) return c.json({ received: true }, 200)

  const webhookId = c.req.header('X-Shopify-Webhook-Id') ?? crypto
    .createHash('sha256')
    .update(`${shopDomain}:${topic}:${body}`)
    .digest('hex')
  const event = await claimWebhook(webhookId, merchant.id, topic)
  if (!event.claimed) return c.json({ received: true, duplicate: true }, 200)

  try {
    const outcome = await processWebhook({ topic, shopDomain, merchantId: merchant.id, webhookId, payload })
    // shop/redact deletes the merchant, and its webhook_events rows with it.
    if (!outcome.merchantDeleted) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'completed', processedAt: new Date(), error: null },
      })
    }
    return c.json({ received: true }, 200)
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'failed',
        processedAt: new Date(),
        error: (error instanceof Error ? error.message : String(error)).slice(0, 4_000),
      },
    }).catch(() => undefined)
    console.error(`[Webhook] ${topic} failed:`, error)
    return c.json({ error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Webhook processing failed' } }, 500)
  }
})

async function claimWebhook(
  webhookId: string,
  merchantId: string,
  topic: string,
): Promise<{ id: string; claimed: boolean }> {
  const existing = await prisma.webhookEvent.findUnique({ where: { webhookId } })
  if (existing) {
    const stale = existing.status === 'processing' &&
      existing.receivedAt.getTime() < Date.now() - 5 * 60 * 1_000
    if (existing.status !== 'failed' && !stale) return { id: existing.id, claimed: false }
    const retried = await prisma.webhookEvent.update({
      where: { id: existing.id },
      data: { status: 'processing', error: null, receivedAt: new Date(), processedAt: null },
    })
    return { id: retried.id, claimed: true }
  }
  try {
    const created = await prisma.webhookEvent.create({
      data: { webhookId, merchantId, topic },
    })
    return { id: created.id, claimed: true }
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const raced = await prisma.webhookEvent.findUniqueOrThrow({ where: { webhookId } })
      return { id: raced.id, claimed: false }
    }
    throw error
  }
}

async function processWebhook(args: {
  topic: string
  shopDomain: string
  merchantId: string
  webhookId: string
  payload: Record<string, unknown>
}): Promise<{ merchantDeleted?: boolean }> {
  const { topic, shopDomain, merchantId, webhookId, payload } = args
  const productId = String(payload['id'] ?? '')

  switch (topic) {
    case 'products/create':
    case 'products/update':
      await enrichmentQueue.add(
        'enrich-product',
        {
          shopDomain,
          shopifyProductId: productId,
          merchantId,
          action: topic === 'products/create' ? 'create' : 'update',
        },
        {
          jobId: `product-${merchantId}-${productId}-${webhookId}`,
          priority: topic === 'products/create' ? 1 : 2,
        },
      )
      break

    case 'products/delete':
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE products_enriched SET deleted_at = NOW()
          WHERE product_raw_id IN (
            SELECT id FROM products_raw
            WHERE shopify_id = ${BigInt(productId)} AND merchant_id = ${merchantId}::uuid
          )
        `,
        prisma.productRaw.updateMany({
          where: { shopifyId: BigInt(productId), merchantId },
          data: { deletedAt: new Date() },
        }),
      ])
      await invalidateMerchantSearchCache(merchantId)
      break

    case 'inventory_levels/update': {
      const inventoryItemId = String(payload['inventory_item_id'] ?? '')
      const locationId = payload['location_id'] == null ? null : String(payload['location_id'])
      const available = Number(payload['available'])
      if (!inventoryItemId || payload['available'] == null || !Number.isFinite(available)) {
        throw new Error('Invalid inventory payload')
      }
      const products = await prisma.$queryRaw<Array<{ id: string; variants: unknown }>>`
        SELECT id, variants
        FROM products_raw
        WHERE merchant_id = ${merchantId}::uuid
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(variants) AS variant
            WHERE variant->>'inventory_item_id' = ${inventoryItemId}
          )
      `
      await prisma.$transaction(products.map((product) => prisma.productRaw.update({
        where: { id: product.id },
        data: {
          variants: applyInventoryLevelUpdate(
            product.variants,
            inventoryItemId,
            locationId,
            available,
          ) as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
      })))
      await catalogSyncQueue.add(
        'inventory-level-sync',
        { merchantId, shopDomain, kind: 'inventory', inventoryItemId },
        {
          priority: 1,
          jobId: `inventory-${merchantId}-${inventoryItemId}-${crypto
            .createHash('sha256')
            .update(webhookId)
            .digest('hex')
            .slice(0, 16)}`,
        },
      )
      await invalidateMerchantSearchCache(merchantId)
      break
    }

    case 'orders/create':
    case 'orders/paid':
      await reconcileAgentCheckout(merchantId, payload, topic === 'orders/paid')
      break

    case 'app/uninstalled': {
      const keys = await prisma.apiKey.findMany({
        where: { merchantId, revokedAt: null },
        select: { keyHash: true },
      })
      const now = new Date()
      await prisma.$transaction([
        prisma.apiKey.updateMany({
          where: { merchantId, revokedAt: null },
          data: { revokedAt: now },
        }),
        prisma.merchantMember.updateMany({
          where: { merchantId, revokedAt: null },
          data: { revokedAt: now, sessionVersion: { increment: 1 } },
        }),
        // Otherwise a reinstall would make old invitation links valid again.
        prisma.merchantInvitation.updateMany({
          where: { merchantId, acceptedAt: null, revokedAt: null },
          data: { revokedAt: now },
        }),
        prisma.dashboardLoginToken.updateMany({
          where: { merchantId, consumedAt: null },
          data: { consumedAt: now },
        }),
        prisma.merchant.update({
          where: { id: merchantId },
          data: {
            shopifyToken: null,
            shopifyRefreshToken: null,
            storefrontToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            uninstalledAt: new Date(),
          },
        }),
      ])
      await prisma.$executeRaw`
        UPDATE merchants
        SET settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({
          uninstalledAt: new Date().toISOString(),
        })}::jsonb
        WHERE id = ${merchantId}::uuid
      `
      await invalidateApiKeyCache(keys.map((key) => key.keyHash))
      await invalidateMerchantSearchCache(merchantId)
      break
    }

    // Mandatory GDPR compliance topics (configured in the Shopify app, not
    // registered through the API).
    case 'customers/data_request':
      // CAP stores no customer profile: order webhooks only keep the order id
      // on agent_checkouts, and agent queries are not linked to a customer.
      console.log(`[Webhook] ${shopDomain} customers/data_request: no customer data held`)
      break

    case 'customers/redact': {
      const orderIds = Array.isArray(payload['orders_to_redact'])
        ? (payload['orders_to_redact'] as unknown[]).map(String)
        : []
      await redactCustomerOrders(merchantId, orderIds)
      break
    }

    case 'shop/redact': {
      const result = await redactShop(merchantId)
      if (!result.erased) {
        // Shopify only sends shop/redact 48 h after an uninstall, so the
        // app/uninstalled webhook was missed or not processed yet. Failing
        // keeps a durable failed event and makes Shopify redeliver, instead
        // of silently skipping the erasure.
        throw new Error(`shop/redact received for ${shopDomain}, which is not marked uninstalled`)
      }
      await invalidateApiKeyCache(result.apiKeyHashes)
        .catch((error: unknown) => console.error('[Webhook] API key cache eviction failed:', error))
      await invalidateMerchantSearchCache(merchantId)
      return { merchantDeleted: true }
    }
  }
  return {}
}

async function reconcileAgentCheckout(
  merchantId: string,
  payload: Record<string, unknown>,
  isPaid: boolean,
): Promise<void> {
  const trackingToken = extractCheckoutTrackingToken(payload)
  if (!trackingToken) return
  const checkout = await prisma.agentCheckout.findFirst({
    where: { merchantId, trackingToken },
  })
  if (!checkout) return

  const orderId = String(payload['id'] ?? '')
  const total = Number(payload['total_price'])
  await prisma.agentCheckout.update({
    where: { id: checkout.id },
    data: {
      status: isPaid ? 'completed' : 'ordered',
      ...(orderId && { shopifyOrderId: orderId }),
      ...(Number.isFinite(total) && { amount: total }),
    },
  })
  if (isPaid && checkout.agentQueryId) {
    await prisma.agentQuery.update({
      where: { id: checkout.agentQueryId },
      data: { converted: true },
    })
  }
}

export { webhookRouter }
