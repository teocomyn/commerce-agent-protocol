import { CpuArchitecture } from './ui/cpu-architecture'
import { SectionHead } from './section-head'

export function CpuSection() {
  return (
    <section className="relative py-24 sm:py-32 px-6 sm:px-8 border-t border-edge overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(56,214,255,0.10), transparent 60%)',
        }}
      />
      <div className="absolute inset-0 bg-grid-sm mask-fade-y opacity-40 pointer-events-none" />

      <div className="relative max-w-container mx-auto">
        <SectionHead
          overline="UNDER THE HOOD"
          title={
            <>
              One CPU.<br />
              Eight signals. Every commerce agent.
            </>
          }
          sub="CAP routes catalog data, agent queries, signed checkouts, fraud signals, fulfilment events, refunds, reviews and webhooks through a single deterministic pipeline. The protocol is the bus."
          className="mb-12"
        />

        <div
          className="
            relative mx-auto max-w-3xl rounded-2xl
            border border-edge bg-gradient-to-b from-surface to-midnight
            p-6 sm:p-10 shadow-elev
          "
        >
          <CpuArchitecture text="CAP" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-8 border-t border-edge">
            {[
              { k: 'CATALOG', v: 'sync + enrich' },
              { k: 'QUERY', v: 'vector + filters' },
              { k: 'CHECKOUT', v: 'cart api' },
              { k: 'WEBHOOK', v: 'reconciliation' },
            ].map((c) => (
              <div key={c.k} className="text-left">
                <div className="font-mono text-[10px] text-accent tracking-widest mb-1">
                  {c.k}
                </div>
                <div className="font-mono text-xs text-muted">{c.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
