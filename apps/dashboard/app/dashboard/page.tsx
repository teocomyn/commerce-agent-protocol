import { prisma } from '@cap/db'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: string
  color?: string
}

function StatCard({ label, value, sub, icon, color = '#6c63ff' }: StatCardProps) {
  return (
    <div className="glass" style={{ padding: 24, borderRadius: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{value}</div>
          {sub && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 32 }}>{icon}</div>
      </div>
    </div>
  )
}

export default async function DashboardOverview() {
  const firstMerchant = await prisma.merchant.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const storeScope =
    firstMerchant != null ? { merchantId: firstMerchant.id } : {}

  const [merchantCount, productCount, geoAgg, queryCount] = await Promise.all([
    prisma.merchant.count(),
    prisma.productEnriched.count({
      where: { deletedAt: null, ...storeScope },
    }),
    prisma.productEnriched.aggregate({
      where: { deletedAt: null, ...storeScope },
      _avg: { geoScore: true },
    }),
    prisma.agentQuery.count({
      where: firstMerchant ? { merchantId: firstMerchant.id } : {},
    }),
  ])

  const avgScore = Math.round(geoAgg._avg.geoScore ?? 0)

  // Recent activity
  const recentProducts = await prisma.productEnriched.findMany({
    where: { deletedAt: null, ...storeScope },
    orderBy: { enrichedAt: 'desc' },
    take: 5,
    include: { productRaw: { select: { title: true } }, merchant: { select: { shopifyDomain: true } } },
  })

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Overview</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 14 }}>
          Your CAP infrastructure — real-time status
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard label="Connected Merchants" value={merchantCount} icon="🏪" />
        <StatCard label="Enriched Products" value={productCount.toLocaleString()} icon="📦" color="#22c55e" />
        <StatCard label="Avg. GEO Score" value={`${avgScore}/100`} icon="⭐" color={avgScore >= 70 ? '#22c55e' : avgScore >= 40 ? '#f59e0b' : '#ef4444'} />
        <StatCard label="Agent Queries" value={queryCount.toLocaleString()} icon="🤖" color="#a78bfa" />
      </div>

      {/* Recent enrichments */}
      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recently Enriched Products</h2>
          <a href="/dashboard/products" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none' }}>View all →</a>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
              {['Product', 'Store', 'GEO Score', 'Enriched'].map(h => (
                <th key={h} style={{ padding: '10px 24px', textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentProducts.map((p, i) => (
              <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '14px 24px', fontSize: 14, fontWeight: 500 }}>{p.productRaw.title}</td>
                <td style={{ padding: '14px 24px', fontSize: 13, color: 'var(--text-secondary)' }}>{p.merchant.shopifyDomain}</td>
                <td style={{ padding: '14px 24px' }}>
                  <span className={`geo-badge ${p.geoScore >= 70 ? 'high' : p.geoScore >= 40 ? 'mid' : 'low'}`}>
                    {p.geoScore}
                  </span>
                </td>
                <td style={{ padding: '14px 24px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {new Date(p.enrichedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
            {recentProducts.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
                  No products yet. <a href="/shopify/install" style={{ color: 'var(--accent)' }}>Connect your Shopify store →</a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
