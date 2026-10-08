import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '@cap/db'
import { registerGracefulShutdown } from '../lib/shutdown.js'
import { COMMERCE_TOOLS, callCommerceTool, toToolResult } from './tools.js'

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
// MCP SERVER
// ============================================================

export async function startMcpServer() {
  const server = new Server(
    { name: 'commerce-agent-protocol', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: COMMERCE_TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return toToolResult(await callCommerceTool(request.params.name, request.params.arguments, {
        merchantId: getMcpMerchantId(),
        clientName: server.getClientVersion()?.name,
      }))
    } catch (error) {
      // Infrastructure failures (database, OpenAI): same envelope as REST,
      // without internal details.
      console.error('[MCP] Tool failed:', error)
      return toToolResult({
        status: 500,
        body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      })
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[MCP] Commerce Agent Protocol server running (stdio)')
  return server
}

/**
 * Serves MCP over stdio until the client goes away. The SDK transport does not
 * watch stdin EOF, and the open Postgres pool would keep an orphaned process
 * alive after every client restart, so EOF and signals both drain and exit.
 */
export async function runMcpOverStdio(): Promise<void> {
  // Every tool needs the merchant: fail the spawn with the configuration
  // error instead of listing tools that all fail when called.
  getMcpMerchantId()
  const server = await startMcpServer()
  const shutdown = registerGracefulShutdown('mcp', [
    { name: 'mcp', close: () => server.close() },
    { name: 'postgres', close: () => prisma.$disconnect() },
  ])
  process.stdin.once('end', () => shutdown('client closed stdin'))
}
