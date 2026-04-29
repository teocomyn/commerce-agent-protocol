import { Hono } from 'hono'
import { prisma } from '@cap/db'
import { verifyShopifyWebhook } from '../lib/shopify.js'
import { enrichmentQueue } from '../lib/queue.js'
import { redis } from '../lib/redis.js'

const webhookRouter = new Hono()

// POST /webhooks/shopify
webhookRouter.post('/shopify', async (c) => {
  const hmac = c.req.header('X-Shopify-Hmac-Sha256')
  const body = await c.req.text()

  // Verify HMAC signature
  if (!verifyShopifyWebhook(body, hmac)) {
    console.warn('[Webhook] Invalid HMAC signature')
    return c.json({ error: 'Invalid signature' }, 401)
  }

  const topic = c.req.header('X-Shopify-Topic')
  const shopDomain = c.req.header('X-Shopify-Shop-Domain')

  if (!shopDomain || !topic) {
    return c.json({ error: 'Missing required headers' }, 400)
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body) as Record<string, unknown>
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400)
  }

  console.log(`[Webhook] ${topic} from ${shopDomain}`)

  // Find merchant
  const merchant = await prisma.merchant.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { id: true },
  })

  if (!merchant) {
    console.warn(`[Webhook] Unknown shop: ${shopDomain}`)
    // Return 200 to avoid Shopify retrying for unknown shops
    return c.json({ received: true }, 200)
  }

  switch (topic) {
    case 'products/create':
      await enrichmentQueue.add(
        'enrich-product',
        {
          shopDomain,
          shopifyProductId: String(payload['id']),
          merchantId: merchant.id,
          action: 'create',
        },
        { priority: 1, attempts: 3, backoff: { type: 'exponential', delay: 5_000 } }
      )
      break

    case 'products/update':
      await enrichmentQueue.add(
        'enrich-product',
        {
          shopDomain,
          shopifyProductId: String(payload['id']),
          merchantId: merchant.id,
          action: 'update',
        },
        { priority: 2, attempts: 3, backoff: { type: 'exponential', delay: 5_000 } }
      )
      break

    case 'products/delete':
      await prisma.$executeRaw`
        UPDATE products_enriched SET deleted_at = NOW()
        WHERE product_raw_id IN (
          SELECT id FROM products_raw
          WHERE shopify_id = ${BigInt(payload['id'] as string | number)}
          AND merchant_id = ${merchant.id}::uuid
        )
      `
      break

    case 'inventory_levels/update':
      // Fast path: update stock in Redis cache without re-enriching
      await redis.hset(
        `stock:${shopDomain}`,
        String(payload['inventory_item_id']),
        String(payload['available'] ?? 0)
      )
      await redis.expire(`stock:${shopDomain}`, 86_400) // 24h TTL
      break

    case 'app/uninstalled':
      // Cleanup merchant data
      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { settings: { uninstalledAt: new Date().toISOString() } },
      })
      console.log(`[Webhook] App uninstalled by ${shopDomain}`)
      break
  }

  return c.json({ received: true }, 200)
})

export { webhookRouter }
