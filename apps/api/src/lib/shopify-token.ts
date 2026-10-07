import crypto from 'node:crypto'
import { prisma } from '@cap/db'
import { redis } from './redis.js'
import {
  decryptToken,
  encryptToken,
  refreshOfflineAccessToken,
  validateGrantedScopes,
} from './shopify.js'

const REFRESH_EARLY_MS = 5 * 60 * 1_000

/**
 * Jobs can outlive an install (uninstall, or shop/redact deleting the shop).
 * Workers skip them instead of failing, so they are not retried for nothing
 * and do not land in the dead-letter queue.
 */
export async function isMerchantInstallActive(merchantId: string): Promise<boolean> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { uninstalledAt: true, shopifyToken: true },
  })
  return Boolean(merchant && !merchant.uninstalledAt && merchant.shopifyToken)
}

export async function getValidShopifyAdminToken(merchantId: string): Promise<string> {
  for (let pass = 0; pass < 2; pass++) {
    const merchant = await prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: {
        shopifyDomain: true,
        shopifyToken: true,
        shopifyRefreshToken: true,
        accessTokenExpiresAt: true,
        uninstalledAt: true,
      },
    })
    if (merchant.uninstalledAt || !merchant.shopifyToken) {
      throw new Error('Shopify installation is inactive')
    }
    if (
      !merchant.accessTokenExpiresAt ||
      merchant.accessTokenExpiresAt.getTime() > Date.now() + REFRESH_EARLY_MS
    ) {
      return decryptToken(merchant.shopifyToken)
    }
    if (!merchant.shopifyRefreshToken) {
      throw new Error('Shopify offline token expired and no refresh token is available')
    }

    const lockKey = `lock:shopify-token:${merchantId}`
    const lockValue = crypto.randomUUID()
    const acquired = await redis.set(lockKey, lockValue, 'PX', 30_000, 'NX')
    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      continue
    }

    try {
      const refreshed = await refreshOfflineAccessToken(
        merchant.shopifyDomain,
        decryptToken(merchant.shopifyRefreshToken),
      )
      const missingScopes = validateGrantedScopes(refreshed.grantedScopes)
      if (missingScopes.length > 0) {
        await prisma.merchant.update({
          where: { id: merchantId },
          data: {
            shopifyToken: null,
            shopifyRefreshToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            grantedScopes: refreshed.grantedScopes,
          },
        })
        throw new Error(
          `Shopify authorization lost required scopes: ${missingScopes.join(', ')}. Reinstall the app.`,
        )
      }
      await prisma.merchant.update({
        where: { id: merchantId },
        data: {
          shopifyToken: encryptToken(refreshed.accessToken),
          shopifyRefreshToken: refreshed.refreshToken
            ? encryptToken(refreshed.refreshToken)
            : merchant.shopifyRefreshToken,
          accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
          refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
          grantedScopes: refreshed.grantedScopes,
        },
      })
      return refreshed.accessToken
    } finally {
      await redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        lockKey,
        lockValue,
      ).catch(() => undefined)
    }
  }
  throw new Error('Shopify token refresh is already in progress; retry shortly')
}
