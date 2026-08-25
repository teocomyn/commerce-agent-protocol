import { prisma } from '@cap/db'
import { getDashboardMerchant } from '@/lib/merchant-context'

function Metric({
  label,
  value,
  sub,
  color = 'var(--accent)',
}: {
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="glass" style={{ padding: 20, borderRadius: 12 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ color, fontSize: 28, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default async function AnalyticsPage() {
  const merchant = await getDashboardMerchant()
  const merchantScope = {
    merchantId: merchant?.id ?? '00000000-0000-0000-0000-000000000000',
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [queryCount, checkoutCount, completedCount, avgLatency, recentQueries] = await Promise.all([
    prisma.agentQuery.count({ where: { ...merchantScope, createdAt: { gte: since } } }),
    prisma.agentCheckout.count({ where: { ...merchantScope, createdAt: { gte: since } } }),
    prisma.agentCheckout.count({
      where: { ...merchantScope, status: 'completed', createdAt: { gte: since } },
    }),
    prisma.agentQuery.aggregate({
      where: { ...merchantScope, createdAt: { gte: since } },
      _avg: { latencyMs: true },
    }),
    prisma.agentQuery.findMany({
      where: merchantScope,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        queryText: true,
        agentType: true,
        resultsCount: true,
        converted: true,
        latencyMs: true,
        createdAt: true,
      },
    }),
  ])

  const conversionRate = checkoutCount > 0
    ? Math.round((completedCount / checkoutCount) * 100)
    : 0

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
          Analytics
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: 14 }}>
          Last 30 days{merchant ? ` for ${merchant.shopifyDomain}` : ''}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 28 }}>
        <Metric label="Agent queries" value={queryCount.toLocaleString()} />
        <Metric label="Checkouts started" value={checkoutCount.toLocaleString()} color="#f59e0b" />
        <Metric label="Completed orders" value={completedCount.toLocaleString()} color="#22c55e" />
        <Metric label="Conversion" value={`${conversionRate}%`} sub={`Avg latency ${Math.round(avgLatency._avg.latencyMs ?? 0)}ms`} />
      </div>

      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Recent Agent Queries</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
              {['Query', 'Agent', 'Results', 'Converted', 'Latency', 'Created'].map((header) => (
                <th key={header} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentQueries.map((query, index) => (
              <tr key={query.id} style={{ borderTop: index > 0 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '14px 20px', fontSize: 13, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {query.queryText ?? 'No query text'}
                </td>
                <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                  {query.agentType ?? 'custom'}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 13 }}>{query.resultsCount ?? 0}</td>
                <td style={{ padding: '14px 20px' }}>
                  <span className={`geo-badge ${query.converted ? 'high' : 'low'}`}>
                    {query.converted ? 'yes' : 'no'}
                  </span>
                </td>
                <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                  {query.latencyMs ?? 0}ms
                </td>
                <td style={{ padding: '14px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                  {new Date(query.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
            {recentQueries.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
                  No agent queries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
