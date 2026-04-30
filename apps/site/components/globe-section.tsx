import { SectionHead } from './section-head'

const markers = [
  { top: '25%', left: '30%', delay: '0s' },
  { top: '40%', left: '65%', delay: '0.3s' },
  { top: '65%', left: '45%', delay: '0.6s' },
  { top: '35%', left: '80%', delay: '0.9s' },
  { top: '55%', left: '20%', delay: '1.2s' },
  { top: '70%', left: '70%', delay: '1.5s' },
]

export function GlobeSection() {
  return (
    <section className="py-24 sm:py-32 px-6 sm:px-8 relative border-t border-edge"
      style={{ background: 'radial-gradient(ellipse at top, rgba(47,107,255,0.1), transparent 60%)' }}
    >
      <div className="max-w-container mx-auto text-center">
        <SectionHead
          overline="LIVE NETWORK"
          title={
            <>
              Every merchant.<br />
              Every agent. Everywhere.
            </>
          }
          sub="CAP is provider-agnostic. Connect a Shopify store, a WooCommerce site, or a custom catalog. Be discoverable to every AI agent on Earth."
          className="mb-16"
        />

        <div className="relative w-[320px] h-[320px] sm:w-[480px] sm:h-[480px] mx-auto">
          <div
            className="
              absolute inset-0 rounded-full overflow-hidden
              border border-edge-strong
            "
            style={{
              background: `
                radial-gradient(circle at 30% 30%, rgba(56,214,255,0.4), transparent 50%),
                radial-gradient(circle at 70% 70%, rgba(47,107,255,0.3), transparent 50%),
                linear-gradient(135deg, #0a1628 0%, #050505 100%)
              `,
              boxShadow: `
                inset 0 0 80px rgba(56,214,255,0.15),
                0 0 100px rgba(47,107,255,0.4),
                0 0 200px -20px rgba(56,214,255,0.3)
              `,
            }}
          >
            <div
              className="absolute inset-0 bg-grid-sm"
              style={{
                opacity: 0.3,
                maskImage: 'radial-gradient(circle, black 20%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(circle, black 20%, transparent 70%)',
              }}
            />
          </div>

          {markers.map((m, i) => (
            <div
              key={i}
              className="absolute z-10 w-3 h-3 rounded-full bg-pulse shadow-pulse"
              style={{ top: m.top, left: m.left }}
            >
              <span
                className="absolute inset-[-6px] rounded-full border-2 border-pulse animate-ping-ring"
                style={{ animationDelay: m.delay }}
              />
              <span
                className="absolute inset-[-6px] rounded-full border-2 border-pulse animate-ping-ring"
                style={{ animationDelay: `calc(${m.delay} + 0.7s)` }}
              />
            </div>
          ))}
        </div>

        <div className="mt-16 grid grid-cols-3 gap-6 sm:gap-12 max-w-2xl mx-auto">
          {[
            { v: '∞', l: 'agent clients' },
            { v: '<300ms', l: 'p50 search' },
            { v: '0', l: 'vendor lock-in' },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-semibold tracking-tightest text-3xl sm:text-4xl text-gradient-brand mb-1">
                {s.v}
              </div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-subtle">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
