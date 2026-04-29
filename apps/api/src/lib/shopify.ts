import crypto from 'node:crypto'

const SHOPIFY_API_VERSION = '2024-10'

// ============================================================
// HMAC VERIFICATION
// ============================================================

export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | undefined): boolean {
  if (!hmacHeader) return false
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) throw new Error('SHOPIFY_API_SECRET is not set')

  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64')

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
}

// ============================================================
// OAUTH HELPERS
// ============================================================

export function buildInstallUrl(shop: string, state: string): string {
  const apiKey = process.env.SHOPIFY_API_KEY
  const scopes = process.env.SHOPIFY_SCOPES
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/shopify/callback`

  const params = new URLSearchParams({
    client_id: apiKey ?? '',
    scope: scopes ?? '',
    redirect_uri: redirectUri,
    state,
    'grant_options[]': 'per-user',
  })

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<string> {
  const url = `https://${shop}/admin/oauth/access_token`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to exchange code: ${response.statusText}`)
  }

  const data = (await response.json()) as { access_token: string }
  return data.access_token
}

// ============================================================
// PRODUCT FETCHING (Admin REST API)
// ============================================================

export interface ShopifyVariant {
  id: number
  title: string
  price: string
  sku: string | null
  inventory_quantity: number
  inventory_management: string | null
  option1: string | null
  option2: string | null
  option3: string | null
  weight: number
  weight_unit: string
}

export interface ShopifyImage {
  id: number
  src: string
  alt: string | null
  width: number
  height: number
}

export interface ShopifyProduct {
  id: number
  title: string
  body_html: string | null
  vendor: string
  product_type: string
  tags: string
  status: string
  variants: ShopifyVariant[]
  images: ShopifyImage[]
  created_at: string
  updated_at: string
}

export interface ShopifyProductsPage {
  products: ShopifyProduct[]
  nextPageInfo?: string | undefined
}

export async function fetchShopifyProducts(
  shop: string,
  token: string,
  pageInfo?: string
): Promise<ShopifyProductsPage> {
  const params = new URLSearchParams({
    limit: '250',
    fields: 'id,title,body_html,vendor,product_type,tags,status,variants,images,created_at,updated_at',
  })

  if (pageInfo) {
    params.set('page_info', pageInfo)
  }

  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as { products: ShopifyProduct[] }

  // Extract pagination cursor from Link header
  const linkHeader = response.headers.get('Link')
  let nextPageInfo: string | undefined

  if (linkHeader) {
    const match = linkHeader.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    if (match?.[1]) {
      nextPageInfo = match[1]
    }
  }

  return { products: data.products, nextPageInfo }
}

export async function fetchShopifyProduct(
  shop: string,
  token: string,
  productId: string | number
): Promise<ShopifyProduct> {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Shopify product fetch error: ${response.status}`)
  }

  const data = (await response.json()) as { product: ShopifyProduct }
  return data.product
}

// ============================================================
// STOREFRONT ACCESS TOKEN (Admin API)
// ============================================================
// The Cart API requires a Storefront Access Token. We provision one per merchant
// during the OAuth callback using the Admin API.

export async function ensureStorefrontAccessToken(
  shop: string,
  adminToken: string
): Promise<string> {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/storefront_access_tokens.json`

  // Try to reuse an existing CAP token
  const listRes = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': adminToken,
      'Content-Type': 'application/json',
    },
  })

  if (listRes.ok) {
    const listData = (await listRes.json()) as {
      storefront_access_tokens?: Array<{ access_token: string; title: string }>
    }
    const existing = listData.storefront_access_tokens?.find(
      (t) => t.title === 'CAP'
    )
    if (existing?.access_token) return existing.access_token
  }

  // Otherwise create a new one
  const createRes = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': adminToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      storefront_access_token: { title: 'CAP' },
    }),
  })

  if (!createRes.ok) {
    throw new Error(
      `Failed to create storefront access token: ${createRes.status} ${createRes.statusText}`
    )
  }

  const createData = (await createRes.json()) as {
    storefront_access_token: { access_token: string }
  }
  return createData.storefront_access_token.access_token
}

