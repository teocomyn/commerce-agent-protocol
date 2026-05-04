import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '@cap/db'
import OpenAI from 'openai'
import {
  createShopifyCart,
  decryptToken,
  ShopifyCartError,
} from '../lib/shopify.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// In MCP (stdio) mode, calls are not authenticated by an API key. The server
// is bound to a single merchant via the CAP_MERCHANT_ID environment variable
// (set when the merchant configures the connector in Claude / ChatGPT).
function getMcpMerchantId(): string {
  const id = process.env.CAP_MERCHANT_ID
  if (!id) {
    throw new Error(
      'CAP_MERCHANT_ID is not set. Set it in your MCP client configuration.',
    )
  }
  return id
}

// ============================================================
// MCP TOOL DEFINITIONS
// ============================================================

const TOOLS: Tool[] = [
  {
    name: 'commerce_search',
    description:
      'Search for products across connected e-commerce stores. Returns structured product data including price, specs, availability, certifications, and checkout links. Use this when a user wants to find or compare products.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language product search query (e.g. "white eco-friendly sneakers for men under €120")',
        },
        price_max: { type: 'number', description: 'Maximum price' },
        price_min: { type: 'number', description: 'Minimum price' },
        currency: {
          type: 'string',
          enum: ['EUR', 'USD', 'GBP'],
          description: 'Currency for price filters',
        },
        shipping_country: {
          type: 'string',
          description: 'ISO 3166-1 alpha-2 country code (e.g. "FR", "US")',
        },
        certifications: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required certifications (e.g. ["OEKO-TEX", "GOTS", "B-Corp", "vegan"])',
        },
        in_stock: {
          type: 'boolean',
          description: 'If true, only products with at least one variant with inventory > 0',
        },
        limit: { type: 'number', description: 'Number of results to return (1-20, default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'commerce_compare',
    description:
      'Compare multiple products side-by-side on price, certifications, shipping, and specifications. Returns a structured comparison matrix with winners per category.',
    inputSchema: {
      type: 'object',
      properties: {
        product_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of product IDs to compare (from commerce_search results)',
          minItems: 2,
          maxItems: 10,
        },
        criteria: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['price', 'certifications', 'shipping', 'specs', 'return_policy'],
          },
          description: 'Criteria to compare on',
        },
      },
      required: ['product_ids'],
    },
  },
  {
    name: 'commerce_checkout',
    description:
      'Initiate a checkout for a specific product. Returns a checkout URL that the user can open to complete the purchase.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'Product ID from commerce_search results',
        },
        variant_id: {
          type: 'string',
          description: 'Variant ID (size, color, etc.) if applicable',
        },
        quantity: {
          type: 'number',
          description: 'Quantity to purchase (default: 1)',
        },
        shipping_country: {
          type: 'string',
          description: 'ISO country code for shipping (default: FR)',
        },
      },
      required: ['product_id'],
    },
  },
]

// ============================================================
// TOOL HANDLERS
// ============================================================

