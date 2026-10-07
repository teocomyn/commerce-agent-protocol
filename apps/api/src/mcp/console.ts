/**
 * stdout carries MCP JSON-RPC frames only. Any library or route that logs with
 * console.log/info/debug would corrupt the stream, so they go to stderr.
 */
export function routeConsoleToStderr(): void {
  console.log = console.error
  console.info = console.error
  console.debug = console.error
}