// ============================================================
// CART API (Storefront GraphQL — replaces deprecated checkoutCreate)
// ============================================================

export interface CartCreateInput {
  variantId: string // Shopify GID, e.g. "gid://shopify/ProductVariant/123"
  quantity: number
  shippingCountry?: string
  buyerIdentity?: {
    email?: string
    countryCode?: string
  }
}

export interface ShopifyCartResult {
  cartId: string
  checkoutUrl: string
  totalAmount: string
  subtotalAmount: string
  totalTax: string | null
  currency: string
}

export interface ShopifyCartUserError {
  code?: string
  field?: string[]
  message: string
}

export class ShopifyCartError extends Error {
  constructor(
    message: string,
    public readonly userErrors: ShopifyCartUserError[] = []
  ) {
    super(message)
    this.name = 'ShopifyCartError'
  }
}

/**
 * Create a Shopify Cart and return its checkoutUrl.
 *
 * Uses the Storefront API `cartCreate` mutation (2024-10), which replaces the
 * deprecated `checkoutCreate` mutation. The returned `checkoutUrl` is the URL
 * the agent (or the user) opens to complete payment.
 *
 * @see https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate
 */
export async function createShopifyCart(
  shop: string,
  storefrontToken: string,
  input: CartCreateInput
): Promise<ShopifyCartResult> {
  const query = /* GraphQL */ `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount { amount currencyCode }
            subtotalAmount { amount currencyCode }
            totalTaxAmount { amount currencyCode }
          }
        }
        userErrors { code field message }
      }
    }
  `

  const variantGid = input.variantId.startsWith('gid://')
    ? input.variantId
    : `gid://shopify/ProductVariant/${input.variantId}`

  const cartInput: Record<string, unknown> = {
    lines: [{ merchandiseId: variantGid, quantity: input.quantity }],
  }

  const countryCode =
    input.buyerIdentity?.countryCode ?? input.shippingCountry
  if (countryCode || input.buyerIdentity?.email) {
    cartInput['buyerIdentity'] = {
      ...(input.buyerIdentity?.email && { email: input.buyerIdentity.email }),
      ...(countryCode && { countryCode: countryCode.toUpperCase() }),
    }
  }

  const response = await fetch(
    `https://${shop}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({ query, variables: { input: cartInput } }),
    }
  )

  if (!response.ok) {
    throw new ShopifyCartError(
      `Storefront API HTTP ${response.status}: ${response.statusText}`
    )
  }

  interface CartCreateData {
    data?: {
      cartCreate?: {
        cart: {
          id: string
          checkoutUrl: string
          totalQuantity: number
          cost: {
            totalAmount: { amount: string; currencyCode: string }
            subtotalAmount: { amount: string; currencyCode: string }
            totalTaxAmount: { amount: string; currencyCode: string } | null
          }
        } | null
        userErrors: ShopifyCartUserError[]
      }
    }
    errors?: Array<{ message: string }>
  }

  const data = (await response.json()) as CartCreateData

  if (data.errors?.length) {
    throw new ShopifyCartError(
      `Storefront GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`
    )
  }

  const userErrors = data.data?.cartCreate?.userErrors ?? []
  const cart = data.data?.cartCreate?.cart

  if (!cart) {
    throw new ShopifyCartError(
      userErrors[0]?.message ?? 'Cart creation failed',
      userErrors
    )
  }

  return {
    cartId: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalAmount: cart.cost.totalAmount.amount,
    subtotalAmount: cart.cost.subtotalAmount.amount,
    totalTax: cart.cost.totalTaxAmount?.amount ?? null,
    currency: cart.cost.totalAmount.currencyCode,
  }
}

// ============================================================
// TOKEN ENCRYPTION (AES-256-GCM)
// ============================================================

const ALGORITHM = 'aes-256-gcm'

export function encryptToken(plaintext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'utf8').slice(0, 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:encrypted (hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptToken(ciphertext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'utf8').slice(0, 32)
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid ciphertext format')

  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}
