import crypto from 'node:crypto'
import { decodeCanonicalKey } from './secrets.js'

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? '2026-07'
const SHOPIFY_TIMEOUT_MS = Number(process.env.SHOPIFY_TIMEOUT_MS ?? 10_000)

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
      })
      if (response.status !== 429 && response.status < 500) return response
      if (attempt === attempts) return response
      const retryAfter = Number(response.headers.get('retry-after') ?? 0)
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1_000 : attempt * 500))
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Shopify request failed')
}

interface ShopifyGraphqlEnvelope<T> {
  data?: T
  errors?: Array<{ message: string }>
}

async function adminGraphql<T>(
  shop: string,
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetchWithRetry(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    },
  )
  const body = (await response.json().catch(() => ({}))) as ShopifyGraphqlEnvelope<T>
  if (!response.ok || body.errors?.length || !body.data) {
    throw new Error(
      body.errors?.map((error) => error.message).join('; ') ||
      `Shopify GraphQL HTTP ${response.status}: ${response.statusText}`,
    )
  }
  return body.data
}

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

  const expected = Buffer.from(digest)
  const received = Buffer.from(hmacHeader)
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

export function verifyShopifyOAuthHmac(params: Record<string, string>): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  const providedHmac = params['hmac']
  if (!secret || !providedHmac) return false

  const message = Object.entries(params)
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  const expectedHmac = crypto.createHmac('sha256', secret).update(message).digest('hex')
  const expected = Buffer.from(expectedHmac)
  const received = Buffer.from(providedHmac)
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
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
  })

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
}

export async function fetchShopConfiguration(shop: string, token: string): Promise<{
  name: string
  currency: string
  shippingCountries: string[]
}> {
  const data = await adminGraphql<{
    shop: { name: string; currencyCode: string; shipsToCountries: string[] }
  }>(
    shop,
    token,
    'query CapShopConfiguration { shop { name currencyCode shipsToCountries } }',
  )
  return {
    name: data.shop.name,
    currency: data.shop.currencyCode,
    shippingCountries: data.shop.shipsToCountries ?? [],
  }
}

export interface ShopifyOfflineTokenResult {
  accessToken: string
  refreshToken: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
  grantedScopes: string[]
}

