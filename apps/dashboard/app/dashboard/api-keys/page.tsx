import { prisma } from '@cap/db'
import ApiKeysClient from './ApiKeysClient'

export default async function ApiKeysPage() {
  const keys = await prisma.apiKey.findMany({
    where: { revokedAt: null },
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
    />
  )
}
