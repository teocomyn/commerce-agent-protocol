import { Console } from 'node:console'

/**
 * stdout carries MCP JSON-RPC frames only. Any library or route that logs
 * through the global console (log, info, debug, dir, table, count, timeLog...)
 * would corrupt the stream, so the whole console is rebound to stderr.
 */
export function routeConsoleToStderr(): void {
  globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr })
}
