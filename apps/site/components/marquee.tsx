import { Sparkles } from './ui/sparkles'

// Stylised wordmark logos — text rendered in JetBrains Mono with a subtle
// gradient + tracking, used as visual references for agent / merchant
// ecosystems (no real brand assets, no trademark claims).
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

const agents = ['Claude', 'ChatGPT', 'Perplexity', 'Operator', 'Cursor']
const merchants = ['Shopify', 'WooCommerce', 'Salesforce', 'Stripe', 'MCP']

export function Marquee() {
  return (
    <section className="relative h-[720px] w-full overflow-hidden border-t border-edge">
      {/* Two-row label + logo grid sits in the upper half */}
      <div className="relative z-10 mx-auto max-w-3xl pt-24 px-6 sm:px-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-subtle mb-3">
          THE NETWORK
        </p>
        <h2 className="font-semibold tracking-tighter leading-[1.1] text-3xl sm:text-4xl lg:text-5xl">
          Trusted by{' '}
          <span className="text-gradient-brand">agents</span> and{' '}
          <span className="text-gradient-pulse">merchants</span> worldwide.
        </h2>
        <p className="text-muted text-base sm:text-lg mt-4 max-w-xl mx-auto leading-relaxed">
          One open protocol bridges every shopping agent and every merchant catalog.
          No glue code. No vendor lock-in. No silos.
        </p>

        <div className="mt-12">
          <GroupLabel>AGENTS</GroupLabel>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-2 gap-y-3">
            {agents.map((a) => (
              <Wordmark key={a}>{a}</Wordmark>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <GroupLabel>MERCHANTS</GroupLabel>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-2 gap-y-3">
            {merchants.map((m) => (
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
        <Sparkles
          density={1200}
          color="#38D6FF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
        />
      </div>
    </section>
  )
}
