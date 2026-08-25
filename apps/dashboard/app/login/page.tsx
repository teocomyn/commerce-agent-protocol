import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/dashboard-session'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await getDashboardSession()) redirect('/dashboard')

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="glass" style={{ width: '100%', maxWidth: 440, padding: 32, borderRadius: 18 }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>
          ← Commerce Agent Protocol
        </Link>
        <h1 style={{ margin: '24px 0 6px', fontSize: 28, letterSpacing: '-0.03em' }}>Team sign in</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          Use the credentials created when you accepted your merchant invitation.
        </p>
        <LoginForm />
      </div>
    </main>
  )
}
