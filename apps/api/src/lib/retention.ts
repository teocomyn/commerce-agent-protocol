import { prisma, type Prisma } from '@cap/db'
import { OUTCOME_UNKNOWN_BODY } from './checkout-idempotency.js'

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
    // Rows without a merchant (its shop was erased, or pre-dating the
    // merchant_id column) cannot be attributed or redacted later: drop them.
    prisma.agentQuery.deleteMany({
      where: { OR: [{ createdAt: { lt: agentQueryCutoff } }, { merchantId: null }] },
    }),
    // Every status: a receipt still `processing` after the retention period
    // belongs to a crashed attempt (the handler treats them as stale after
    // five minutes) and would otherwise never be deleted.
    prisma.webhookEvent.deleteMany({ where: { receivedAt: { lt: webhookCutoff } } }),
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
    // A crash around the Shopify call leaves a row stuck in "creating". The
    // cart may or may not exist, so the idempotency key is kept and replays
    // an "outcome unknown" error telling the agent to use a new key.
    prisma.agentCheckout.updateMany({
      where: { status: 'creating', createdAt: { lt: before(1) } },
      data: {
        status: 'failed',
        response: { status: 409, body: OUTCOME_UNKNOWN_BODY } as unknown as Prisma.InputJsonValue,
      },
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
export async function redactShop(
  merchantId: string,
): Promise<{ erased: false } | { erased: true; apiKeyHashes: string[] }> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      uninstalledAt: true,
      members: { select: { userId: true } },
      apiKeys: { select: { keyHash: true } },
    },
  })
  if (!merchant?.uninstalledAt) return { erased: false }

  const memberIds = merchant.members.map((member) => member.userId)
  await prisma.$transaction([
    // agent_queries.merchant_id is ON DELETE SET NULL: delete explicitly so
    // shopper text does not survive the shop.
    prisma.agentQuery.deleteMany({ where: { merchantId } }),
    prisma.merchant.delete({ where: { id: merchantId } }),
    // Accounts that only belonged to this shop.
    prisma.user.deleteMany({ where: { id: { in: memberIds }, memberships: { none: {} } } }),
  ])
  // The caller evicts these from the API key cache.
  return { erased: true, apiKeyHashes: merchant.apiKeys.map((key) => key.keyHash) }
}

/** Shopify `customers/redact`: drop the order references CAP keeps. */
/**
 * What CAP holds for a customers/data_request: only Shopify order ids on
 * agent checkouts (no name, email or address; agent queries are not linked to
 * a customer). Returns how many of the requested orders are referenced.
 */
export async function countCustomerOrderReferences(merchantId: string, orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0
  return prisma.agentCheckout.count({ where: { merchantId, shopifyOrderId: { in: orderIds } } })
}

export async function redactCustomerOrders(merchantId: string, orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0
  const result = await prisma.agentCheckout.updateMany({
    where: { merchantId, shopifyOrderId: { in: orderIds } },
    data: { shopifyOrderId: null },
  })
  return result.count
}