function parseTokenResponse(data: {
  access_token: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  scope?: string
}): ShopifyOfflineTokenResult {
  const now = Date.now()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    accessTokenExpiresAt: data.expires_in ? new Date(now + data.expires_in * 1_000) : null,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? new Date(now + data.refresh_token_expires_in * 1_000)
      : null,
    grantedScopes: (data.scope ?? '').split(',').map((scope) => scope.trim()).filter(Boolean),
  }
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<ShopifyOfflineTokenResult> {
  const url = `https://${shop}/admin/oauth/access_token`
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? '',
    client_secret: process.env.SHOPIFY_API_SECRET ?? '',
    code,
    expiring: '1',
  })
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params,
  })

  if (!response.ok) {
    throw new Error(`Failed to exchange code: ${response.statusText}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    refresh_token_expires_in?: number
    scope?: string
  }
  return parseTokenResponse(data)
}

export async function refreshOfflineAccessToken(
  shop: string,
  refreshToken: string,
): Promise<ShopifyOfflineTokenResult> {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? '',
    client_secret: process.env.SHOPIFY_API_SECRET ?? '',
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const response = await fetchWithRetry(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params,
  })
  if (!response.ok) {
    throw new Error(`Failed to refresh Shopify token: ${response.status} ${response.statusText}`)
  }
  return parseTokenResponse(await response.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    refresh_token_expires_in?: number
    scope?: string
  })
}

export function validateGrantedScopes(grantedScopes: string[]): string[] {
  const requested = (process.env.SHOPIFY_SCOPES ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)
  const granted = new Set(grantedScopes)
  return requested.filter((scope) => !granted.has(scope))
}

// ============================================================
// PRODUCT FETCHING (Admin GraphQL API)
// ============================================================

export interface ShopifyVariant {
  id: number
  inventory_item_id: number | null
  title: string
  price: string
  sku: string | null
  inventory_quantity: number
  inventory_management: string | null
  inventory_policy: string
  inventory_levels: Array<{
    location_id: number
    location_name: string
    available: number
  }>
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
  currency: string
  metafields: Array<{ namespace: string; key: string; type: string; value: string }>
  shop_policies: Array<{ type: string; title: string; body: string; url: string }>
  shipping_countries: string[]
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
  const data = await adminGraphql<{
    shop: {
      currencyCode: string
      shipsToCountries?: string[]
      shopPolicies?: ShopifyGraphqlPolicy[]
    }
    products: {
      nodes: ShopifyGraphqlProduct[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    }
  }>(shop, token, PRODUCT_LIST_QUERY, { cursor: pageInfo ?? null })

  return {
    products: data.products.nodes.map((product) => mapGraphqlProduct(
      product,
      data.shop.currencyCode,
      data.shop.shopPolicies ?? [],
      data.shop.shipsToCountries ?? [],
    )),
    nextPageInfo: data.products.pageInfo.hasNextPage
      ? data.products.pageInfo.endCursor ?? undefined
      : undefined,
  }
}

export async function fetchShopifyProduct(
  shop: string,
  token: string,
  productId: string | number
): Promise<ShopifyProduct> {
  const gid = String(productId).startsWith('gid://')
    ? String(productId)
    : `gid://shopify/Product/${productId}`
  const data = await adminGraphql<{
    shop: {
      currencyCode: string
      shipsToCountries?: string[]
      shopPolicies?: ShopifyGraphqlPolicy[]
    }
    product: ShopifyGraphqlProduct | null
  }>(shop, token, PRODUCT_QUERY, { id: gid })
  if (!data.product) throw new Error(`Shopify product ${productId} not found`)
  return mapGraphqlProduct(
    data.product,
    data.shop.currencyCode,
    data.shop.shopPolicies ?? [],
    data.shop.shipsToCountries ?? [],
  )
}

interface ShopifyGraphqlPolicy {
  type: string
  title: string
  body: string
  url: string
}

interface ShopifyGraphqlProduct {
  id: string
  legacyResourceId: string
  title: string
  descriptionHtml: string
  vendor: string
  productType: string
  tags: string[]
  status: string
  createdAt: string
  updatedAt: string
  variants: {
    nodes: Array<{
      id: string
      legacyResourceId: string
      title: string
      price: string
      sku: string | null
      inventoryQuantity: number | null
      inventoryItem: {
        legacyResourceId: string
        tracked: boolean
      } | null
      selectedOptions: Array<{ name: string; value: string }>
      inventoryPolicy: string
    }>
  }
  media: {
    nodes: Array<{
      image: {
        id: string
        url: string
        altText: string | null
        width: number | null
        height: number | null
      } | null
    }>
  }
  metafields: {
    nodes: Array<{ namespace: string; key: string; type: string; value: string }>
  }
}

const PRODUCT_FIELDS = /* GraphQL */ `
  id legacyResourceId title descriptionHtml vendor productType tags status createdAt updatedAt
  variants(first: 250) {
    nodes {
      id legacyResourceId title price sku inventoryQuantity inventoryPolicy
      inventoryItem {
        legacyResourceId tracked
      }
      selectedOptions { name value }
    }
  }
  media(first: 50) {
    nodes { ... on MediaImage { image { id url altText width height } } }
  }
  metafields(first: 20, namespace: "cap") { nodes { namespace key type value } }
`

const PRODUCT_LIST_QUERY = /* GraphQL */ `
  query CapProducts($cursor: String) {
    shop { currencyCode shipsToCountries shopPolicies { type title body url } }
    products(first: 100, after: $cursor, sortKey: UPDATED_AT, query: "status:active") {
      nodes { ${PRODUCT_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const PRODUCT_QUERY = /* GraphQL */ `
  query CapProduct($id: ID!) {
    shop { currencyCode shipsToCountries shopPolicies { type title body url } }
    product(id: $id) { ${PRODUCT_FIELDS} }
  }
`

function numericId(gidOrId: string): number {
  return Number(gidOrId.split('/').pop())
}

export interface ShopifyInventorySnapshot {
  inventory_item_id: number
  variant_id: number
  inventory_quantity: number
  inventory_management: string | null
  inventory_policy: string
  inventory_levels: Array<{
    location_id: number
    location_name: string
    available: number
  }>
}

const INVENTORY_ITEM_QUERY = /* GraphQL */ `
  query CapInventoryItem($id: ID!) {
    inventoryItem(id: $id) {
      legacyResourceId tracked
      variants(first: 1) { nodes { legacyResourceId inventoryQuantity inventoryPolicy } }
      inventoryLevels(first: 250) {
        nodes {
          location { legacyResourceId name isActive }
          quantities(names: ["available"]) { name quantity }
        }
      }
    }
  }
`

export async function fetchShopifyInventorySnapshot(
  shop: string,
  token: string,
  inventoryItemId: string | number,
): Promise<ShopifyInventorySnapshot> {
  const gid = String(inventoryItemId).startsWith('gid://')
    ? String(inventoryItemId)
    : `gid://shopify/InventoryItem/${inventoryItemId}`
  const data = await adminGraphql<{
    inventoryItem: {
      legacyResourceId: string
      tracked: boolean
      variants: { nodes: Array<{
        legacyResourceId: string
        inventoryQuantity: number | null
        inventoryPolicy: string
      }> }
      inventoryLevels: {
        nodes: Array<{
          location: { legacyResourceId: string; name: string; isActive: boolean }
          quantities: Array<{ name: string; quantity: number }>
        }>
      }
    } | null
  }>(shop, token, INVENTORY_ITEM_QUERY, { id: gid })
  const variant = data.inventoryItem?.variants.nodes[0]
  if (!data.inventoryItem || !variant) {
    throw new Error(`Shopify inventory item ${inventoryItemId} has no product variant`)
  }
  const inventoryLevels = data.inventoryItem.inventoryLevels.nodes
    .filter((level) => level.location.isActive)
    .map((level) => ({
      location_id: Number(level.location.legacyResourceId),
      location_name: level.location.name,
      available: level.quantities.find((quantity) => quantity.name === 'available')?.quantity ?? 0,
    }))
  return {
    inventory_item_id: Number(data.inventoryItem.legacyResourceId),
    variant_id: Number(variant.legacyResourceId),
    inventory_quantity: inventoryLevels.reduce((total, level) => total + level.available, 0),
    inventory_management: data.inventoryItem.tracked ? 'shopify' : null,
    inventory_policy: variant.inventoryPolicy,
    inventory_levels: inventoryLevels,
  }
}

