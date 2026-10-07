import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@cap/db'
import { getDashboardSession } from '@/lib/dashboard-session'
import { hashInvitationToken, isInvitationTokenFormat } from '@/lib/human-auth'
import AcceptInvitationForm from './AcceptInvitationForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { referrer: 'no-referrer' }

/** True when the current dashboard session belongs to the invited account. */
async function isSignedInAsInvitee(token: string): Promise<boolean> {
  if (!isInvitationTokenFormat(token)) return false
  const session = await getDashboardSession()
  if (!session) return false

  const [invitation, user] = await Promise.all([
    prisma.merchantInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      select: {
        email: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
        merchant: { select: { uninstalledAt: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true, passwordHash: true },
    }),
  ])
  return Boolean(
    invitation && !invitation.acceptedAt && !invitation.revokedAt &&
    invitation.expiresAt > new Date() && !invitation.merchant.uninstalledAt &&
    user?.passwordHash && user.email === invitation.email,
  )
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const signedInAsInvitee = await isSignedInAsInvitee(token)

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="glass" style={{ width: '100%', maxWidth: 460, padding: 32, borderRadius: 18 }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>
          ← Commerce Agent Protocol
        </Link>
        <h1 style={{ margin: '24px 0 6px', fontSize: 28, letterSpacing: '-0.03em' }}>Join your team</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          {signedInAsInvitee
            ? 'You are signed in with the invited account. Accept to add this merchant to your CAP dashboard access. The invitation can only be used once.'
            : 'Create your account to access this merchant’s CAP dashboard. The invitation can only be used once.'}
        </p>
        <AcceptInvitationForm token={token} signedInAsInvitee={signedInAsInvitee} />
        {!signedInAsInvitee && (
          <p style={{ margin: '20px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
            {' '}first, then reopen this link.
          </p>
        )}
      </div>
    </main>
  )
}
