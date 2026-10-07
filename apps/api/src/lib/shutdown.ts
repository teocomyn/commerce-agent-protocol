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

export function isShuttingDown(): boolean {
  return shuttingDown
}

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
 * Registers SIGTERM/SIGINT handlers once. `timeoutMs` must stay below the
 * platform grace period (Render: 30 s for web services, maxShutdownDelaySeconds
 * for workers) so the process exits on its own terms.
 */
export function registerGracefulShutdown(
  processName: string,
  steps: ShutdownStep[],
  timeoutMs = 25_000,
): void {
  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[Shutdown] ${processName} received ${signal}, draining...`)
    const forceExit = setTimeout(() => {
      console.error(`[Shutdown] ${processName} did not drain within ${timeoutMs} ms, exiting`)
      process.exit(1)
    }, timeoutMs)
    forceExit.unref()
    void runShutdown(processName, steps).then(() => {
      console.log(`[Shutdown] ${processName} stopped cleanly`)
      process.exit(0)
    })
  }
  process.once('SIGTERM', handler)
  process.once('SIGINT', handler)
}
