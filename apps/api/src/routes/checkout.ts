import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { prisma } from '@cap/db'
import {
  CheckoutInitiateSchema,
  type CAPError,
} from '@cap/shared'
import {
  createShopifyCart,
  decryptToken,
  ShopifyCartError,
} from '../lib/shopify.js'

const checkoutRouter = new Hono()

interface CheckoutInitiateResponse {
  checkout_id: string
  checkout_url: string
  cart_id: string
  amount: {
    total: number
    subtotal: number
    tax: number | null
    currency: string
  }
  product: {
    id: string
    title: string
    variant_id: string
    quantity: number
  }
  agent_checkout_id: string
  expires_at: string
}

// POST /v1/checkout/initiate
checkoutRouter.post('/initiate', zValidator('json', CheckoutInitiateSchema), async (c) => {
  const auth = c.get('auth')
  const body = c.req.valid('json')
  const { product_id, variant_id, quantity, shipping_country, agent_session_id } = body

  // 1. Fetch the enriched product joined with the raw product (for variants) and merchant (for tokens)
  const product = await prisma.productEnriched.findUnique({
    where: { id: product_id },
    include: {
      productRaw: true,
      merchant: {
        select: {
          id: true,
          shopifyDomain: true,
          storefrontToken: true,
        },
      },
    },
  })

  if (!product || product.deletedAt) {
    return c.json<CAPError>({
      error: { code: 'PRODUCT_NOT_FOUND', message: `Product ${product_id} not found` },
    }, 404)
  }

  // 2. Multi-tenant guard: an API key must belong to the merchant who owns the product.
  // (Until we ship a dedicated "agent platform" key model.)
  if (product.merchantId !== auth.merchantId) {
    return c.json<CAPError>({
      error: {
        code: 'FORBIDDEN',
        message: 'API key is not authorized for this merchant',
      },
    }, 403)
  }

  if (!product.merchant.storefrontToken) {
    return c.json<CAPError>({
      error: {
        code: 'STOREFRONT_NOT_PROVISIONED',
        message:
          'Merchant has no Storefront access token. Re-install the CAP app to enable checkout.',
      },
    }, 503)
  }

  // 3. Resolve the variant to charge.
  // Shopify variants live on ProductRaw.variants (JSONB). Pick the requested variant
  // or the first available variant in stock.
  type ShopifyVariantLite = {
    id: number
    title?: string
    inventory_quantity?: number
    price?: string
  }
  const variants = Array.isArray(product.productRaw.variants)
    ? (product.productRaw.variants as unknown as ShopifyVariantLite[])
    : []

  let chosenVariant: ShopifyVariantLite | undefined
  if (variant_id) {
    const wanted = variant_id.startsWith('gid://')
      ? variant_id.split('/').pop()
      : variant_id
    chosenVariant = variants.find((v) => String(v.id) === String(wanted))
  } else {
    chosenVariant =
      variants.find((v) => (v.inventory_quantity ?? 0) >= quantity) ??
      variants[0]
  }

  if (!chosenVariant) {
    return c.json<CAPError>({
      error: {
        code: 'VARIANT_NOT_FOUND',
        message: variant_id
          ? `Variant ${variant_id} not found for product ${product_id}`
          : `Product ${product_id} has no available variants`,
      },
    }, 404)
  }

  if ((chosenVariant.inventory_quantity ?? 0) < quantity) {
    return c.json<CAPError>({
      error: {
        code: 'OUT_OF_STOCK',
        message: `Variant ${chosenVariant.id} has only ${chosenVariant.inventory_quantity ?? 0} units in stock`,
      },
    }, 409)
  }

  // 4. Create the Shopify Cart (replaces deprecated checkoutCreate)
  const storefrontToken = decryptToken(product.merchant.storefrontToken)
  let cart
  try {
    cart = await createShopifyCart(product.merchant.shopifyDomain, storefrontToken, {
      variantId: String(chosenVariant.id),
      quantity,
      shippingCountry: shipping_country,
    })
  } catch (err) {
    const userErrors =
      err instanceof ShopifyCartError ? err.userErrors : undefined
    return c.json<CAPError>({
      error: {
        code: 'CHECKOUT_FAILED',
        message:
          err instanceof Error ? err.message : 'Failed to create Shopify cart',
        details: userErrors,
      },
    }, 502)
  }

  let resolvedAgentQueryId: string | null = null
  if (agent_session_id) {
    const aq = await prisma.agentQuery.findFirst({
      where: {
        id: agent_session_id,
        merchantId: product.merchantId,
      },
      select: { id: true },
    })
    resolvedAgentQueryId = aq?.id ?? null
  }

  // 5. Persist the AgentCheckout record so we can reconcile with orders/create webhooks
  const totalAmount = parseFloat(cart.totalAmount)
  const agentCheckout = await prisma.agentCheckout.create({
    data: {
      merchantId: product.merchantId,
      productId: product.id,
      shopifyCheckoutId: cart.cartId,
      status: 'pending',
      amount: Number.isFinite(totalAmount) ? totalAmount : null,
      currency: cart.currency,
      agentQueryId: resolvedAgentQueryId,
    },
  })

  const response: CheckoutInitiateResponse = {
    checkout_id: cart.cartId,
    checkout_url: cart.checkoutUrl,
    cart_id: cart.cartId,
    amount: {
      total: parseFloat(cart.totalAmount),
      subtotal: parseFloat(cart.subtotalAmount),
      tax: cart.totalTax != null ? parseFloat(cart.totalTax) : null,
      currency: cart.currency,
    },
    product: {
      id: product.id,
      title: product.productRaw.title,
      variant_id: String(chosenVariant.id),
      quantity,
    },
    agent_checkout_id: agentCheckout.id,
    // Shopify carts have a 10-day idle TTL; surface a conservative 24h window.
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  return c.json(response)
})

export { checkoutRouter }
