import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { searchRouter } from './routes/search.js'
import { compareRouter } from './routes/compare.js'
import { checkoutRouter } from './routes/checkout.js'
import { webhookRouter } from './routes/webhooks.js'
import { oauthRouter } from './routes/shopify/oauth.js'
import { checkReadiness, operationsRouter } from './routes/operations.js'
import { authMiddleware } from './middleware/auth.js'
import { assertRuntimeSecrets } from './lib/secrets.js'
import { registerGracefulShutdown } from './lib/shutdown.js'
import { catalogSyncQueue, deadLetterQueue, enrichmentQueue, maintenanceQueue } from './lib/queue.js'
import { redis } from './lib/redis.js'
import { prisma } from '@cap/db'
import type { CAPError } from '@cap/shared'

const app = new Hono()

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================

app.use('*', logger())
app.use('*', secureHeaders())
app.use('/v1/*', cors({
  // Browser calls are limited to these agent origins; server-to-server agent
  // calls are unaffected by CORS. (A literal '*' inside an array never matched.)
  origin: ['https://claude.ai', 'https://chatgpt.com', 'https://perplexity.ai'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-CAP-Key', 'Authorization', 'Idempotency-Key', 'X-Agent-ID'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Idempotent-Replayed'],
}))

// ============================================================
// PUBLIC ROUTES
// ============================================================

// Health check
app.get('/health', (c) => c.json({
  status: 'ok',
  version: '0.1.0',
  timestamp: new Date().toISOString(),
}))

// Readiness verifies required dependencies without exposing credentials.
app.get('/ready', async (c) => {
  const readiness = await checkReadiness()
  return c.json({
    status: readiness.ready ? 'ready' : 'not_ready',
    checks: readiness.checks,
    latency_ms: readiness.latencyMs,
    timestamp: new Date().toISOString(),
  }, readiness.ready ? 200 : 503)
})

// Operational surfaces use a dedicated token, never a merchant API key.
app.route('/internal/operations', operationsRouter)

// Shopify OAuth (no auth required)
app.route('/shopify', oauthRouter)

// Shopify Webhooks (HMAC-secured, no API key)
app.route('/webhooks', webhookRouter)

