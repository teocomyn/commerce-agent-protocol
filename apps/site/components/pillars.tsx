import { SectionHead } from './section-head'
import { CapIconCatalog, CapIconTransaction, CapIconMcp } from './icons'
import { GlowCard } from './ui/spotlight-card'
import type { ReactNode } from 'react'

type GlowColor = 'blue' | 'cyan' | 'pulse'

interface Pillar {
  num: string
  icon: ReactNode
  title: string
  desc: string
  bullets: string[]
  glow: GlowColor
}

const pillars: Pillar[] = [
  {
    num: '01 / CATALOG',
    icon: <CapIconCatalog className="w-5 h-5" />,
    title: 'Agent-readable catalogs',
    desc: 'Versioned JSON schema for products, variants, stock, certifications, shipping, returns. Designed for LLMs, not human scrollers.',
    bullets: ['Vector embeddings', 'Structured specs', 'Multi-locale ready'],
    glow: 'blue',
  },
  {
    num: '02 / TRANSACTION',
    icon: <CapIconTransaction className="w-5 h-5" />,
    title: 'Signed transaction API',
    desc: 'Search semantically, compare matrix-style, checkout via Cart API. Cryptographically signed. Deterministic. Auditable.',
    bullets: ['/v1/search · /v1/compare', '/v1/checkout/initiate', 'API keys per agent'],
    glow: 'cyan',
  },
  {
    num: '03 / MCP',
    icon: <CapIconMcp className="w-5 h-5" />,
    title: 'Native MCP server',
    desc: 'Plug-and-play in Claude Desktop, Cursor, or any MCP client. Three tools: search, compare, checkout. Zero glue code.',
    bullets: ['stdio transport', 'commerce_search/compare/checkout', 'Anthropic-compatible'],
    glow: 'pulse',
  },
]

function PillarCard({ p }: { p: Pillar }) {
  return (
    <GlowCard glowColor={p.glow} className="h-full p-8 flex flex-col">
      <div className="font-mono text-[11px] tracking-wider text-subtle mb-6">{p.num}</div>
      <div
        className="
          w-12 h-12 rounded-md flex items-center justify-center mb-6
          bg-gradient-to-br from-primary/15 to-accent/5
          border border-edge-strong text-accent
        "
      >
        {p.icon}
      </div>
      <h3 className="text-lg font-semibold tracking-tight mb-2">{p.title}</h3>
      <p className="text-sm text-muted leading-relaxed mb-6">{p.desc}</p>
      <ul className="mt-auto pt-6 border-t border-edge space-y-2">
        {p.bullets.map((b) => (
          <li key={b} className="font-mono text-[12px] text-subtle">
            <span className="text-accent mr-2">›</span>
            {b}
          </li>
        ))}
      </ul>
    </GlowCard>
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
            <PillarCard key={p.num} p={p} />
          ))}
        </div>
      </div>
    </section>
  )
}
