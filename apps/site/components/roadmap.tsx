import { SectionHead } from './section-head'
import { cn } from '@/lib/cn'

const milestones = [
  {
    version: 'v0.1',
    status: 'shipped',
    title: 'First public alpha',
    items: [
      'Search · Compare · Checkout via Cart API',
      'MCP server with 3 tools',
      'cap-spec versioned + conformance fixtures',
      'Apache 2.0 + open repo',
    ],
  },
  {
    version: 'v0.2',
    status: 'in-progress',
    title: 'Cryptographic transport',
    items: [
      'Ed25519 request signing',
      'WooCommerce adapter',
      'NextAuth + multi-tenant dashboard',
      'Hosted preview at api.cap-protocol.org',
    ],
  },
  {
    version: 'v0.3',
    status: 'planned',
    title: 'Negotiation + reservation',
    items: [
      'Agent-exclusive pricing API',
      'Inventory hold (15 min lock)',
      'Reviews aggregation',
      'Stripe Apps integration',
    ],
  },
  {
    version: 'v1.0',
    status: 'planned',
    title: 'GA + ecosystem',
    items: [
      'Salesforce Commerce adapter',
      'Public conformance suite runner',
      'Federation across CAP servers',
      'Production SLA + status page',
    ],
  },
]

const statusStyles: Record<string, string> = {
  shipped: 'border-pulse/40 bg-pulse/5 text-pulse',
  'in-progress': 'border-accent/40 bg-accent/5 text-accent',
  planned: 'border-edge text-subtle',
}

export function Roadmap() {
  return (
    <section id="roadmap" className="py-24 sm:py-32 px-6 sm:px-8 relative bg-midnight border-t border-edge">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="ROADMAP"
          title={<>Where CAP is headed.</>}
          sub="Versioned in the open. Every milestone is tracked in the changelog and shipped under Apache 2.0. Breaking changes require a Spec Proposal."
          className="mb-16"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {milestones.map((m) => (
            <div
              key={m.version}
              className="
                relative rounded-xl border border-edge bg-surface p-6
                transition-all duration-500 hover:border-edge-strong hover:bg-surface-2
              "
            >
              <div className="flex items-center justify-between mb-6">
                <span className="font-mono text-sm font-semibold tracking-tight text-fg">
                  {m.version}
                </span>
                <span
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border',
                    statusStyles[m.status],
                  )}
                >
                  {m.status === 'in-progress' ? 'in progress' : m.status}
                </span>
              </div>
              <h3 className="text-base font-semibold tracking-tight mb-4">{m.title}</h3>
              <ul className="space-y-2">
                {m.items.map((item) => (
                  <li key={item} className="text-xs text-muted leading-relaxed flex gap-2">
                    <span className="text-accent flex-shrink-0">›</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
