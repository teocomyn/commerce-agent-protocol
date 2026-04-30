import { SectionHead } from './section-head'
import { CapIconCatalog, CapIconTransaction, CapIconMcp } from './icons'
import type { ReactNode } from 'react'

const pillars = [
  {
    num: '01 / CATALOG',
    icon: <CapIconCatalog className="w-5 h-5" />,
    title: 'Agent-readable catalogs',
    desc: 'Versioned JSON schema for products, variants, stock, certifications, shipping, returns. Designed for LLMs, not human scrollers.',
    bullets: ['Vector embeddings', 'Structured specs', 'Multi-locale ready'],
  },
  {
    num: '02 / TRANSACTION',
    icon: <CapIconTransaction className="w-5 h-5" />,
    title: 'Signed transaction API',
    desc: 'Search semantically, compare matrix-style, checkout via Cart API. Cryptographically signed. Deterministic. Auditable.',
    bullets: ['/v1/search · /v1/compare', '/v1/checkout/initiate', 'API keys per agent'],
  },
  {
    num: '03 / MCP',
    icon: <CapIconMcp className="w-5 h-5" />,
    title: 'Native MCP server',
    desc: 'Plug-and-play in Claude Desktop, Cursor, or any MCP client. Three tools: search, compare, checkout. Zero glue code.',
    bullets: ['stdio transport', 'commerce_search/compare/checkout', 'Anthropic-compatible'],
  },
]

interface PillarCardProps {
  num: string
  icon: ReactNode
  title: string
  desc: string
  bullets: string[]
}

function PillarCard({ num, icon, title, desc, bullets }: PillarCardProps) {
  return (
    <div
      className="
        relative p-8 rounded-xl border border-edge
        bg-gradient-to-b from-surface to-midnight
        transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
        hover:-translate-y-1 hover:border-edge-strong hover:shadow-glow-cyan
        glow-border-hover
        flex flex-col h-full
      "
    >
      <div className="font-mono text-[11px] tracking-wider text-subtle mb-6">{num}</div>
      <div className="
        w-12 h-12 rounded-md flex items-center justify-center mb-6
        bg-gradient-to-br from-primary/15 to-accent/5
        border border-edge-strong text-accent
      ">
        {icon}
      </div>
      <h3 className="text-lg font-semibold tracking-tight mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed mb-6">{desc}</p>
      <ul className="mt-auto pt-6 border-t border-edge space-y-2">
        {bullets.map((b) => (
          <li key={b} className="font-mono text-[12px] text-subtle">
            <span className="text-accent mr-2">›</span>
            {b}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Pillars() {
  return (
    <section id="protocol" className="py-24 sm:py-32 px-6 sm:px-8 relative">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="THREE PILLARS"
          title={
            <>
              One protocol.<br />
              Every agent. Any merchant.
            </>
          }
          sub="CAP is what HTTP was to the web, what Stripe was to payments, what MCP is to LLM tools. The neutral layer that finally makes commerce machine-readable."
          className="mb-16"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {pillars.map((p) => (
            <PillarCard key={p.num} {...p} />
          ))}
        </div>
      </div>
    </section>
  )
}
