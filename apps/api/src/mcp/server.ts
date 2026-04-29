import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '@cap/db'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
        price_max: {
          type: 'number',
          description: 'Maximum price in the specified currency',
        },
        price_min: {
          type: 'number',
          description: 'Minimum price in the specified currency',
        },
        currency: {
          type: 'string',
          enum: ['EUR', 'USD', 'GBP'],
          description: 'Currency for price filters',
        },
        shipping_country: {
          type: 'string',
          description: 'ISO 3166-1 alpha-2 country code for shipping availability (e.g. "FR", "US")',
        },
        certifications: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required certifications (e.g. ["OEKO-TEX", "GOTS", "B-Corp", "vegan"])',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (1-20, default: 5)',
        },
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
// MCP SERVER
// ============================================================

async function handleCommerceSearch(args: Record<string, unknown>) {
  const { query, price_max, price_min, certifications, limit = 5 } = args

  // Generate embedding
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
     ORDER BY 1 - (pe.embedding <=> '${embeddingStr}'::vector) DESC
     LIMIT ${Number(limit)}`,
    ...params
  )

  return results.map(r => ({
    id: r.id,
    title: r.raw_title,
    store: r.shopify_domain,
    price: r.price_min ? `${parseFloat(r.price_min)} ${r.currency}` : 'N/A',
    certifications: r.certifications?.join(', ') ?? 'None',
    specs: r.specs,
    in_stock: r.availability_in_stock,
    use_cases: r.use_cases?.join(', ') ?? '',
    geo_score: r.geo_score,
    checkout_url: `${process.env.SHOPIFY_APP_URL ?? 'https://api.commerceagent.io'}/v1/checkout/initiate`,
  }))
}

export async function startMcpServer() {
  const server = new Server(
    { name: 'commerce-agent-protocol', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      if (name === 'commerce_search') {
        const results = await handleCommerceSearch(args as Record<string, unknown>)
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        }
      }

      return {
        content: [{ type: 'text', text: `Tool ${name} not implemented yet in MCP mode.` }],
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.log('[MCP] Commerce Agent Protocol server running (stdio)')
}