// OpenAPI spec (public)
app.get('/openapi.json', async (c) => {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Commerce Agent Protocol (CAP) API',
      version: '0.1.0',
      description:
        'Open protocol connecting e-commerce catalogs to AI shopping agents. Search, compare, and checkout through a unified interface.',
      license: {
        name: 'Apache-2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0',
      },
    },
    servers: [
      {
        url: process.env.SHOPIFY_APP_URL ?? 'https://api.cap-protocol.org',
        description: 'Production',
      },
    ],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-CAP-Key' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {},
              },
              required: ['code', 'message'],
            },
          },
        },
        Money: {
          type: 'object',
          required: ['amount', 'currency'],
          properties: {
            amount: { type: 'number' },
            currency: { type: 'string', pattern: '^[A-Z]{3}$' },
          },
        },
        SearchFilters: {
          type: 'object',
          properties: {
            price_max: { type: 'number' },
            price_min: { type: 'number' },
            currency: { type: 'string', pattern: '^[A-Za-z]{3}$' },
            certifications: { type: 'array', items: { type: 'string' } },
            in_stock: { type: 'boolean' },
            shipping_country: { type: 'string', minLength: 2, maxLength: 2 },
            category: { type: 'string' },
          },
        },
        ProductResult: {
          type: 'object',
          required: ['id', 'title', 'merchant', 'price', 'variants', 'availability'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            merchant: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                domain: { type: 'string' },
              },
            },
            price: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                currency: { type: 'string' },
                was: { type: 'number' },
              },
            },
            variants: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'title', 'price', 'available_quantity', 'in_stock'],
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  price: { $ref: '#/components/schemas/Money' },
                  available_quantity: { type: 'integer' },
                  in_stock: { type: 'boolean' },
                },
              },
            },
            specs: { type: 'object', additionalProperties: true },
            certifications: { type: 'array', items: { type: 'string' } },
            availability: {
              type: 'object',
              properties: {
                in_stock: { type: 'boolean' },
                shipping_estimate: { type: 'string' },
                free_shipping: { type: 'boolean' },
                return_days: { type: 'integer' },
                shipping_policy_url: { type: 'string', format: 'uri' },
                return_policy_url: { type: 'string', format: 'uri' },
                shipping_countries: {
                  type: 'array',
                  items: { type: 'string', minLength: 2, maxLength: 2 },
                },
              },
            },
            images: { type: 'array', items: { type: 'string' } },
            geo_score: { type: 'number' },
            checkout_url: { type: 'string', format: 'uri' },
            use_cases: { type: 'array', items: { type: 'string' } },
            target_audience: { type: 'array', items: { type: 'string' } },
            comparison: {
              type: 'object',
              properties: {
                similar_to: { type: 'array', items: { type: 'string' } },
                differentiators: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        SearchResponse: {
          type: 'object',
          required: ['results', 'total', 'search_id', 'latency_ms'],
          properties: {
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/ProductResult' },
            },
            total: { type: 'integer' },
            search_id: {
              type: 'string',
              description: 'Opaque session-style id (e.g. srch_xxxx)',
            },
            agent_query_id: {
              type: 'string',
              format: 'uuid',
              description:
                'Persisted analytics id; send as agent_session_id when initiating checkout',
            },
            latency_ms: { type: 'integer' },
          },
        },
      },
    },
    paths: {
      '/v1/search': {
        post: {
          summary: 'Search products',
          description:
            'Search for products using natural language query with optional filters.',
          parameters: [
            {
              name: 'X-Agent-ID',
              in: 'header',
              required: false,
              schema: { type: 'string' },
              description: 'Optional stable agent identity for analytics',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: { type: 'string', minLength: 1, maxLength: 500 },
                    filters: { $ref: '#/components/schemas/SearchFilters' },
                    limit: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 50,
                      default: 5,
                    },
                    sort: {
                      type: 'string',
                      enum: ['relevance', 'price_asc', 'price_desc', 'geo_score'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchResponse' },
                },
              },
            },
            '401': {
              description: 'Unauthorized',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/v1/compare': {
        post: {
          summary: 'Compare products',
          description:
            'Compare 2-10 products side-by-side on price, certifications, shipping, specs, return_policy. Returns a matrix and per-criterion winners.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['product_ids'],
                  properties: {
                    product_ids: {
                      type: 'array',
                      items: { type: 'string', format: 'uuid' },
                      minItems: 2,
                      maxItems: 10,
                    },
                    criteria: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: [
                          'price',
                          'certifications',
                          'shipping',
                          'specs',
                          'return_policy',
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Comparison matrix' },
            '404': { description: 'Not enough valid products' },
          },
        },
      },
      '/v1/checkout/initiate': {
        post: {
          summary: 'Initiate checkout',
          description:
            'Create a Shopify Cart for the given product / variant and return its checkoutUrl. The agent forwards the URL to the user (or follows it itself) to complete payment.',
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,255}$' },
              description:
                'Retrying with the same key and body replays the first response (Idempotent-Replayed: true) instead of creating a second cart',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['product_id'],
                  properties: {
                    product_id: { type: 'string', format: 'uuid' },
                    variant_id: { type: 'string' },
                    quantity: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 99,
                      default: 1,
                    },
                    shipping_country: {
                      type: 'string',
                      minLength: 2,
                      maxLength: 2,
                      default: 'FR',
                    },
                    agent_session_id: {
                      type: 'string',
                      format: 'uuid',
                      description: 'Optional AgentQuery id returned by /v1/search as agent_query_id',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Checkout created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      checkout_id: { type: 'string' },
                      checkout_url: { type: 'string', format: 'uri' },
                      cart_id: { type: 'string' },
                      amount: {
                        type: 'object',
                        properties: {
                          total: { type: 'number' },
                          subtotal: { type: 'number' },
                          tax: { type: ['number', 'null'] },
                          currency: { type: 'string' },
                        },
                      },
                      product: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          title: { type: 'string' },
                          variant_id: { type: 'string' },
                          quantity: { type: 'integer' },
                        },
                      },
                      agent_checkout_id: { type: 'string', format: 'uuid' },
                      expires_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid request body or Idempotency-Key' },
            '403': { description: 'API key not authorized for this merchant' },
            '404': { description: 'Product or variant not found' },
            '409': { description: 'Out of stock, same Idempotency-Key still in progress, or outcome of the first attempt unknown (retry with a new key)' },
            '422': { description: 'Shipping country not served, or Idempotency-Key reused with another body' },
            '502': { description: 'Shopify Storefront API error' },
            '503': { description: 'Storefront access token not provisioned' },
          },
        },
      },
    },
  }
  return c.json(spec)
})

// ============================================================
// PROTECTED ROUTES (require X-CAP-Key)
// ============================================================

app.use('/v1/*', authMiddleware)

app.route('/v1/search', searchRouter)
app.route('/v1/compare', compareRouter)
app.route('/v1/checkout', checkoutRouter)

// ============================================================
// ERROR HANDLING
// ============================================================

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json<CAPError>({
      error: { code: 'HTTP_ERROR', message: err.message },
    }, err.status)
  }

  console.error('[API] Unhandled error:', err)
  return c.json<CAPError>({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  }, 500)
})

app.notFound((c) => c.json<CAPError>({
  error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} not found` },
}, 404))

// ============================================================
// START SERVER
// ============================================================

const port = parseInt(process.env.PORT ?? process.env.API_PORT ?? '3000')

assertRuntimeSecrets(process.env, { mode: process.env.MCP_MODE === 'true' ? 'mcp' : 'http' })

// Only start HTTP server if not in MCP mode
if (process.env.MCP_MODE !== 'true') {
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║  🛒 Commerce Agent Protocol API           ║
║  Version: 0.1.0                            ║
║  Listening on http://localhost:${port}       ║
║  Env: ${process.env.NODE_ENV ?? 'development'}                       ║
╚═══════════════════════════════════════════╝
    `)
  })
  registerGracefulShutdown('api', [
    // Stop accepting connections and let in-flight requests finish.
    { name: 'http', close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) },
    {
      name: 'queues',
      close: () => Promise.all([
        enrichmentQueue.close(),
        catalogSyncQueue.close(),
        maintenanceQueue.close(),
        deadLetterQueue.close(),
      ]),
    },
    { name: 'redis', close: () => redis.quit() },
    { name: 'postgres', close: () => prisma.$disconnect() },
  ])
} else {
  // Prefer `pnpm --silent --filter @cap/api mcp`, which skips the HTTP stack.
  const { routeConsoleToStderr } = await import('./mcp/console.js')
  routeConsoleToStderr()
  const { startMcpServer } = await import('./mcp/server.js')
  await startMcpServer()
}

export default app
