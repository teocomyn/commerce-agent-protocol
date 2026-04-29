import crypto from 'node:crypto'
import { Hono } from 'hono'
import { prisma } from '@cap/db'
import {
  buildInstallUrl,
  exchangeCodeForToken,
  encryptToken,
  ensureStorefrontAccessToken,
} from '../../lib/shopify.js'
import { catalogSyncQueue } from '../../lib/queue.js'
import { redis } from '../../lib/redis.js'

const oauthRouter = new Hono()

const NONCE_TTL_SECONDS = 300 // 5 minutes
const nonceKey = (nonce: string) => `oauth:nonce:${nonce}`

// GET /shopify/install?shop=my-store.myshopify.com
oauthRouter.get('/install', async (c) => {
  const shop = c.req.query('shop')

  if (!shop || !shop.endsWith('.myshopify.com')) {
    return c.text('Invalid shop parameter', 400)
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  await redis.set(nonceKey(nonce), shop, 'EX', NONCE_TTL_SECONDS)

  const installUrl = buildInstallUrl(shop, nonce)
  return c.redirect(installUrl)
})

// GET /shopify/callback
oauthRouter.get('/callback', async (c) => {
  const { shop, code, state, hmac } = c.req.query() as Record<string, string>

  if (!shop || !code || !state || !hmac) {
    return c.text('Missing required OAuth parameters', 400)
  }

  // Validate nonce (Redis-backed, scales horizontally and survives restarts)
  const storedShop = await redis.get(nonceKey(state))
  if (!storedShop || storedShop !== shop) {
    return c.text('Invalid or expired state', 400)
  }
  await redis.del(nonceKey(state))

  // Validate HMAC on the callback params
  const params = new URLSearchParams(c.req.query() as Record<string, string>)
  params.delete('hmac')
  params.sort()
  const message = params.toString()
  const expectedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET ?? '')
    .update(message)
    .digest('hex')

  const expected = Buffer.from(expectedHmac)
  const received = Buffer.from(hmac)
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return c.text('HMAC validation failed', 401)
  }

  // Exchange code for admin access token
  const accessToken = await exchangeCodeForToken(shop, code)
  const encryptedAdminToken = encryptToken(accessToken)

  // Provision a storefront access token for Cart API checkouts
  let encryptedStorefrontToken: string | null = null
  try {
    const storefrontToken = await ensureStorefrontAccessToken(shop, accessToken)
    encryptedStorefrontToken = encryptToken(storefrontToken)
  } catch (err) {
    // Non-fatal: catalog sync still works, checkouts will be unavailable until
    // the merchant re-authorizes with the right scope (unauthenticated_*).
    console.warn(
      `[OAuth] Could not provision storefront token for ${shop}:`,
      err instanceof Error ? err.message : err
    )
  }

  // Create or update merchant
  const merchant = await prisma.merchant.upsert({
    where: { shopifyDomain: shop },
    create: {
      shopifyDomain: shop,
      shopifyToken: encryptedAdminToken,
      storefrontToken: encryptedStorefrontToken,
      plan: 'free',
    },
    update: {
      shopifyToken: encryptedAdminToken,
      ...(encryptedStorefrontToken && {
        storefrontToken: encryptedStorefrontToken,
      }),
      updatedAt: new Date(),
    },
  })

  // Trigger full catalog sync
  await catalogSyncQueue.add('full-catalog-sync', {
    merchantId: merchant.id,
    shopDomain: shop,
    shopifyToken: encryptedAdminToken,
  })

  console.log(`[OAuth] Merchant ${shop} connected. Catalog sync triggered.`)

  // Redirect to dashboard
  const dashboardUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
  return c.redirect(`${dashboardUrl}/dashboard?connected=true`)
})

export { oauthRouter }