function mapGraphqlProduct(
  product: ShopifyGraphqlProduct,
  currency: string,
  shopPolicies: ShopifyGraphqlPolicy[],
  shippingCountries: string[],
): ShopifyProduct {
  return {
    id: Number(product.legacyResourceId || numericId(product.id)),
    title: product.title,
    body_html: product.descriptionHtml,
    vendor: product.vendor,
    product_type: product.productType,
    tags: product.tags.join(', '),
    status: product.status.toLowerCase(),
    variants: product.variants.nodes.map((variant) => ({
      id: Number(variant.legacyResourceId || numericId(variant.id)),
      inventory_item_id: variant.inventoryItem
        ? Number(variant.inventoryItem.legacyResourceId)
        : null,
      title: variant.title,
      price: variant.price,
      sku: variant.sku,
      inventory_quantity: variant.inventoryQuantity ?? 0,
      inventory_management: variant.inventoryItem?.tracked ? 'shopify' : null,
      inventory_policy: variant.inventoryPolicy,
      inventory_levels: [],
      option1: variant.selectedOptions[0]?.value ?? null,
      option2: variant.selectedOptions[1]?.value ?? null,
      option3: variant.selectedOptions[2]?.value ?? null,
      weight: 0,
      weight_unit: 'kg',
    })),
    images: product.media.nodes.flatMap((media) => media.image ? [{
      id: numericId(media.image.id),
      src: media.image.url,
      alt: media.image.altText,
      width: media.image.width ?? 0,
      height: media.image.height ?? 0,
    }] : []),
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    currency,
    metafields: product.metafields.nodes,
    shop_policies: shopPolicies,
    shipping_countries: shippingCountries,
  }
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
  const listed = await adminGraphql<{
    shop: { storefrontAccessTokens: { nodes: Array<{ accessToken: string; title: string }> } }
  }>(shop, adminToken, `query CapStorefrontTokens {
    shop { storefrontAccessTokens(first: 50) { nodes { accessToken title } } }
  }`)
  const existing = listed.shop.storefrontAccessTokens.nodes.find((token) => token.title === 'CAP')
  if (existing?.accessToken) return existing.accessToken

  const created = await adminGraphql<{
    storefrontAccessTokenCreate: {
      storefrontAccessToken: { accessToken: string } | null
      userErrors: Array<{ field: string[]; message: string }>
    }
  }>(shop, adminToken, `mutation CapStorefrontTokenCreate {
    storefrontAccessTokenCreate(input: { title: "CAP" }) {
      storefrontAccessToken { accessToken }
      userErrors { field message }
    }
  }`)
  const result = created.storefrontAccessTokenCreate
  if (!result.storefrontAccessToken) {
    throw new Error(result.userErrors.map((error) => error.message).join('; ') || 'Failed to create storefront access token')
  }
  return result.storefrontAccessToken.accessToken
}

// ============================================================
// WEBHOOK REGISTRATION
// ============================================================

export const CAP_WEBHOOK_TOPICS = [
  'PRODUCTS_CREATE',
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
  'INVENTORY_LEVELS_UPDATE',
  'ORDERS_CREATE',
  'ORDERS_PAID',
  'APP_UNINSTALLED',
] as const

