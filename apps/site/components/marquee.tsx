const items = [
  'Claude',
  'ChatGPT',
  'Perplexity',
  'Operator',
  'Cursor',
  'Gemini',
  'Shopify',
  'WooCommerce',
  'Stripe',
  'MCP',
]

export function Marquee() {
  // Duplicate the list so the keyframe translateX(-50%) loops seamlessly
  const all = [...items, ...items]

  return (
    <section className="relative py-12 border-y border-edge bg-surface/40 overflow-hidden">
      <p className="text-center font-mono text-[11px] uppercase tracking-widest text-subtle mb-6">
        · · · trusted by agents and merchants worldwide · · ·
      </p>

      <div className="relative">
        <div
          className="flex gap-16 animate-marquee whitespace-nowrap will-change-transform"
          style={{ width: 'max-content' }}
        >
          {all.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="text-3xl sm:text-4xl font-semibold tracking-tighter text-muted/50 hover:text-fg hover:opacity-100 transition-all duration-500 cursor-default"
            >
              {item}
            </span>
          ))}
        </div>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(90deg, #050505 0%, transparent 15%, transparent 85%, #050505 100%)',
        }} />
      </div>
    </section>
  )
}
