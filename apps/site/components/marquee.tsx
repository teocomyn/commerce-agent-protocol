import { LazySparkles } from './ui/lazy-visuals'

// Plain-text wordmarks for the interfaces and platform the v0.1 reference
// implementation supports today. They describe compatibility only: no
// partnership, endorsement or adoption is implied, and no brand assets are used.
function Wordmark({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs sm:text-sm md:text-base font-medium tracking-tight text-fg/80 hover:text-fg transition-colors duration-300 truncate text-center">
      {children}
    </span>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="h-px flex-1 bg-edge" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">{children}</span>
      <span className="h-px flex-1 bg-edge" />
    </div>
  )
}

// MCP clients and the HTTP interfaces exposed by the API.
const agentInterfaces = ['Claude Desktop', 'Cursor', 'MCP stdio', 'MCP HTTP', 'REST', 'OpenAPI']
// Shopify is the only supported platform in v0.1.
const shopifyIntegration = ['Shopify', 'OAuth', 'Admin GraphQL', 'Cart API', 'Webhooks']

export function Marquee() {
  return (
    <section className="relative h-[720px] w-full overflow-hidden border-t border-edge">
      {/* Two-row label + logo grid sits in the upper half */}
      <div className="relative z-10 mx-auto max-w-3xl pt-24 px-6 sm:px-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-subtle mb-3">
          WORKS TODAY WITH
        </p>
        <h2 className="font-semibold tracking-tighter leading-[1.1] text-3xl sm:text-4xl lg:text-5xl">
          Built on{' '}
          <span className="text-gradient-brand">open standards</span>.{' '}
          <br className="hidden sm:block" />
          Shipping for <span className="text-gradient-pulse">Shopify</span>.
        </h2>
        <p className="text-muted text-base sm:text-lg mt-4 max-w-xl mx-auto leading-relaxed">
          A REST API and an MCP server, local or remote, in front of your Shopify catalog.
          Other platforms are open to contributions.
        </p>

        <div className="mt-12">
          <GroupLabel>AGENT INTERFACES</GroupLabel>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-2 gap-y-3">
            {agentInterfaces.map((a) => (
              <Wordmark key={a}>{a}</Wordmark>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <GroupLabel>PLATFORM</GroupLabel>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-2 gap-y-3">
            {shopifyIntegration.map((m) => (
              <Wordmark key={m}>{m}</Wordmark>
            ))}
          </div>
        </div>
      </div>

      {/* Sparkles aurora at the bottom, masked into a sphere shape */}
      <div className="relative -mt-24 h-96 w-full overflow-hidden [mask-image:radial-gradient(50%_50%_at_50%_50%,white,transparent)]">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at bottom center, rgba(47,107,255,0.55), transparent 70%)',
            opacity: 0.7,
          }}
        />
        <div
          className="absolute -left-1/2 top-1/2 aspect-[1/0.7] z-10 w-[200%] rounded-[100%] border-t border-accent/20 bg-void"
        />
        <LazySparkles
          density={1200}
          color="#38D6FF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
        />
      </div>
    </section>
  )
}
