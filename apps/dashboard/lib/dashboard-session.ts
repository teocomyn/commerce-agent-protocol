import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma, type MerchantRole } from '@cap/db'
import { dashboardSessionSecret } from './session-secret'

export const DASHBOARD_SESSION_COOKIE = 'cap_dashboard_session'
const SESSION_TTL_SECONDS = 8 * 60 * 60

export interface DashboardSession {
  userId: string
  merchantId: string
  role: MerchantRole
  /** Membership version: MerchantMember.updatedAt (epoch ms) when the session was issued. */
  mv: number
  expiresAt: number
}

/** Membership fields that decide whether a signed session is still valid. */
export interface SessionMembership {
  role: MerchantRole
  revokedAt: Date | null
  updatedAt: Date
}

export function membershipVersion(updatedAt: Date): number {
  return updatedAt.getTime()
}

/**
 * A session stays valid only while its membership is active, has the same
 * role, and has not been written since the session was issued. Every
 * membership write (role change, revocation, re-invitation, app reinstall)
 * bumps updatedAt, which invalidates all sessions issued before it.
 */
export function isSessionMembershipCurrent(
  session: Pick<DashboardSession, 'role' | 'mv'>,
  membership: SessionMembership | null,
): boolean {
  if (!membership || membership.revokedAt) return false
  return membership.role === session.role && membershipVersion(membership.updatedAt) === session.mv
}

function signature(payload: string): string {
  return crypto.createHmac('sha256', dashboardSessionSecret()).update(payload).digest('base64url')
}

export function createDashboardSessionToken(
  session: Omit<DashboardSession, 'expiresAt'>,
  nowMs = Date.now(),
): string {
  const payload = Buffer.from(JSON.stringify({
    userId: session.userId,
    merchantId: session.merchantId,
    role: session.role,
    mv: session.mv,
    expiresAt: Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS,
  })).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function verifyDashboardSessionToken(
  token: string,
  nowMs = Date.now(),
): DashboardSession | null {
  const [payload, providedSignature] = token.split('.')
  if (!payload || !providedSignature) return null

  const expectedSignature = signature(payload)
  const provided = Buffer.from(providedSignature)
  const expected = Buffer.from(expectedSignature)
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DashboardSession
    if (
      !parsed.userId ||
      !parsed.merchantId ||
      !['OWNER', 'ADMIN', 'ANALYST'].includes(parsed.role) ||
      // Sessions issued before membership versioning carry no mv: reject them.
      !Number.isSafeInteger(parsed.mv) ||
      !Number.isInteger(parsed.expiresAt) ||
      parsed.expiresAt <= Math.floor(nowMs / 1000)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function getDashboardSession(
  allowedRoles?: readonly MerchantRole[],
): Promise<DashboardSession | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value
  if (!raw) return null

  const session = verifyDashboardSessionToken(raw)
  if (!session || (allowedRoles && !allowedRoles.includes(session.role))) return null

  const membership = await prisma.merchantMember.findUnique({
    where: {
      userId_merchantId: {
        userId: session.userId,
        merchantId: session.merchantId,
      },
    },
    select: { role: true, revokedAt: true, updatedAt: true },
  })

  return isSessionMembershipCurrent(session, membership) ? session : null
}

export function dashboardSessionCookie(token: string) {
  return {
    name: DASHBOARD_SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  }
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return process.env.NODE_ENV !== 'production'
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}
