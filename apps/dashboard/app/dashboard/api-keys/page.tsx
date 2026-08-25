import { prisma } from '@cap/db'
import { getDashboardMerchant } from '@/lib/merchant-context'
import ApiKeysClient from './ApiKeysClient'

export default async function ApiKeysPage() {
  const merchant = await getDashboardMerchant()
  if (!merchant) {
    return <ApiKeysClient keys={[]} merchantDomain={null} />
  }

  const keys = await prisma.apiKey.findMany({
    where: { merchantId: merchant.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, keyPrefix: true, label: true, lastUsedAt: true, createdAt: true },
  })

  return (
    <ApiKeysClient
      keys={keys.map(k => ({
        id: k.id,
        prefix: k.keyPrefix,
        label: k.label,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      }))}
      merchantDomain={merchant.shopifyDomain}
    />
  )
}
