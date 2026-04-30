import { SectionHead } from './section-head'

const points = [
  {
    n: '01',
    title: 'The protocol will exist anyway',
    body: 'Someone is going to write the layer between agents and merchants. The only question is who, and whether it stays open. Stripe was a neutral party between merchants and banks. CAP is the neutral party between merchants and agents.',
  },
  {
    n: '02',
    title: 'Agents do not browse, they query',
    body: 'Today agents scrape HTML and click buttons made for humans. It is slow, fragile, and breaks at every redesign. CAP exposes a real API designed for LLMs: structured data, semantic search, signed transactions.',
  },
  {
    n: '03',
    title: 'Open spec, hosted reference',
    body: 'The CAP specification is Apache 2.0. Anyone can implement it. The hosted reference SaaS is a service: pay only if you do not want to run it yourself. Like Stripe to ISO 20022.',
  },
]

export function WhyCap() {
  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 relative">
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="WHY NOW"
          title={
            <>
              The unsexy plumbing<br />
              everyone will eventually depend on.
            </>
          }
          sub="If Shopify writes this, it will be closed to their ecosystem. If Google writes it, centered on their search. If OpenAI writes it, coupled to their agents. CAP can stay neutral, but only if it ships first."
          className="mb-20"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-edge rounded-xl overflow-hidden border border-edge">
          {points.map((p) => (
            <div
              key={p.n}
              className="p-8 bg-void hover:bg-surface/50 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            >
              <div className="font-mono text-5xl font-semibold tracking-tighter text-gradient-brand mb-6">
                {p.n}
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-3">{p.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
