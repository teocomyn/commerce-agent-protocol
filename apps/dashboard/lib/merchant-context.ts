import { prisma } from '@cap/db'
import { type DashboardSession, getDashboardSession } from './dashboard-session'

export interface DashboardMerchant {
  id: string
  shopifyDomain: string
  plan: string
}

export interface DashboardContext {
  session: DashboardSession
  merchant: DashboardMerchant | null
}

export async function findActiveMerchant(merchantId: string): Promise<DashboardMerchant | null> {
  return prisma.merchant.findFirst({
    where: { id: merchantId, uninstalledAt: null },
    select: { id: true, shopifyDomain: true, plan: true },
  })
}

/** The verified session and its merchant (null once the app is uninstalled). */
export async function getDashboardContext(): Promise<DashboardContext | null> {
  const session = await getDashboardSession()
  if (!session) return null
  return { session, merchant: await findActiveMerchant(session.merchantId) }
}

export async function getDashboardMerchant(): Promise<DashboardMerchant | null> {
  return (await getDashboardContext())?.merchant ?? null
}
