import { prisma } from '@cap/db'
import { getDashboardContext } from '@/lib/merchant-context'
import ApiKeysClient from './ApiKeysClient'

export default async function ApiKeysPage() {
  const context = await getDashboardContext()
  const role = context?.session.role ?? null
  const merchant = context?.merchant
  if (!merchant) {
    return <ApiKeysClient keys={[]} merchantDomain={null} role={role} />
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
      role={role}
    />
  )
}
