// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
// Render sends SIGTERM on every deploy. Without handlers, in-flight HTTP
// requests are dropped and active BullMQ jobs stall, then re-run (paying for
// the OpenAI calls twice). Steps run in order: stop accepting work first,
// then release connections.

export interface ShutdownStep {
  name: string
  close: () => Promise<unknown>
}

let shuttingDown = false

export async function runShutdown(processName: string, steps: ShutdownStep[]): Promise<void> {
  for (const step of steps) {
    try {
      await step.close()
    } catch (error) {
      console.error(`[Shutdown] ${processName}: ${step.name} failed:`, error instanceof Error ? error.message : error)
    }
  }
}

/**
 * Registers SIGTERM/SIGINT handlers once and returns the same drain for other
 * triggers (an MCP client closing stdin). `timeoutMs` must stay below the
 * platform grace period (Render: 30 s for web services, maxShutdownDelaySeconds
 * for workers) so the process exits on its own terms.
 */
export function registerGracefulShutdown(
  processName: string,
  steps: ShutdownStep[],
  timeoutMs = 25_000,
): (reason: string) => void {
  const handler = (reason: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[Shutdown] ${processName}: ${reason}, draining...`)
    // Referenced on purpose: a step that hangs without holding the event loop
    // open must still end in this failure exit, not in a silent exit code 0.
    setTimeout(() => {
      console.error(`[Shutdown] ${processName} did not drain within ${timeoutMs} ms, exiting`)
      process.exit(1)
    }, timeoutMs)
    void runShutdown(processName, steps).then(() => {
      console.log(`[Shutdown] ${processName} stopped cleanly`)
      process.exit(0)
    })
  }
  // `on`, not `once`: a second signal during the drain must hit the guard
  // above instead of Node's default handler, which would exit immediately.
  process.on('SIGTERM', () => handler('received SIGTERM'))
  process.on('SIGINT', () => handler('received SIGINT'))
  return handler
}