async function handleCommerceSearch(args: Record<string, unknown>) {
  const merchantId = getMcpMerchantId()
  const { query, price_max, price_min, certifications, limit = 5, in_stock } = args

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: String(query),
    dimensions: 1536,
  })
  const embedding = embeddingResponse.data[0]?.embedding ?? []
  const embeddingStr = `[${embedding.join(',')}]`

  const conditions: string[] = ['pe.deleted_at IS NULL']
  const params: unknown[] = []
  let paramIdx = 1

  conditions.push(`pe.merchant_id = $${paramIdx}::uuid`)
  params.push(merchantId)
  paramIdx++

  if (price_max != null) {
    conditions.push(`pe.price_min <= $${paramIdx}`)
    params.push(price_max)
    paramIdx++
  }
  if (price_min != null) {
    conditions.push(`pe.price_max >= $${paramIdx}`)
    params.push(price_min)
    paramIdx++
  }
  if (Array.isArray(certifications) && certifications.length > 0) {
    conditions.push(`pe.certifications @> $${paramIdx}::text[]`)
    params.push(certifications)
    paramIdx++
  }

  if (in_stock === true) {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(pr.variants::jsonb) v
        WHERE COALESCE((v->>'inventory_quantity')::int, 0) > 0
      )`)
  }
  if (in_stock === false) {
    conditions.push(`
      NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(pr.variants::jsonb) v
        WHERE COALESCE((v->>'inventory_quantity')::int, 0) > 0
      )`)
  }

  const embeddingParamIdx = paramIdx
  params.push(embeddingStr)
  paramIdx++

  const limitParamIdx = paramIdx
  params.push(Number(limit))
  paramIdx++

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  interface ProductRow {
    id: string
    raw_title: string
    price_min: string | null
    currency: string
    certifications: string[]
    specs: Record<string, unknown>
    geo_score: number
    shopify_domain: string
    use_cases: string[]
    availability_in_stock: boolean
  }

  const results = await prisma.$queryRawUnsafe<ProductRow[]>(
    `SELECT pe.id, pr.title as raw_title, pe.price_min, pe.currency,
            pe.certifications, pe.specs, pe.geo_score, m.shopify_domain,
            pe.use_cases,
            (EXISTS (SELECT 1 FROM products_raw pr2
                     JOIN jsonb_array_elements(pr2.variants::jsonb) v ON TRUE
                     WHERE pr2.id = pe.product_raw_id
                     AND (v->>'inventory_quantity')::int > 0)) as availability_in_stock
     FROM products_enriched pe
     JOIN products_raw pr ON pr.id = pe.product_raw_id
     JOIN merchants m ON m.id = pe.merchant_id
     ${whereClause}
     ORDER BY 1 - (pe.embedding <=> $${embeddingParamIdx}::vector) DESC
     LIMIT $${limitParamIdx}`,
    ...params,
  )

  const checkoutBase = process.env.SHOPIFY_APP_URL ?? 'https://api.commerceagent.io'

  return results.map((r) => ({
    id: r.id,
    title: r.raw_title,
    store: r.shopify_domain,
    price: r.price_min ? `${parseFloat(r.price_min)} ${r.currency}` : 'N/A',
    certifications: r.certifications?.join(', ') ?? 'None',
    specs: r.specs,
    in_stock: r.availability_in_stock,
    use_cases: r.use_cases?.join(', ') ?? '',
    geo_score: r.geo_score,
    checkout_url: `${checkoutBase}/v1/checkout/initiate`,
  }))
}

async function handleCommerceCompare(args: Record<string, unknown>) {
  const merchantId = getMcpMerchantId()
  const productIds = Array.isArray(args['product_ids']) ? (args['product_ids'] as string[]) : []
  const criteria = Array.isArray(args['criteria'])
    ? (args['criteria'] as string[])
    : ['price', 'certifications', 'shipping', 'specs']

  if (productIds.length < 2) {
    throw new Error('commerce_compare requires at least 2 product_ids')
  }

  interface CompareRow {
    id: string
    price_min: string | null
    currency: string
    certifications: string[]
    specs: Record<string, unknown>
    geo_score: number
    return_policy: { days?: number } | null
    shipping_info: { estimate?: string; free?: boolean } | null
    raw_title: string
  }

  const products = await prisma.$queryRawUnsafe<CompareRow[]>(
    `SELECT pe.id, pe.price_min, pe.currency, pe.certifications,
            pe.specs, pe.geo_score, pe.return_policy, pe.shipping_info,
            pr.title as raw_title
     FROM products_enriched pe
     JOIN products_raw pr ON pr.id = pe.product_raw_id
     WHERE pe.id = ANY($1::uuid[])
       AND pe.merchant_id = $2::uuid
       AND pe.deleted_at IS NULL`,
    productIds,
    merchantId,
  )

  if (products.length < 2) {
    throw new Error('At least 2 valid products are required for comparison')
  }

  const matrix: Record<string, Record<string, unknown>> = {}

  if (criteria.includes('price')) {
    matrix['price'] = Object.fromEntries(
      products.map((p) => [p.id, p.price_min ? parseFloat(p.price_min) : null]),
    )
  }
  if (criteria.includes('certifications')) {
    matrix['certifications'] = Object.fromEntries(
      products.map((p) => [p.id, p.certifications ?? []]),
    )
  }
  if (criteria.includes('shipping')) {
    matrix['shipping_estimate'] = Object.fromEntries(
      products.map((p) => [p.id, p.shipping_info?.estimate ?? 'unknown']),
    )
    matrix['free_shipping'] = Object.fromEntries(
      products.map((p) => [p.id, p.shipping_info?.free ?? false]),
    )
  }
  if (criteria.includes('specs')) {
    const allKeys = new Set<string>()
    products.forEach((p) => Object.keys(p.specs ?? {}).forEach((k) => allKeys.add(k)))
    for (const key of allKeys) {
      matrix[`spec_${key}`] = Object.fromEntries(
        products.map((p) => [p.id, p.specs?.[key] ?? null]),
      )
    }
  }
  if (criteria.includes('return_policy')) {
    matrix['return_days'] = Object.fromEntries(
      products.map((p) => [p.id, p.return_policy?.days ?? null]),
    )
  }

  const priceRow = matrix['price']
  const winnerByPrice = priceRow
    ? products.reduce((min, p) => {
        const a = priceRow[p.id] as number | null
        const b = priceRow[min.id] as number | null
        if (a == null) return min
        if (b == null) return p
        return a < b ? p : min
      }).id
    : undefined

  const certRow = matrix['certifications']
  const winnerByEco = certRow
    ? products.reduce((best, p) => {
        const count = (certRow[p.id] as string[])?.length ?? 0
        const bestCount = (certRow[best.id] as string[])?.length ?? 0
        return count > bestCount ? p : best
      }).id
    : undefined

  return {
    winner_by_price: winnerByPrice,
    winner_by_eco: winnerByEco,
    products: products.map((p) => ({ id: p.id, title: p.raw_title })),
    matrix,
  }
}

async function handleCommerceCheckout(args: Record<string, unknown>) {
  const merchantId = getMcpMerchantId()
  const productId = String(args['product_id'] ?? '')
  const variantId = args['variant_id'] != null ? String(args['variant_id']) : undefined
  const quantity = Number(args['quantity'] ?? 1)
  const shippingCountry = args['shipping_country']
    ? String(args['shipping_country']).toUpperCase()
    : 'FR'

  if (!productId) throw new Error('product_id is required')
  if (!Number.isFinite(quantity) || quantity < 1) throw new Error('quantity must be ≥ 1')

  const product = await prisma.productEnriched.findFirst({
    where: { id: productId, merchantId, deletedAt: null },
    include: {
      productRaw: true,
      merchant: {
        select: { shopifyDomain: true, storefrontToken: true },
      },
    },
  })

  if (!product) throw new Error(`Product ${productId} not found for this merchant`)
  if (!product.merchant.storefrontToken) {
    throw new Error(
      'Storefront token not provisioned for this merchant. Re-install the CAP app.',
    )
  }

  type ShopifyVariantLite = {
    id: number
    inventory_quantity?: number
  }
  const variants = Array.isArray(product.productRaw.variants)
    ? (product.productRaw.variants as unknown as ShopifyVariantLite[])
    : []

  const chosen = variantId
    ? variants.find((v) => String(v.id) === variantId)
    : variants.find((v) => (v.inventory_quantity ?? 0) >= quantity) ?? variants[0]

  if (!chosen) throw new Error(`Variant not found for product ${productId}`)
  if ((chosen.inventory_quantity ?? 0) < quantity) {
    throw new Error(
      `Variant ${chosen.id} has only ${chosen.inventory_quantity ?? 0} units in stock`,
    )
  }

  const storefrontToken = decryptToken(product.merchant.storefrontToken)
  let cart
  try {
    cart = await createShopifyCart(product.merchant.shopifyDomain, storefrontToken, {
      variantId: String(chosen.id),
      quantity,
      shippingCountry,
    })
  } catch (err) {
    if (err instanceof ShopifyCartError) {
      throw new Error(`Cart creation failed: ${err.message}`)
    }
    throw err
  }

  const totalAmount = parseFloat(cart.totalAmount)
  const agentCheckout = await prisma.agentCheckout.create({
    data: {
      merchantId,
      productId: product.id,
      shopifyCheckoutId: cart.cartId,
      status: 'pending',
      amount: Number.isFinite(totalAmount) ? totalAmount : null,
      currency: cart.currency,
    },
  })

  return {
    checkout_url: cart.checkoutUrl,
    cart_id: cart.cartId,
    agent_checkout_id: agentCheckout.id,
    amount: {
      total: totalAmount,
      subtotal: parseFloat(cart.subtotalAmount),
      tax: cart.totalTax != null ? parseFloat(cart.totalTax) : null,
      currency: cart.currency,
    },
    product: {
      id: product.id,
      title: product.productRaw.title,
      variant_id: String(chosen.id),
      quantity,
    },
  }
}

// ============================================================
// MCP SERVER
// ============================================================

export async function startMcpServer() {
  const server = new Server(
    { name: 'commerce-agent-protocol', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const safeArgs = (args ?? {}) as Record<string, unknown>

    try {
      switch (name) {
        case 'commerce_search': {
          const result = await handleCommerceSearch(safeArgs)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
        case 'commerce_compare': {
          const result = await handleCommerceCompare(safeArgs)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
        case 'commerce_checkout': {
          const result = await handleCommerceCheckout(safeArgs)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          }
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.log('[MCP] Commerce Agent Protocol server running (stdio)')
}
