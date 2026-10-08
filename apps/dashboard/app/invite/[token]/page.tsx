import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@cap/db'
import { getDashboardSession } from '@/lib/dashboard-session'
import { hashInvitationToken, isInvitationTokenFormat } from '@/lib/human-auth'
import AcceptInvitationForm from './AcceptInvitationForm'
import SwitchAccountButton from './SwitchAccountButton'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { referrer: 'no-referrer' }

type Viewer =
  | 'invalid-invitation' // malformed, unknown, expired, used or revoked link
  | 'invitee' // signed in with the invited, password-protected account
  | 'passwordless-invitee' // signed in with the invited account, no password yet
  | 'other-account' // signed in with an account that is not the invitee
  | 'anonymous' // not signed in

async function invitationViewer(token: string): Promise<Viewer> {
  if (!isInvitationTokenFormat(token)) return 'invalid-invitation'
  const invitation = await prisma.merchantInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      email: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true,
      merchant: { select: { uninstalledAt: true } },
    },
  })
  if (
    !invitation || invitation.acceptedAt || invitation.revokedAt ||
    invitation.expiresAt <= new Date() || invitation.merchant.uninstalledAt
  ) {
    return 'invalid-invitation'
  }

  const session = await getDashboardSession()
  if (!session) return 'anonymous'
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, passwordHash: true },
  })
  if (user?.email !== invitation.email) return 'other-account'
  // The invited account has no password yet (a Shopify owner, for example):
  // acceptance sets its first one through the password form.
  return user.passwordHash ? 'invitee' : 'passwordless-invitee'
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const viewer = await invitationViewer(token)
  const signedInAsInvitee = viewer === 'invitee'

  if (viewer === 'invalid-invitation') {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="glass" style={{ width: '100%', maxWidth: 460, padding: 32, borderRadius: 18 }}>
          <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>
            ← Commerce Agent Protocol
          </Link>
          <h1 style={{ margin: '24px 0 6px', fontSize: 28, letterSpacing: '-0.03em' }}>Invitation unavailable</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            This invitation link is invalid, has expired or was already used. Ask the store owner for a new invitation.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="glass" style={{ width: '100%', maxWidth: 460, padding: 32, borderRadius: 18 }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>
          ← Commerce Agent Protocol
        </Link>
        <h1 style={{ margin: '24px 0 6px', fontSize: 28, letterSpacing: '-0.03em' }}>Join your team</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          {viewer === 'invitee' && 'You are signed in with the invited account. Accept to add this merchant to your CAP dashboard access. The invitation can only be used once.'}
          {viewer === 'passwordless-invitee' && 'You are signed in with the invited account. Choose a password to accept the invitation and sign in with email from now on. The invitation can only be used once.'}
          {viewer === 'anonymous' && 'Create your account to access this merchant’s CAP dashboard. The invitation can only be used once.'}
          {viewer === 'other-account' && 'This invitation is for another account. Sign out first, then sign in as the invited account or create it from this link.'}
        </p>
        {viewer !== 'other-account' && (
          <AcceptInvitationForm token={token} signedInAsInvitee={signedInAsInvitee} />
        )}
        {viewer === 'anonymous' && (
          <p style={{ margin: '20px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            Already have an account with a password?{' '}
            <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
            {' '}first, then reopen this link.
          </p>
        )}
        {viewer === 'other-account' && (
          <p style={{ margin: '0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            <SwitchAccountButton />
            {' '}Then reopen this link.
          </p>
        )}
      </div>
    </main>
  )
}
