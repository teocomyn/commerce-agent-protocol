import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { searchRouter } from './routes/search.js'
import { compareRouter } from './routes/compare.js'
import { webhookRouter } from './routes/webhooks.js'
import { oauthRouter } from './routes/shopify/oauth.js'
import { authMiddleware } from './middleware/auth.js'
import type { CAPError } from '@cap/shared'

const app = new Hono()

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================

app.use('*', logger())
app.use('*', secureHeaders())
app.use('/v1/*', cors({
  origin: ['https://claude.ai', 'https://chatgpt.com', 'https://perplexity.ai', '*'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-CAP-Key', 'Authorization'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
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
      description: 'Infrastructure middleware connecting e-commerce catalogs to AI shopping agents',
    },
    servers: [{ url: process.env.SHOPIFY_APP_URL ?? 'https://api.commerceagent.io', description: 'Production' }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-CAP-Key' },
      },
    },
    paths: {
      '/v1/search': {
        post: {
          summary: 'Search products',
          description: 'Search for products using natural language query with optional filters',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: { type: 'string', description: 'Natural language search query' },
                    filters: {
                      type: 'object',
                      properties: {
                        price_max: { type: 'number' },
                        price_min: { type: 'number' },
                        currency: { type: 'string', enum: ['EUR', 'USD', 'GBP'] },
                        certifications: { type: 'array', items: { type: 'string' } },
                        in_stock: { type: 'boolean' },
                        shipping_country: { type: 'string' },
                      },
                    },
                    limit: { type: 'integer', minimum: 1, maximum: 50, default: 5 },
                    sort: { type: 'string', enum: ['relevance', 'price_asc', 'price_desc', 'geo_score'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Search results' },
            '401': { description: 'Unauthorized' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/v1/compare': {
        post: {
          summary: 'Compare products',
          description: 'Compare multiple products side-by-side on specified criteria',
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

const port = parseInt(process.env.API_PORT ?? '3000')

// Only start HTTP server if not in MCP mode
if (process.env.MCP_MODE !== 'true') {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`
╔═══════════════════════════════════════════╗
║  🛒 Commerce Agent Protocol API           ║
║  Version: 0.1.0                            ║
║  Listening on http://localhost:${port}       ║
║  Env: ${process.env.NODE_ENV ?? 'development'}                       ║
╚═══════════════════════════════════════════╝
    `)
  })
} else {
  // Start MCP server
  const { startMcpServer } = await import('./mcp/server.js')
  await startMcpServer()
}

export default app
