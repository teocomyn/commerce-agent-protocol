'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode } from 'react'

const navItems = [
  { href: '/dashboard', icon: '📊', label: 'Overview' },
  { href: '/dashboard/products', icon: '📦', label: 'Products' },
  { href: '/dashboard/analytics', icon: '📈', label: 'Analytics' },
  { href: '/dashboard/api-keys', icon: '🔑', label: 'API Keys' },
]

function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column',
      padding: '24px 12px', gap: 4,
      minHeight: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 20px', textDecoration: 'none' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
        }}>⚡</div>
        <div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>CAP</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>v0.1 MVP</div>
        </div>
      </Link>

      {/* Nav */}
      {navItems.map(item => {
        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8,
              background: isActive ? 'var(--accent-muted)' : 'transparent',
              border: isActive ? '1px solid rgba(108,99,255,0.3)' : '1px solid transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </Link>
        )
      })}

      {/* Bottom links */}
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/openapi.json`}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}
        >
          📄 API Docs
        </a>
        <a
          href="https://github.com/cap-protocol/cap"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}
        >
          ⭐ GitHub
        </a>
      </div>
    </aside>
  )
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
