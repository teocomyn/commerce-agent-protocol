import { getDashboardSession } from '@/lib/dashboard-session'
import TeamClient from './TeamClient'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const session = await getDashboardSession()
  return <TeamClient role={session?.role ?? null} />
}
