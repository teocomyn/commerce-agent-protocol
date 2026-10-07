import Link from 'next/link'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { OWNER_LOGIN_COOKIE, findPendingOwnerLoginToken } from '@/lib/owner-login'
import ConfirmOwnerSessionForm from './ConfirmOwnerSessionForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { referrer: 'no-referrer' }

export default async function ConfirmOwnerSessionPage() {
  const rawToken = (await cookies()).get(OWNER_LOGIN_COOKIE)?.value ?? ''
  // Read-only lookup: the token is consumed only by the same-origin POST.
  const loginToken = await findPendingOwnerLoginToken(rawToken)

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="glass" style={{ width: '100%', maxWidth: 460, padding: 32, borderRadius: 18 }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>
          ← Commerce Agent Protocol
        </Link>
        {loginToken ? (
          <>
            <h1 style={{ margin: '24px 0 6px', fontSize: 28, letterSpacing: '-0.03em' }}>Confirm sign-in</h1>
            <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              Continue as owner of{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{loginToken.merchant.shopifyDomain}</strong>?
              Only continue if you just connected this store from Shopify.
            </p>
            <ConfirmOwnerSessionForm />
          </>
        ) : (
          <>
            <h1 style={{ margin: '24px 0 6px', fontSize: 28, letterSpacing: '-0.03em' }}>Link expired</h1>
            <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              This sign-in link is invalid or has expired. Reconnect your store from Shopify to get a new one.
            </p>
            <Link href="/" style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>
              Back to home
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
