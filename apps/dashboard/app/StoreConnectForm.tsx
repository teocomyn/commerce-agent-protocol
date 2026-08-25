'use client'

import { useState } from 'react'

function normalizeShopDomain(value: string): string {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  if (raw.endsWith('.myshopify.com')) return raw
  return `${raw.replace(/\.myshopify\.com$/, '')}.myshopify.com`
}

export default function StoreConnectForm() {
  const [shop, setShop] = useState('')

  function connect() {
    const normalized = normalizeShopDomain(shop)
    if (!normalized) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
    const url = new URL('/shopify/install', apiUrl)
    url.searchParams.set('shop', normalized)
    window.location.href = url.toString()
  }

  return (
    <div className="glass" style={{ padding: 16, borderRadius: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="text"
          value={shop}
          onChange={(event) => setShop(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') connect()
          }}
          placeholder="my-store.myshopify.com"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={connect}
          disabled={!shop.trim()}
          style={{
            padding: '12px 18px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
            color: 'white',
            fontWeight: 700,
            fontSize: 14,
            cursor: shop.trim() ? 'pointer' : 'default',
            opacity: shop.trim() ? 1 : 0.65,
            whiteSpace: 'nowrap',
          }}
        >
          Connect
        </button>
      </div>
    </div>
  )
}
