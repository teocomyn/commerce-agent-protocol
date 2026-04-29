import { PrismaClient } from '@prisma/client'

// Prevent multiple instances in development (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export * from '@prisma/client'
export type { Merchant, ProductRaw, ProductEnriched, ApiKey, AgentQuery, AgentCheckout } from '@prisma/client'
