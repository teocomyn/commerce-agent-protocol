// Re-encrypts every stored Shopify token with the current ENCRYPTION_KEY.
// Run it after a key rotation, while ENCRYPTION_KEY_PREVIOUS still holds the
// old key, then remove ENCRYPTION_KEY_PREVIOUS from every service. Token
// refreshes only re-encrypt the admin tokens; storefront tokens need this.
import { prisma } from '@cap/db'
import { decryptToken, encryptToken } from '../lib/shopify.js'
import { assertRuntimeSecrets } from '../lib/secrets.js'

assertRuntimeSecrets(process.env, { mode: 'mcp' })

const TOKEN_FIELDS = ['shopifyToken', 'shopifyRefreshToken', 'storefrontToken'] as const

const merchants = await prisma.merchant.findMany({
  select: { id: true, shopifyDomain: true, shopifyToken: true, shopifyRefreshToken: true, storefrontToken: true },
})

let reencrypted = 0
const failures: string[] = []
for (const merchant of merchants) {
  const data: Partial<Record<(typeof TOKEN_FIELDS)[number], string>> = {}
  try {
    for (const field of TOKEN_FIELDS) {
      const ciphertext = merchant[field]
      if (ciphertext) data[field] = encryptToken(decryptToken(ciphertext))
    }
  } catch (error) {
    failures.push(`${merchant.shopifyDomain}: ${error instanceof Error ? error.message : String(error)}`)
    continue
  }
  if (Object.keys(data).length === 0) continue
  await prisma.merchant.update({ where: { id: merchant.id }, data })
  reencrypted++
}

console.log(`[Reencrypt] ${reencrypted} merchant(s) re-encrypted, ${failures.length} failure(s)`)
for (const failure of failures) console.error(`[Reencrypt] ${failure}`)
await prisma.$disconnect()
process.exit(failures.length > 0 ? 1 : 0)
