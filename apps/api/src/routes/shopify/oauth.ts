import crypto from 'node:crypto'
import { Hono } from 'hono'
import { prisma } from '@cap/db'
import {
  buildInstallUrl,
  exchangeCodeForToken,
  encryptToken,
  fetchShopifyProducts,
} from '../lib/shopify.js'
import { catalogSyncQueue } from '../lib/queue.js'

const oauthRouter = new Hono()

// In-memory nonce store (use Redis for production)
const nonceStore = new Map<string, { shop: string; expiresAt: number }>()

// GET /shopify/install?shop=my-store.myshopify.com
oauthRouter.get('/install', async (c) => {
  const shop = c.req.query('shop')

  if (!shop || !shop.endsWith('.myshopify.com')) {
    return c.text('Invalid shop parameter', 400)
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  nonceStore.set(nonce, { shop, expiresAt: Date.now() + 300_000 }) // 5 min

  const installUrl = buildInstallUrl(shop, nonce)
  return c.redirect(installUrl)
})

// GET /shopify/callback
oauthRouter.get('/callback', async (c) => {
  const { shop, code, state, hmac } = c.req.query() as Record<string, string>

  // Validate nonce
  const nonceData = nonceStore.get(state ?? '')
  if (!nonceData || nonceData.shop !== shop || Date.now() > nonceData.expiresAt) {
    return c.text('Invalid or expired state', 400)
  }
  nonceStore.delete(state ?? '')

  // Validate HMAC on the callback params
  const params = new URLSearchParams(c.req.query() as Record<string, string>)
  params.delete('hmac')
  params.sort()
  const message = params.toString()
  const expectedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET ?? '')
    .update(message)
    .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(hmac ?? ''))) {
    return c.text('HMAC validation failed', 401)
  }

  // Exchange code for token
  const accessToken = await exchangeCodeForToken(shop, code ?? '')
  const encryptedToken = encryptToken(accessToken)

  // Create or update merchant
  const merchant = await prisma.merchant.upsert({
    where: { shopifyDomain: shop },
    create: {
      shopifyDomain: shop,
      shopifyToken: encryptedToken,
      plan: 'free',
    },
    update: {
      shopifyToken: encryptedToken,
      updatedAt: new Date(),
    },
  })

  // Trigger full catalog sync
  await catalogSyncQueue.add('full-catalog-sync', {
    merchantId: merchant.id,
    shopDomain: shop,
    shopifyToken: encryptedToken,
  })

  console.log(`[OAuth] Merchant ${shop} connected. Catalog sync triggered.`)

  // Redirect to dashboard
  const dashboardUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
  return c.redirect(`${dashboardUrl}/dashboard?connected=true`)
})

export { oauthRouter }
