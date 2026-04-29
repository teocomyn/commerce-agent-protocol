import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24
          }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>Commerce Agent Protocol</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Make your products AI-agent ready</div>
          </div>
        </div>

        {/* Hero */}
        <div className="space-y-4">
          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Your products,{' '}
            <span style={{ background: 'linear-gradient(135deg, #6c63ff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              visible to AI
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1.6 }}>
            Connect your Shopify store. CAP enriches your catalog and exposes it to ChatGPT Shopping, Perplexity, and every other AI agent — in minutes.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/api/shopify/install"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
              color: 'white', padding: '14px 28px', borderRadius: 10,
              fontWeight: 600, fontSize: 16, textDecoration: 'none',
              transition: 'opacity 0.2s',
            }}
          >
            🛍️ Connect Shopify Store
          </Link>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(108, 99, 255, 0.1)', border: '1px solid rgba(108,99,255,0.3)',
              color: 'var(--text-primary)', padding: '14px 28px', borderRadius: 10,
              fontWeight: 600, fontSize: 16, textDecoration: 'none',
            }}
          >
            📊 View Dashboard
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4">
          {[
            { label: 'Avg. enrichment cost', value: '~€0.002', sub: 'per product' },
            { label: 'Enrichment time', value: '<60s', sub: 'per product' },
            { label: 'API latency P95', value: '<100ms', sub: 'for search' },
          ].map(stat => (
            <div key={stat.label} className="glass" style={{ padding: 20, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)' }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.6 }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
