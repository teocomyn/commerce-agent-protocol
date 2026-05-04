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

    case 'orders/create':
    case 'orders/paid':
      // Reconcile AgentCheckout: a Shopify order may carry the cart_token
      // (Storefront cart id) in its payload. We mark any matching pending
      // checkouts as completed.
      await reconcileAgentCheckout(merchant.id, payload, topic === 'orders/paid')
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

/**
 * Look up the AgentCheckout that matches a Shopify order payload and mark it
 * as completed. Shopify exposes the original Storefront cart id on orders via
 * the `cart_token` field. We cross-reference our cart id (stored in
 * `agent_checkouts.shopify_checkout_id`) against this token, falling back to
 * the most recent pending checkout for the same merchant + amount when no
 * cart_token is present.
 */
async function reconcileAgentCheckout(
  merchantId: string,
  payload: Record<string, unknown>,
  isPaid: boolean,
): Promise<void> {
  const cartToken = payload['cart_token'] as string | undefined
  const orderId = String(payload['id'] ?? '')
  const totalRaw = payload['total_price'] as string | undefined
  const total = totalRaw ? parseFloat(totalRaw) : null

  let checkout = null
  if (cartToken) {
    checkout = await prisma.agentCheckout.findFirst({
      where: {
        merchantId,
        // Shopify cart_token is the suffix of `gid://shopify/Cart/<token>`
        OR: [
          { shopifyCheckoutId: cartToken },
          { shopifyCheckoutId: `gid://shopify/Cart/${cartToken}` },
        ],
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  if (!checkout && total != null) {
    // Fallback: best-effort match by merchant + amount within the last hour.
    checkout = await prisma.agentCheckout.findFirst({
      where: {
        merchantId,
        status: 'pending',
        amount: total,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  if (!checkout) {
    console.log(
      `[Webhook] orders/${isPaid ? 'paid' : 'create'} ${orderId} – no matching AgentCheckout`,
    )
    return
  }

  await prisma.agentCheckout.update({
    where: { id: checkout.id },
    data: {
      status: 'completed',
      ...(orderId ? { shopifyOrderId: orderId } : {}),
      ...(total != null && { amount: total }),
    },
  })

  if (checkout.agentQueryId) {
    await prisma.agentQuery.update({
      where: { id: checkout.agentQueryId },
      data: { converted: true },
    })
  }

  console.log(
    `[Webhook] AgentCheckout ${checkout.id} marked completed (order ${orderId})`,
  )
}

export { webhookRouter }
