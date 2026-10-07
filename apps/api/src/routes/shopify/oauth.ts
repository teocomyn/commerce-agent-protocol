import crypto from 'node:crypto'
import { Hono } from 'hono'
import { Prisma, prisma } from '@cap/db'
import {
  buildInstallUrl,
  exchangeCodeForToken,
  encryptToken,
  ensureStorefrontAccessToken,
  fetchShopConfiguration,
  isValidShopDomain,
  registerShopifyWebhooks,
  validateGrantedScopes,
  verifyShopifyOAuthHmac,
} from '../../lib/shopify.js'
import { queueFullCatalogSync } from '../../lib/queue.js'
import { redis } from '../../lib/redis.js'

const oauthRouter = new Hono()

const NONCE_TTL_SECONDS = 300 // 5 minutes
const nonceKey = (nonce: string) => `oauth:nonce:${nonce}`

// GET /shopify/install?shop=my-store.myshopify.com
oauthRouter.get('/install', async (c) => {
  const shop = c.req.query('shop')

  if (!shop || !isValidShopDomain(shop)) {
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

  if (!shop || !isValidShopDomain(shop) || !code || !state || !hmac) {
    return c.text('Missing required OAuth parameters', 400)
  }

  if (!process.env.SHOPIFY_API_SECRET) throw new Error('SHOPIFY_API_SECRET is not set')

  // Validate nonce (Redis-backed, scales horizontally and survives restarts)
  const storedShop = await redis.get(nonceKey(state))
  if (!storedShop || storedShop !== shop) {
    return c.text('Invalid or expired state', 400)
  }
  // Validate HMAC on the callback params
  if (!verifyShopifyOAuthHmac(c.req.query() as Record<string, string>)) {
    return c.text('HMAC validation failed', 401)
  }

  // Consume the nonce atomically only after signature validation. This blocks
  // replay without letting an invalid callback burn a legitimate OAuth state.
  const consumed = await redis.eval(
    'if redis.call("get", KEYS[1]) == ARGV[1] then redis.call("del", KEYS[1]); return 1 else return 0 end',
    1,
    nonceKey(state),
    shop,
  )
  if (consumed !== 1) return c.text('Invalid or replayed state', 400)

  // Exchange code for admin access token
  const tokenResult = await exchangeCodeForToken(shop, code)
  const missingScopes = validateGrantedScopes(tokenResult.grantedScopes)
  if (missingScopes.length > 0) {
    return c.json({
      error: {
        code: 'SHOPIFY_SCOPES_MISSING',
        message: 'Shopify did not grant all required scopes',
        details: { missing_scopes: missingScopes },
      },
    }, 403)
  }
  const encryptedAdminToken = encryptToken(tokenResult.accessToken)
  const encryptedRefreshToken = tokenResult.refreshToken
    ? encryptToken(tokenResult.refreshToken)
    : null
  const shopConfiguration = await fetchShopConfiguration(shop, tokenResult.accessToken)

  // Provision a storefront access token for Cart API checkouts
  let encryptedStorefrontToken: string | null = null
  try {
    const storefrontToken = await ensureStorefrontAccessToken(shop, tokenResult.accessToken)
    encryptedStorefrontToken = encryptToken(storefrontToken)
  } catch (err) {
    // Non-fatal: catalog sync still works, checkouts will be unavailable until
    // the merchant re-authorizes with the right scope (unauthenticated_*).
    console.warn(
      `[OAuth] Could not provision storefront token for ${shop}:`,
      err instanceof Error ? err.message : err
    )
  }

  // A merchant must not become active unless lifecycle, inventory, and order
  // webhooks are registered. Otherwise revoked credentials or stale stock can
  // remain usable after Shopify believes the app is disconnected.
  await registerShopifyWebhooks(shop, tokenResult.accessToken)

  // Create or update merchant
  const merchant = await prisma.merchant.upsert({
    where: { shopifyDomain: shop },
    create: {
      shopifyDomain: shop,
      shopifyToken: encryptedAdminToken,
      shopifyRefreshToken: encryptedRefreshToken,
      accessTokenExpiresAt: tokenResult.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokenResult.refreshTokenExpiresAt,
      grantedScopes: tokenResult.grantedScopes,
      storefrontToken: encryptedStorefrontToken,
      shopCurrency: shopConfiguration.currency,
      plan: 'free',
    },
    update: {
      shopifyToken: encryptedAdminToken,
      shopifyRefreshToken: encryptedRefreshToken,
      accessTokenExpiresAt: tokenResult.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokenResult.refreshTokenExpiresAt,
      grantedScopes: tokenResult.grantedScopes,
      shopCurrency: shopConfiguration.currency,
      uninstalledAt: null,
      ...(encryptedStorefrontToken && {
        storefrontToken: encryptedStorefrontToken,
      }),
      updatedAt: new Date(),
    },
  })
  await prisma.$executeRaw`
    UPDATE merchants
    SET settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({
      supportedShippingCountries: shopConfiguration.shippingCountries,
    })}::jsonb
    WHERE id = ${merchant.id}::uuid
  `

  const user = await prisma.user.upsert({
    where: { externalId: `shopify:${shop}` },
    create: { externalId: `shopify:${shop}`, name: shopConfiguration.name },
    update: { name: shopConfiguration.name },
  })
  // Re-authorizing (e.g. a scope update) must not sign the owner out of
  // every device: the membership is only written, and its session version
  // bumped, when it actually changes.
  const ownerMembership = await prisma.merchantMember.findUnique({
    where: { userId_merchantId: { userId: user.id, merchantId: merchant.id } },
    select: { role: true, revokedAt: true },
  })
  const restoreOwner = () => prisma.merchantMember.updateMany({
    where: {
      userId: user.id,
      merchantId: merchant.id,
      OR: [{ role: { not: 'OWNER' } }, { revokedAt: { not: null } }],
    },
    data: { role: 'OWNER', revokedAt: null, sessionVersion: { increment: 1 } },
  })
  if (!ownerMembership) {
    try {
      await prisma.merchantMember.create({
        data: { userId: user.id, merchantId: merchant.id, role: 'OWNER' },
      })
    } catch (error) {
      // A concurrent callback for the same shop created it first.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
      await restoreOwner()
    }
  } else if (ownerMembership.role !== 'OWNER' || ownerMembership.revokedAt) {
    await restoreOwner()
  }

  // Trigger full catalog sync (ignored if one is already waiting or running)
  await queueFullCatalogSync(merchant.id, shop, { jobId: `install-sync-${merchant.id}-${Date.now()}` })

  console.log(`[OAuth] Merchant ${shop} connected. Catalog sync triggered.`)

  // Redirect to dashboard
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3001'
  const loginToken = crypto.randomBytes(32).toString('base64url')
  await prisma.dashboardLoginToken.create({
    data: {
      tokenHash: crypto.createHash('sha256').update(loginToken).digest('hex'),
      userId: user.id,
      merchantId: merchant.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
    },
  })
  const sessionUrl = new URL('/api/session/merchant', dashboardUrl)
  sessionUrl.searchParams.set('token', loginToken)
  return c.redirect(sessionUrl.toString())
})

export { oauthRouter }
