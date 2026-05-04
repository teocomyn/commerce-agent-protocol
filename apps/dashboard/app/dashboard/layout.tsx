import type { ReactNode } from 'react'
import { DashboardShell } from './DashboardShell'

/** Pas de pré-render DB au build Vercel (Prisma sans DATABASE_URL). */
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
