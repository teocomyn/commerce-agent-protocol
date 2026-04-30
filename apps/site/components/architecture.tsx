import { SectionHead } from './section-head'

interface NodeProps {
  label: string
  sub?: string
  variant?: 'default' | 'primary' | 'pulse'
}

function FlowNode({ label, sub, variant = 'default' }: NodeProps) {
  const styles = {
    default: 'border-edge-strong bg-surface text-fg',
    primary: 'border-primary bg-gradient-to-b from-primary/15 to-surface text-fg shadow-[0_0_40px_-10px_rgba(47,107,255,0.6)]',
    pulse: 'border-pulse/50 bg-pulse/5 text-pulse',
  }
  return (
    <div className={`relative px-5 py-3.5 rounded-lg border ${styles[variant]} font-mono text-xs min-w-[140px] text-center`}>
      <div className="font-semibold tracking-wide">{label}</div>
      {sub && <div className="text-[10px] text-subtle mt-0.5 normal-case font-normal">{sub}</div>}
    </div>
  )
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="relative flex items-center justify-center min-w-[48px]">
      <div className="absolute inset-0 flex items-center">
        <div className="h-px w-full bg-gradient-to-r from-edge via-accent/60 to-edge" />
      </div>
      {label && (
        <span className="relative font-mono text-[10px] uppercase tracking-widest text-subtle bg-void px-2">
          {label}
        </span>
      )}
    </div>
  )
}

export function Architecture() {
  return (
    <section id="architecture" className="relative py-24 sm:py-32 px-6 sm:px-8 border-t border-edge bg-midnight overflow-hidden">
      <div className="absolute inset-0 bg-grid-sm mask-fade-y opacity-50 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(47,107,255,0.15), transparent 70%)', filter: 'blur(60px)' }}
      />

      <div className="relative max-w-container mx-auto">
        <SectionHead
          overline="ARCHITECTURE"
          title={<>How CAP fits in your stack.</>}
          sub="Drop CAP between your catalog and any agent. We handle ingestion, vectorization, signing, rate limiting. You keep your store; we make it agent-readable."
          className="mb-20"
        />

        <div className="
          relative max-w-4xl mx-auto rounded-xl border border-edge
          bg-gradient-to-b from-surface to-midnight p-8 sm:p-12
          shadow-elev shadow-glow
        ">
          {/* Desktop: horizontal flow */}
          <div className="hidden md:flex items-center justify-between gap-2">
            <div className="flex flex-col gap-3">
              <FlowNode label="SHOPIFY" sub="merchants" />
              <FlowNode label="WOO" sub="merchants" />
              <FlowNode label="CUSTOM" sub="merchants" />
            </div>
            <FlowArrow label="OAuth" />
            <FlowNode label="CAP" sub="protocol + infra" variant="primary" />
            <FlowArrow label="signed API" />
            <div className="flex flex-col gap-3">
              <FlowNode label="CLAUDE" sub="agent" variant="pulse" />
              <FlowNode label="CHATGPT" sub="agent" variant="pulse" />
              <FlowNode label="MCP CLIENT" sub="agent" variant="pulse" />
            </div>
          </div>

          {/* Mobile: vertical flow */}
          <div className="md:hidden flex flex-col items-center gap-4">
            <FlowNode label="MERCHANTS" sub="shopify · woo · custom" />
            <div className="h-8 w-px bg-gradient-to-b from-edge via-accent/60 to-edge" />
            <FlowNode label="CAP" sub="protocol + infra" variant="primary" />
            <div className="h-8 w-px bg-gradient-to-b from-edge via-accent/60 to-edge" />
            <FlowNode label="AGENTS" sub="claude · chatgpt · mcp" variant="pulse" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-12 pt-8 border-t border-edge">
            {[
              { k: 'INGEST', v: 'OAuth + webhooks' },
              { k: 'ENRICH', v: 'GPT-4o-mini + embeddings' },
              { k: 'INDEX', v: 'pgvector ANN' },
              { k: 'SERVE', v: 'Hono · MCP · OpenAPI' },
            ].map((c) => (
              <div key={c.k} className="text-left">
                <div className="font-mono text-[10px] text-accent tracking-widest mb-1">{c.k}</div>
                <div className="font-mono text-xs text-muted">{c.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
