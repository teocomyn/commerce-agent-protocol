// Dedicated stdio entrypoint: loads only the MCP server, not the HTTP stack.
// Run with `pnpm --silent --filter @cap/api mcp` so pnpm prints nothing on stdout.
import { routeConsoleToStderr } from './console.js'

routeConsoleToStderr()

const { assertRuntimeSecrets } = await import('../lib/secrets.js')
assertRuntimeSecrets()

const { startMcpServer } = await import('./server.js')
await startMcpServer()
