import { NextResponse, type NextRequest } from 'next/server'
import { DASHBOARD_SESSION_COOKIE, isSameOriginMutation } from '@/lib/dashboard-session'

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }
  const response = NextResponse.json({ loggedOut: true })
  response.cookies.set(DASHBOARD_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
