import { prisma } from '@cap/db'
import { getDashboardSession } from './dashboard-session'

export interface DashboardMerchant {
  id: string
  shopifyDomain: string
  plan: string
}

export async function getDashboardMerchant(): Promise<DashboardMerchant | null> {
  const session = await getDashboardSession()
  if (!session) return null
  return prisma.merchant.findFirst({
    where: { id: session.merchantId, uninstalledAt: null },
    select: { id: true, shopifyDomain: true, plan: true },
  })
}
