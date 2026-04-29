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
  nextPageInfo?: string
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
// CHECKOUT (Storefront API)
// ============================================================

export interface CheckoutCreateInput {
  variantId: string // Shopify GID
  quantity: number
  shippingCountry: string
}

export interface ShopifyCheckoutResult {
  checkoutUrl: string
  checkoutId: string
  totalPrice: string
  subtotalPrice: string
  totalTax: string
  currency: string
}

export async function createShopifyCheckout(
  shop: string,
  storefrontToken: string,
  input: CheckoutCreateInput
): Promise<ShopifyCheckoutResult> {
  const query = `
    mutation checkoutCreate($input: CheckoutCreateInput!) {
      checkoutCreate(input: $input) {
        checkout {
          id
          webUrl
          totalPriceV2 { amount currencyCode }
          subtotalPriceV2 { amount currencyCode }
          totalTaxV2 { amount currencyCode }
        }
        checkoutUserErrors {
          code field message
        }
      }
    }
  `

  const response = await fetch(
    `https://${shop}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            lineItems: [{ variantId: input.variantId, quantity: input.quantity }],
            shippingAddress: { country: input.shippingCountry },
          },
        },
      }),
    }
  )

  interface CheckoutData {
    data: {
      checkoutCreate: {
        checkout: {
          id: string
          webUrl: string
          totalPriceV2: { amount: string; currencyCode: string }
          subtotalPriceV2: { amount: string; currencyCode: string }
          totalTaxV2: { amount: string; currencyCode: string }
        }
        checkoutUserErrors: { code: string; field: string; message: string }[]
      }
    }
  }

  const data = (await response.json()) as CheckoutData
  const checkout = data.data.checkoutCreate.checkout

  return {
    checkoutId: checkout.id,
    checkoutUrl: checkout.webUrl,
    totalPrice: checkout.totalPriceV2.amount,
    subtotalPrice: checkout.subtotalPriceV2.amount,
    totalTax: checkout.totalTaxV2.amount,
    currency: checkout.totalPriceV2.currencyCode,
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
