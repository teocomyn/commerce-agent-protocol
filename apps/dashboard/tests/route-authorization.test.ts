import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardSession } from '@/lib/dashboard-session'

// Route handlers run against mocked Prisma and session helpers: these tests
// pin who may call each route and that every query is scoped to the merchant
// of the signed-in session, never to an id taken from the request.

const state = vi.hoisted(() => ({
  session: null as DashboardSession | null,
  sameOrigin: true,
}))

const prisma = vi.hoisted(() => ({
  merchant: { findFirst: vi.fn() },
  apiKey: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  merchantMember: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  merchantInvitation: { findMany: vi.fn(), updateMany: vi.fn() },
}))

vi.mock('@cap/db', () => ({ prisma }))
vi.mock('@/lib/redis', () => ({ invalidateApiKeyCache: vi.fn(async () => undefined) }))
vi.mock('@/lib/dashboard-session', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/dashboard-session')>(),
  getDashboardSession: vi.fn(async () => state.session),
  isSameOriginMutation: vi.fn(() => state.sameOrigin),
}))

const keys = await import('@/app/api/keys/route')
const key = await import('@/app/api/keys/[id]/route')
const team = await import('@/app/api/team/route')
const member = await import('@/app/api/team/[id]/route')
const invitation = await import('@/app/api/team/invitations/[id]/route')
const login = await import('@/app/api/auth/login/route')
const acceptInvitation = await import('@/app/api/invitations/accept/route')
const logout = await import('@/app/api/session/logout/route')
const ownerSession = await import('@/app/api/session/merchant/route')

const MERCHANT_A = '0b1f8c3e-2d4a-4e6b-9c1d-111111111111'
const OTHER_ID = '7c2e9d4f-3e5b-4f7c-8d2e-222222222222'

function signIn(role: DashboardSession['role']) {
  state.session = {
    userId: 'a3f0e1d2-c4b5-4a69-8778-333333333333',
    merchantId: MERCHANT_A,
    role,
    mv: 1,
    expiresAt: Date.now() + 60_000,
  }
}

