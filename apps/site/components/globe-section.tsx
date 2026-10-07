import { SectionHead } from './section-head'
import { GlobeCdn } from './ui/cobe-globe-cdn'

export function GlobeSection() {
  return (
    <section
      className="py-24 sm:py-32 px-6 sm:px-8 relative border-t border-edge overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at top, rgba(47,107,255,0.12), transparent 60%)' }}
    >
      <div className="max-w-container mx-auto">
        <SectionHead
          overline="OPEN BY DESIGN"
          title={
            <>
              Open spec.<br />
              Implement it anywhere.
            </>
          }
          sub="The spec is platform-neutral and Apache 2.0. The reference implementation supports Shopify today, and adapters for other platforms are open to contributions."
          className="mb-16"
        />

        <div className="relative max-w-2xl mx-auto">
          {/* Outer ambient glow ring */}
          <div
            aria-hidden
            className="absolute inset-0 -m-8 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(56,214,255,0.2), transparent 65%)',
              filter: 'blur(40px)',
            }}
          />
          {/* Drag-able interactive globe */}
          <GlobeCdn className="w-full max-w-[560px] mx-auto" />

          {/* Drag hint */}
          <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-widest text-subtle">
            ◌ drag to rotate · illustrative only
          </p>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-6 sm:gap-12 max-w-2xl mx-auto">
          {[
            { v: '3', l: 'REST endpoints' },
            { v: '3', l: 'MCP tools' },
            { v: 'v0.1', l: 'alpha spec' },
          ].map((s) => (
            <div key={s.l} className="text-center">
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
