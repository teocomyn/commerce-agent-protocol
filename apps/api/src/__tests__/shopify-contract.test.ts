import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAP_WEBHOOK_TOPICS,
  createShopifyCart,
  exchangeCodeForToken,
  fetchShopifyProducts,
  refreshOfflineAccessToken,
  registerShopifyWebhooks,
} from '../lib/shopify.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Shopify HTTP and GraphQL contracts', () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_KEY = 'client-id'
    process.env.SHOPIFY_API_SECRET = 'client-secret'
    process.env.SHOPIFY_APP_URL = 'https://api.example.test'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SHOPIFY_API_KEY
    delete process.env.SHOPIFY_API_SECRET
    delete process.env.SHOPIFY_APP_URL
  })

  it('requests and parses an expiring offline token', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      })
      const body = init?.body as URLSearchParams
      expect(body.get('client_id')).toBe('client-id')
      expect(body.get('client_secret')).toBe('client-secret')
      expect(body.get('code')).toBe('authorization-code')
      expect(body.get('expiring')).toBe('1')
      return jsonResponse({
        access_token: 'shpat_access',
        refresh_token: 'shprt_refresh',
        expires_in: 3600,
        refresh_token_expires_in: 7_776_000,
        scope: 'read_products,read_inventory',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const before = Date.now()
    const token = await exchangeCodeForToken('contract.myshopify.com', 'authorization-code')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://contract.myshopify.com/admin/oauth/access_token',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(token).toMatchObject({
      accessToken: 'shpat_access',
      refreshToken: 'shprt_refresh',
      grantedScopes: ['read_products', 'read_inventory'],
    })
    expect(token.accessTokenExpiresAt?.getTime()).toBeGreaterThanOrEqual(before + 3_600_000)
    expect(token.refreshTokenExpiresAt?.getTime()).toBeGreaterThanOrEqual(before + 7_776_000_000)
  })

  it('rotates an offline token with the one-time refresh grant', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as URLSearchParams
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('shprt_old')
      return jsonResponse({
        access_token: 'shpat_new',
        refresh_token: 'shprt_new',
        expires_in: 3600,
        refresh_token_expires_in: 7_776_000,
        scope: 'read_products,read_inventory',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const token = await refreshOfflineAccessToken('contract.myshopify.com', 'shprt_old')

    expect(token.accessToken).toBe('shpat_new')
    expect(token.refreshToken).toBe('shprt_new')
  })

  it('registers every missing lifecycle and commerce webhook exactly once', async () => {
    const createdTopics: string[] = []
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string
        variables?: { topic?: string; webhookSubscription?: { uri?: string; format?: string } }
      }
      if (request.query.includes('CapWebhookSubscriptions')) {
        return jsonResponse({
          data: {
            webhookSubscriptions: {
              nodes: [{ topic: 'PRODUCTS_CREATE', uri: 'https://api.example.test/webhooks/shopify' }],
            },
          },
        })
      }
      expect(request.query).toContain('webhookSubscriptionCreate')
      expect(request.variables?.webhookSubscription).toEqual({
        uri: 'https://api.example.test/webhooks/shopify',
        format: 'JSON',
      })
      createdTopics.push(request.variables?.topic ?? '')
      return jsonResponse({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: { id: `gid://shopify/WebhookSubscription/${createdTopics.length}` },
            userErrors: [],
          },
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await registerShopifyWebhooks('contract.myshopify.com', 'shpat_access')

    expect(createdTopics).toEqual(CAP_WEBHOOK_TOPICS.filter((topic) => topic !== 'PRODUCTS_CREATE'))
  })

  it('fails installation when a required webhook cannot be registered', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { query: string }
      if (request.query.includes('CapWebhookSubscriptions')) {
        return jsonResponse({ data: { webhookSubscriptions: { nodes: [] } } })
      }
      return jsonResponse({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: null,
            userErrors: [{ field: ['webhookSubscription'], message: 'Topic unavailable' }],
          },
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      registerShopifyWebhooks('contract.myshopify.com', 'shpat_access'),
    ).rejects.toThrow('Topic unavailable')
  })

  it('maps Admin GraphQL product, variant, inventory, and currency data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: {
        shop: { currencyCode: 'EUR' },
        products: {
          nodes: [{
            id: 'gid://shopify/Product/100',
            legacyResourceId: '100',
            title: 'Contract shoe',
            descriptionHtml: '<p>Test</p>',
            vendor: 'CAP',
            productType: 'Shoes',
            tags: ['contract'],
            status: 'ACTIVE',
            createdAt: '2026-08-01T00:00:00Z',
            updatedAt: '2026-08-02T00:00:00Z',
            variants: { nodes: [{
              id: 'gid://shopify/ProductVariant/101',
              legacyResourceId: '101',
              title: '42',
              price: '99.00',
              sku: 'CAP-42',
              inventoryQuantity: 3,
              inventoryPolicy: 'DENY',
              inventoryItem: { legacyResourceId: '9001', tracked: true },
              selectedOptions: [{ name: 'Size', value: '42' }],
            }] },
            media: { nodes: [] },
            metafields: { nodes: [] },
          }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })))

    const page = await fetchShopifyProducts('contract.myshopify.com', 'shpat_access')

    expect(page.products[0]).toMatchObject({
      id: 100,
      currency: 'EUR',
      status: 'active',
      variants: [{ id: 101, inventory_item_id: 9001, inventory_quantity: 3, price: '99.00' }],
    })
    expect(page.nextPageInfo).toBeUndefined()
  })

  it('transmits checkout tracking and buyer country through Storefront cartCreate', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        variables: { input: Record<string, unknown> }
      }
      expect(request.variables.input).toMatchObject({
        lines: [{
          merchandiseId: 'gid://shopify/ProductVariant/101',
          quantity: 2,
          attributes: [{ key: '_cap_checkout_id', value: 'track-123' }],
        }],
        attributes: [{ key: 'cap_checkout_id', value: 'track-123' }],
        buyerIdentity: { countryCode: 'FR' },
      })
      return jsonResponse({
        data: {
          cartCreate: {
            cart: {
              id: 'gid://shopify/Cart/1',
              checkoutUrl: 'https://contract.myshopify.com/checkouts/1',
              totalQuantity: 2,
              cost: {
                totalAmount: { amount: '198.00', currencyCode: 'EUR' },
                subtotalAmount: { amount: '198.00', currencyCode: 'EUR' },
              },
            },
            userErrors: [],
          },
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const cart = await createShopifyCart('contract.myshopify.com', 'storefront-token', {
      variantId: '101',
      quantity: 2,
      shippingCountry: 'fr',
      trackingToken: 'track-123',
    })

    expect(cart).toMatchObject({
      cartId: 'gid://shopify/Cart/1',
      totalAmount: '198.00',
      currency: 'EUR',
    })
  })
})
