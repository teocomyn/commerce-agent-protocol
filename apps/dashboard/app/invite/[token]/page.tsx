import Link from 'next/link'
import type { Metadata } from 'next'
import AcceptInvitationForm from './AcceptInvitationForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { referrer: 'no-referrer' }

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="glass" style={{ width: '100%', maxWidth: 460, padding: 32, borderRadius: 18 }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>
          ← Commerce Agent Protocol
        </Link>
        <h1 style={{ margin: '24px 0 6px', fontSize: 28, letterSpacing: '-0.03em' }}>Join your team</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          Create your account to access this merchant&apos;s CAP dashboard. The invitation can only be used once.
        </p>
        <AcceptInvitationForm token={token} />
      </div>
    </main>
  )
}