export async function registerShopifyWebhooks(
  shop: string,
  adminToken: string,
): Promise<void> {
  const appUrl = process.env.SHOPIFY_APP_URL
  if (!appUrl) throw new Error('SHOPIFY_APP_URL is not set')

  const address = new URL('/webhooks/shopify', appUrl).toString()
  const listData = await adminGraphql<{
    webhookSubscriptions: { nodes: Array<{ topic: string; uri: string }> }
  }>(shop, adminToken, `query CapWebhookSubscriptions {
    webhookSubscriptions(first: 250) { nodes { topic uri } }
  }`)
  const existingTopics = new Set(
    listData.webhookSubscriptions.nodes
      .filter((webhook) => webhook.uri === address)
      .map((webhook) => webhook.topic),
  )

  for (const topic of CAP_WEBHOOK_TOPICS) {
    if (existingTopics.has(topic)) continue

    const created = await adminGraphql<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string } | null
        userErrors: Array<{ field: string[]; message: string }>
      }
    }>(shop, adminToken, `mutation CapWebhookCreate(
      $topic: WebhookSubscriptionTopic!
      $webhookSubscription: WebhookSubscriptionInput!
    ) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription { id }
        userErrors { field message }
      }
    }`, {
      topic,
      webhookSubscription: { uri: address, format: 'JSON' },
    })
    if (!created.webhookSubscriptionCreate.webhookSubscription) {
      throw new Error(created.webhookSubscriptionCreate.userErrors.map((error) => error.message).join('; ') || `Failed to register ${topic}`)
    }
  }
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
  trackingToken: string
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
 * Uses the versioned Storefront API `cartCreate` mutation, which replaces the
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
    lines: [{
      merchandiseId: variantGid,
      quantity: input.quantity,
      attributes: [{ key: '_cap_checkout_id', value: input.trackingToken }],
    }],
    attributes: [{ key: 'cap_checkout_id', value: input.trackingToken }],
  }

  const countryCode =
    input.buyerIdentity?.countryCode ?? input.shippingCountry
  if (countryCode || input.buyerIdentity?.email) {
    cartInput['buyerIdentity'] = {
      ...(input.buyerIdentity?.email && { email: input.buyerIdentity.email }),
      ...(countryCode && { countryCode: countryCode.toUpperCase() }),
    }
  }

  const response = await fetchWithRetry(
    `https://${shop}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({ query, variables: { input: cartInput } }),
    },
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
    // Shopify no longer exposes tax and duty estimates on Storefront carts.
    // The definitive amount is calculated on the hosted checkout.
    totalTax: null,
    currency: cart.cost.totalAmount.currencyCode,
  }
}

// ============================================================
// TOKEN ENCRYPTION (AES-256-GCM)
// ============================================================

const ALGORITHM = 'aes-256-gcm'
const CIPHERTEXT_VERSION = 'v2'

// v1 ciphertexts (no prefix) used the first 32 UTF-8 bytes of the key string,
// which only carries 128 bits of entropy for a hex key. They stay readable.
function legacyKey(raw: string): Buffer {
  const key = Buffer.from(raw, 'utf8')
  if (key.length < 32) throw new Error('ENCRYPTION_KEY must contain at least 32 bytes')
  return key.subarray(0, 32)
}

function deriveKey(raw: string): Buffer {
  return decodeCanonicalKey(raw) ?? legacyKey(raw)
}

// ENCRYPTION_KEY_PREVIOUS keeps tokens readable while the key is rotated;
// they are re-encrypted with the current key on the next refresh or install.
function decryptionKeys(versioned: boolean): Buffer[] {
  return [process.env.ENCRYPTION_KEY ?? '', process.env.ENCRYPTION_KEY_PREVIOUS]
    .filter((raw, index): raw is string => index === 0 || Boolean(raw))
    .map((raw) => versioned ? deriveKey(raw) : legacyKey(raw))
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey(process.env.ENCRYPTION_KEY ?? '')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: v2:iv:tag:encrypted (hex)
  return `${CIPHERTEXT_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(':')
  const versioned = parts[0] === CIPHERTEXT_VERSION
  const [ivHex, tagHex, encryptedHex] = versioned ? parts.slice(1) : parts
  if (parts.length !== (versioned ? 4 : 3) || !ivHex || !tagHex || !encryptedHex) {
    throw new Error('Invalid ciphertext format')
  }

  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  let lastError: unknown
  for (const key of decryptionKeys(versioned)) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)
      return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Token decryption failed')
}
