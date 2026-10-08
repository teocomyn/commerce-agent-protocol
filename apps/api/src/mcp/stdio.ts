// Dedicated stdio entrypoint: loads only the MCP server, not the HTTP stack.
// Run with `pnpm --silent -C apps/api mcp` from the repo root: with --filter,
// pnpm still prints its script banner on stdout and breaks the MCP stream.
import { routeConsoleToStderr } from './console.js'

routeConsoleToStderr()

const { assertRuntimeSecrets } = await import('../lib/secrets.js')
assertRuntimeSecrets(process.env, { mode: 'mcp' })

const { runMcpOverStdio } = await import('./server.js')
await runMcpOverStdio()
