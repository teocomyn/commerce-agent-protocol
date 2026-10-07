// Re-encrypts every stored Shopify token with the current ENCRYPTION_KEY.
// Run it after a key rotation, while ENCRYPTION_KEY_PREVIOUS still holds the
// old key, then remove ENCRYPTION_KEY_PREVIOUS from every service. Token
// refreshes only re-encrypt the admin tokens; storefront tokens need this.
import { prisma } from '@cap/db'
import { decryptToken, encryptToken } from '../lib/shopify.js'
import { assertRuntimeSecrets } from '../lib/secrets.js'

assertRuntimeSecrets(process.env, { mode: 'mcp' })

const TOKEN_FIELDS = ['shopifyToken', 'shopifyRefreshToken', 'storefrontToken'] as const

const selectTokens = {
  id: true, shopifyDomain: true, shopifyToken: true, shopifyRefreshToken: true, storefrontToken: true,
} as const
const merchants = await prisma.merchant.findMany({ select: selectTokens })

const MAX_ATTEMPTS = 3

let reencrypted = 0
const failures: string[] = []
for (const listed of merchants) {
  // Compare-and-set: the write only applies if no token changed since it was
  // read (refresh, reinstall, uninstall); otherwise the row is re-read and
  // retried, so a stale credential is never written back.
  let merchant: typeof listed | null = listed
  let attempts = 0
  while (merchant) {
    const current: typeof listed = merchant
    const data: Partial<Record<(typeof TOKEN_FIELDS)[number], string>> = {}
    try {
      for (const field of TOKEN_FIELDS) {
        const ciphertext = current[field]
        if (ciphertext) data[field] = encryptToken(decryptToken(ciphertext))
      }
    } catch (error) {
      failures.push(`${current.shopifyDomain}: ${error instanceof Error ? error.message : String(error)}`)
      break
    }
    if (Object.keys(data).length === 0) break
    const { count } = await prisma.merchant.updateMany({
      where: {
        id: current.id,
        shopifyToken: current.shopifyToken,
        shopifyRefreshToken: current.shopifyRefreshToken,
        storefrontToken: current.storefrontToken,
      },
      data,
    })
    if (count === 1) {
      reencrypted++
      break
    }
    if (++attempts >= MAX_ATTEMPTS) {
      failures.push(`${current.shopifyDomain}: tokens kept changing during re-encryption, run the script again`)
      break
    }
    merchant = await prisma.merchant.findUnique({ where: { id: current.id }, select: selectTokens })
  }
}

console.log(`[Reencrypt] ${reencrypted} merchant(s) re-encrypted, ${failures.length} failure(s)`)
for (const failure of failures) console.error(`[Reencrypt] ${failure}`)
await prisma.$disconnect()
process.exit(failures.length > 0 ? 1 : 0)
