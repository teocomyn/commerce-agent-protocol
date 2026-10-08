import { Hono } from 'hono'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createCommerceMcpServer } from '../mcp/server.js'

// Remote MCP (Streamable HTTP), mounted behind the API key middleware: the
// key decides the merchant, exactly as for the REST endpoints. Stateless: each
// request gets its own server and transport, so no session has to be shared
// between API instances, and responses are plain JSON (no SSE stream).
const mcpRouter = new Hono()

mcpRouter.all('/', async (c) => {
  const auth = c.get('auth')
  const userAgent = c.req.header('User-Agent')?.slice(0, 100)
  const server = createCommerceMcpServer((mcp) => ({
    merchantId: auth.merchantId,
    // Stateless requests rarely carry the initialize handshake: fall back to
    // the User-Agent for analytics.
    clientName: mcp.getClientVersion()?.name ?? userAgent,
  }))
  // No sessionIdGenerator: stateless mode.
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  try {
    return await transport.handleRequest(c.req.raw)
  } finally {
    await server.close()
  }
})

export { mcpRouter }
