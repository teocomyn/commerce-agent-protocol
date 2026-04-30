import { SectionHead } from './section-head'
import { Check } from './icons'
import { cn } from '@/lib/cn'

const rows = [
  ['Open spec, language-agnostic', true, false, false, false],
  ['Designed for LLM ingestion', true, false, true, false],
  ['Semantic search built-in', true, false, false, false],
  ['Signed, agent-to-merchant transactions', true, false, false, false],
  ['Cross-platform (Shopify, Woo, custom)', true, true, false, false],
  ['Native MCP integration', true, false, true, false],
  ['Free + open implementation', true, true, false, false],
  ['No vendor lock-in', true, false, false, false],
]

const cols = ['CAP', 'schema.org', 'MCP only', 'Scraping']

function Cell({ value }: { value: boolean }) {
  return value ? (
    <Check className="w-4 h-4 text-pulse mx-auto" strokeWidth={2.5} />
  ) : (
    <span className="block w-3 h-px bg-faint mx-auto" />
  )
}

export function Comparison() {
  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 relative border-t border-edge bg-midnight">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="COMPARISON"
          title={<>Why nothing else fits.</>}
          sub="schema.org is static and meant for Google. Google Merchant is a closed silo. MCP is a tool protocol, not commerce-aware. Scraping is fragile and unreliable. CAP is purpose-built."
          className="mb-16"
        />

        <div className="overflow-x-auto -mx-6 sm:mx-0">
          <div className="min-w-[640px] sm:min-w-0 px-6 sm:px-0">
            <div className="rounded-xl border border-edge overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface">
                    <th className="text-left p-4 font-mono text-[11px] uppercase tracking-widest text-subtle font-medium">
                      Capability
                    </th>
                    {cols.map((c, i) => (
                      <th
                        key={c}
                        className={cn(
                          'text-center p-4 font-semibold text-sm',
                          i === 0 ? 'text-accent' : 'text-muted',
                          i === 0 ? 'bg-primary/5' : '',
                        )}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const [label, ...vals] = r as [string, boolean, boolean, boolean, boolean]
                    return (
                      <tr key={i} className="border-t border-edge hover:bg-surface/40 transition-colors">
                        <td className="p-4 text-fg">{label}</td>
                        {vals.map((v, j) => (
                          <td
                            key={j}
                            className={cn('p-4 text-center', j === 0 ? 'bg-primary/5' : '')}
                          >
                            <Cell value={v} />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
