import { NextResponse } from 'next/server'
import type { z } from 'zod'
import type { MerchantRole } from '@cap/db'
import { type DashboardSession, getDashboardSession } from './dashboard-session'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RouteResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse }

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status })
}

/** Database ids are UUIDs; anything else cannot match a row (and would make Prisma throw). */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/**
 * Reads and validates a JSON body. Malformed JSON and schema mismatches both
 * become a 400 with a short message instead of an unhandled exception.
 */
export async function parseJsonBody<Schema extends z.ZodTypeAny>(
  req: Request,
  schema: Schema,
  invalidMessage: string,
): Promise<RouteResult<z.output<Schema>>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { ok: false, response: jsonError(400, 'Request body must be valid JSON') }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return { ok: false, response: jsonError(400, invalidMessage) }
  return { ok: true, value: parsed.data }
}

/**
 * 401 when the request carries no valid session, 403 when the signed-in
 * member's role is not one of allowedRoles.
 */
export async function requireDashboardSession(
  allowedRoles?: readonly MerchantRole[],
  forbiddenMessage = 'Your role does not allow this action',
): Promise<RouteResult<DashboardSession>> {
  const session = await getDashboardSession()
  if (!session) return { ok: false, response: jsonError(401, 'Authentication required') }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return { ok: false, response: jsonError(403, forbiddenMessage) }
  }
  return { ok: true, value: session }
}

// Single implementation (rightmost X-Forwarded-For hop) lives next to the
// other request-trust helpers.
export { clientAddress } from './dashboard-session'
