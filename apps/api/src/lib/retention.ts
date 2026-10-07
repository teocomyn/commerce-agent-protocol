import { prisma } from '@cap/db'

// ============================================================
// DATA RETENTION
// ============================================================
// Agent queries contain free text typed by shoppers, so they are personal
// data under GDPR and must not be kept forever. Operational rows (webhook
// receipts, single-use tokens, invitations) have no value once processed.

const DAY_MS = 86_400_000

function retentionDays(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export interface RetentionResult {
  agentQueries: number
  webhookEvents: number
  loginTokens: number
  invitations: number
  abandonedCheckouts: number
}

export async function runRetention(now = new Date()): Promise<RetentionResult> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS)
  const agentQueryCutoff = before(retentionDays('AGENT_QUERY_RETENTION_DAYS', 180))
  const webhookCutoff = before(retentionDays('WEBHOOK_EVENT_RETENTION_DAYS', 30))
  const invitationCutoff = before(30)

  const [agentQueries, webhookEvents, loginTokens, invitations, abandonedCheckouts] = await Promise.all([
    prisma.agentQuery.deleteMany({ where: { createdAt: { lt: agentQueryCutoff } } }),
    prisma.webhookEvent.deleteMany({
      where: { receivedAt: { lt: webhookCutoff }, status: { in: ['completed', 'failed'] } },
    }),
    prisma.dashboardLoginToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: before(1) } }, { consumedAt: { lt: before(1) } }] },
    }),
    prisma.merchantInvitation.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: invitationCutoff } },
          { acceptedAt: { lt: invitationCutoff } },
          { revokedAt: { lt: invitationCutoff } },
        ],
      },
    }),
    // A crash between the row insert and the Shopify call leaves a row stuck
    // in "creating"; releasing its idempotency key lets the client retry.
    prisma.agentCheckout.updateMany({
      where: { status: 'creating', createdAt: { lt: before(1) } },
      data: { status: 'failed', idempotencyKey: null },
    }),
  ])

  return {
    agentQueries: agentQueries.count,
    webhookEvents: webhookEvents.count,
    loginTokens: loginTokens.count,
    invitations: invitations.count,
    abandonedCheckouts: abandonedCheckouts.count,
  }
}

/**
 * Deletes everything CAP holds about a shop (Shopify `shop/redact`, sent 48 h
 * after uninstall). Returns false when the shop is still installed: Shopify
 * never sends this topic for an active install, so it is treated as invalid.
 */
export async function redactShop(merchantId: string): Promise<boolean> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { uninstalledAt: true, members: { select: { userId: true } } },
  })
  if (!merchant?.uninstalledAt) return false

  const memberIds = merchant.members.map((member) => member.userId)
  await prisma.$transaction([
    // agent_queries.merchant_id is ON DELETE SET NULL: delete explicitly so
    // shopper text does not survive the shop.
    prisma.agentQuery.deleteMany({ where: { merchantId } }),
    prisma.merchant.delete({ where: { id: merchantId } }),
    // Accounts that only belonged to this shop.
    prisma.user.deleteMany({ where: { id: { in: memberIds }, memberships: { none: {} } } }),
  ])
  return true
}

/** Shopify `customers/redact`: drop the order references CAP keeps. */
export async function redactCustomerOrders(merchantId: string, orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0
  const result = await prisma.agentCheckout.updateMany({
    where: { merchantId, shopifyOrderId: { in: orderIds } },
    data: { shopifyOrderId: null },
  })
  return result.count
}
