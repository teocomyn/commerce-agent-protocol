import { prisma } from '@cap/db'

function GeoBar({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className="progress-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className={`geo-badge ${score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'}`} style={{ whiteSpace: 'nowrap' }}>
        {score}
      </span>
    </div>
  )
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string }>
}) {
  const { page: pageParam = '1', sort = 'geo_asc' } = await searchParams
  const page = Math.max(1, parseInt(pageParam))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const orderByMap: Record<string, object> = {
    geo_asc: { geoScore: 'asc' },
    geo_desc: { geoScore: 'desc' },
    newest: { enrichedAt: 'desc' },
  }

  const [products, total] = await Promise.all([
    prisma.productEnriched.findMany({
      where: { deletedAt: null },
      orderBy: orderByMap[sort] ?? { geoScore: 'asc' },
      take: pageSize,
      skip: offset,
      include: {
        productRaw: { select: { title: true, images: true, status: true } },
        merchant: { select: { shopifyDomain: true, plan: true } },
      },
    }),
    prisma.productEnriched.count({ where: { deletedAt: null } }),
  ])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>Products</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            {total.toLocaleString()} enriched products
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { value: 'geo_asc', label: '⬆ GEO Score (low)' },
            { value: 'geo_desc', label: '⬇ GEO Score (high)' },
            { value: 'newest', label: '🕒 Newest' },
          ].map(s => (
            <a
              key={s.value}
              href={`?sort=${s.value}&page=1`}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
                background: sort === s.value ? 'var(--accent-muted)' : 'var(--bg-card)',
                border: `1px solid ${sort === s.value ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
                color: sort === s.value ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
              {['Product', 'Category', 'Store', 'GEO Score', 'Status', 'Enriched'].map(h => (
                <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => {
              const images = Array.isArray(p.productRaw.images) ? p.productRaw.images as Array<{ src: string }> : []
              const firstImage = images[0]?.src

              return (
                <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', transition: 'background 0.1s' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {firstImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={firstImage} alt={p.productRaw.title} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.productRaw.title}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>v{p.version}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[p.category, p.subcategory].filter(Boolean).join(' > ') || '—'}
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.merchant.shopifyDomain}</div>
                  </td>
                  <td style={{ padding: '14px 20px', minWidth: 160 }}>
                    <GeoBar score={p.geoScore} />
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: p.productRaw.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: p.productRaw.status === 'active' ? '#22c55e' : '#ef4444',
                    }}>
                      {p.productRaw.status ?? 'unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {new Date(p.enrichedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </td>
                </tr>
              )
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No products enriched yet.{' '}
                  <a href="/" style={{ color: 'var(--accent)' }}>Connect your Shopify store →</a>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Page {page} of {totalPages} ({total} total)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {page > 1 && (
                <a href={`?sort=${sort}&page=${page - 1}`} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13 }}>
                  ← Prev
                </a>
              )}
              {page < totalPages && (
                <a href={`?sort=${sort}&page=${page + 1}`} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent-muted)', border: '1px solid rgba(108,99,255,0.3)', color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }}>
                  Next →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
