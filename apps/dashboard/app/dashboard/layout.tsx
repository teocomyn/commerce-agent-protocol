import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getDashboardSession } from '@/lib/dashboard-session'
import { DashboardShell } from './DashboardShell'

/** Pas de pré-render DB au build Vercel (Prisma sans DATABASE_URL). */
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getDashboardSession()
  if (!session) redirect('/login')

  return <DashboardShell role={session.role}>{children}</DashboardShell>
}