const request = (method: string, body?: unknown) => new NextRequest('https://dashboard.example.test/api', {
  method,
  ...(body !== undefined && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
})
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const prismaCalls = () => Object.values(prisma).flatMap((model) => Object.values(model))
  .reduce((total, fn) => total + fn.mock.calls.length, 0)

beforeEach(() => {
  for (const fn of Object.values(prisma).flatMap((model) => Object.values(model))) fn.mockReset()
  state.session = null
  state.sameOrigin = true
  prisma.merchant.findFirst.mockResolvedValue({ id: MERCHANT_A, shopifyDomain: 'a.myshopify.com', plan: 'free' })
})

describe('dashboard route authorization', () => {
  it('requires a session on every route', async () => {
    const responses = await Promise.all([
      keys.GET(),
      keys.POST(request('POST', {})),
      key.DELETE(request('DELETE'), params(OTHER_ID)),
      team.GET(),
      team.POST(request('POST', { email: 'new@example.test', role: 'ADMIN' })),
      member.PATCH(request('PATCH', { role: 'ADMIN' }), params(OTHER_ID)),
      member.DELETE(request('DELETE'), params(OTHER_ID)),
      invitation.DELETE(request('DELETE'), params(OTHER_ID)),
    ])
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401, 401, 401])
    expect(prismaCalls()).toBe(0)
  })

  it('rejects cross-origin mutations before any database access', async () => {
    signIn('OWNER')
    state.sameOrigin = false
    const responses = await Promise.all([
      keys.POST(request('POST', {})),
      key.DELETE(request('DELETE'), params(OTHER_ID)),
      team.POST(request('POST', { email: 'new@example.test', role: 'ADMIN' })),
      member.PATCH(request('PATCH', { role: 'ADMIN' }), params(OTHER_ID)),
      member.DELETE(request('DELETE'), params(OTHER_ID)),
      invitation.DELETE(request('DELETE'), params(OTHER_ID)),
      // Session-establishing routes check the origin too (login CSRF).
      login.POST(request('POST', { email: 'owner@example.test', password: 'a secure password', shop: 'a.myshopify.com' })),
      acceptInvitation.POST(request('POST', { token: 'x' })),
      logout.POST(request('POST')),
      ownerSession.POST(request('POST', { merchantId: MERCHANT_A })),
    ])
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403, 403, 403, 403, 403])
    expect(prismaCalls()).toBe(0)
  })

  it('keeps analysts read-only and team management to owners', async () => {
    signIn('ANALYST')
    prisma.apiKey.findMany.mockResolvedValue([])
    expect((await keys.POST(request('POST', {}))).status).toBe(403)
    expect((await key.DELETE(request('DELETE'), params(OTHER_ID))).status).toBe(403)
    expect((await keys.GET()).status).toBe(200)

    expect((await team.POST(request('POST', { email: 'new@example.test', role: 'ANALYST' }))).status).toBe(403)

    signIn('ADMIN')
    expect((await team.POST(request('POST', { email: 'new@example.test', role: 'ANALYST' }))).status).toBe(403)
    expect((await member.PATCH(request('PATCH', { role: 'ANALYST' }), params(OTHER_ID))).status).toBe(403)
    expect((await member.DELETE(request('DELETE'), params(OTHER_ID))).status).toBe(403)
    expect((await invitation.DELETE(request('DELETE'), params(OTHER_ID))).status).toBe(403)
    expect(prisma.merchantMember.updateMany).not.toHaveBeenCalled()
    expect(prisma.merchantInvitation.updateMany).not.toHaveBeenCalled()
  })

  it('scopes reads to the session merchant', async () => {
    signIn('ANALYST')
    prisma.apiKey.findMany.mockResolvedValue([])
    prisma.merchantMember.findMany.mockResolvedValue([])
    prisma.merchantInvitation.findMany.mockResolvedValue([])
    await keys.GET()
    await team.GET()
    expect(prisma.apiKey.findMany.mock.calls[0]![0].where.merchantId).toBe(MERCHANT_A)
    expect(prisma.merchantMember.findMany.mock.calls[0]![0].where.merchantId).toBe(MERCHANT_A)
    expect(prisma.merchantInvitation.findMany.mock.calls[0]![0].where.merchantId).toBe(MERCHANT_A)
  })

  it('answers 404 for another merchant\'s records and changes nothing', async () => {
    signIn('OWNER')
    // The rows exist under another merchant, so the scoped queries match none.
    prisma.apiKey.findFirst.mockResolvedValue(null)
    prisma.merchantMember.updateMany.mockResolvedValue({ count: 0 })
    prisma.merchantMember.findFirst.mockResolvedValue(null)
    prisma.merchantInvitation.updateMany.mockResolvedValue({ count: 0 })

    expect((await key.DELETE(request('DELETE'), params(OTHER_ID))).status).toBe(404)
    expect((await member.PATCH(request('PATCH', { role: 'ADMIN' }), params(OTHER_ID))).status).toBe(404)
    expect((await member.DELETE(request('DELETE'), params(OTHER_ID))).status).toBe(404)
    expect((await invitation.DELETE(request('DELETE'), params(OTHER_ID))).status).toBe(404)

    expect(prisma.apiKey.findFirst.mock.calls[0]![0].where).toMatchObject({ id: OTHER_ID, merchantId: MERCHANT_A })
    for (const call of prisma.merchantMember.updateMany.mock.calls) {
      expect(call[0].where).toMatchObject({ id: OTHER_ID, merchantId: MERCHANT_A })
    }
    expect(prisma.merchantInvitation.updateMany.mock.calls[0]![0].where)
      .toMatchObject({ id: OTHER_ID, merchantId: MERCHANT_A })
    expect(prisma.apiKey.update).not.toHaveBeenCalled()
  })

  it('creates keys for the session merchant only', async () => {
    signIn('ADMIN')
    prisma.apiKey.create.mockImplementation(async ({ data }) => ({ ...data, id: OTHER_ID, createdAt: new Date() }))
    const response = await keys.POST(request('POST', { label: 'agent', merchantId: OTHER_ID }))
    expect(response.status).toBe(200)
    expect(prisma.apiKey.create.mock.calls[0]![0].data.merchantId).toBe(MERCHANT_A)
  })

  it('treats a malformed id as not found without querying', async () => {
    signIn('OWNER')
    const responses = await Promise.all([
      key.DELETE(request('DELETE'), params('1 OR 1=1')),
      member.PATCH(request('PATCH', { role: 'ADMIN' }), params('not-a-uuid')),
      invitation.DELETE(request('DELETE'), params('../keys')),
    ])
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404])
    expect(prismaCalls()).toBe(0)
  })
})
