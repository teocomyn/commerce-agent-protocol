import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assertRuntimeSecrets, decodeCanonicalKey, isPlaceholderSecret } from '../lib/secrets.js'

const HEX_KEY = '9c4e1a7f03b58d26e1f4a0c97b3d5e28f60a1c4b7d92e3f5081b6c4a9d7e2f3c'
const OPS_TOKEN = '5d0c8e2a9f417b3e6c1d0a8f2e4b7c9d1a3f5e7b'

describe('runtime secret validation', () => {
  it('detects the example values shipped in .env.example', () => {
    expect(isPlaceholderSecret('change_me_to_a_32_byte_random_key_!!')).toBe(true)
    expect(isPlaceholderSecret('your_shopify_api_secret')).toBe(true)
    expect(isPlaceholderSecret('replace-with-staging-secret')).toBe(true)
    expect(isPlaceholderSecret(HEX_KEY)).toBe(false)
  })

  it('decodes hex and base64 keys of exactly 32 bytes', () => {
    expect(decodeCanonicalKey(HEX_KEY)?.length).toBe(32)
    expect(decodeCanonicalKey(Buffer.alloc(32, 7).toString('base64'))?.length).toBe(32)
    const urlSafe = Buffer.alloc(32, 0xfb).toString('base64url')
    expect(urlSafe).toMatch(/[-_]/)
    expect(decodeCanonicalKey(urlSafe)?.length).toBe(32)
    expect(decodeCanonicalKey('ab'.repeat(16))).toBeNull()
    expect(decodeCanonicalKey('ci-only-32-byte-encryption-key!!')).toBeNull()
  })

  it('rejects a missing, example or short encryption key', () => {
    expect(() => assertRuntimeSecrets({})).toThrow(/ENCRYPTION_KEY is not set/)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: 'change_me_to_a_32_byte_random_key_!!' }))
      .toThrow(/example value/)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: 'short' })).toThrow(/at least 32 bytes/)
  })

  it('requires a canonical key in production but tolerates legacy keys elsewhere', () => {
    const legacy = 'legacy-random-string-with-32-bytes!!'
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: legacy, NODE_ENV: 'development' })).not.toThrow()
    expect(() => assertRuntimeSecrets({
      ENCRYPTION_KEY: legacy,
      NODE_ENV: 'production',
      SHOPIFY_API_SECRET: 'shopify-secret',
    })).toThrow(/ENCRYPTION_KEY_PREVIOUS/)
    expect(() => assertRuntimeSecrets({
      ENCRYPTION_KEY: HEX_KEY,
      NODE_ENV: 'production',
      SHOPIFY_API_SECRET: 'shopify-secret',
      SHOPIFY_API_KEY: 'shopify-client-id',
      CAP_OPERATIONS_TOKEN: OPS_TOKEN,
    })).not.toThrow()
  })

  it('rejects example operations tokens and Shopify secrets in production', () => {
    expect(() => assertRuntimeSecrets({
      ENCRYPTION_KEY: HEX_KEY,
      CAP_OPERATIONS_TOKEN: 'change_me_to_a_random_operations_secret',
    })).toThrow(/CAP_OPERATIONS_TOKEN/)
    expect(() => assertRuntimeSecrets({
      ENCRYPTION_KEY: HEX_KEY,
      NODE_ENV: 'production',
      SHOPIFY_API_SECRET: 'your_shopify_api_secret',
    })).toThrow(/SHOPIFY_API_SECRET/)
  })

  it('rejects an unusable previous key and trivially guessable values at boot', () => {
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: HEX_KEY, ENCRYPTION_KEY_PREVIOUS: 'abc' }))
      .toThrow(/ENCRYPTION_KEY_PREVIOUS/)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: HEX_KEY, ENCRYPTION_KEY_PREVIOUS: 'legacy-random-string-with-32-bytes!!' }))
      .not.toThrow()
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: '12345678901234567890123456789012' }))
      .toThrow(/trivially guessable/)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: HEX_KEY, CAP_OPERATIONS_TOKEN: 'a'.repeat(40) }))
      .toThrow(/CAP_OPERATIONS_TOKEN/)
  })

  it('rejects guessable keys even in the canonical hex or base64 format', () => {
    expect(decodeCanonicalKey('1'.repeat(64))?.length).toBe(32)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: '1'.repeat(64) })).toThrow(/trivially guessable/)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: 'ab'.repeat(32) })).toThrow(/trivially guessable/)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: HEX_KEY, ENCRYPTION_KEY_PREVIOUS: 'c3'.repeat(32) }))
      .toThrow(/ENCRYPTION_KEY_PREVIOUS/)
    // base64 of one repeated byte, and base64 of the bytes 0x00..0x1f (many
    // distinct characters, but a guessable key once decoded).
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') }))
      .toThrow(/trivially guessable/)
    const sequence = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64')
    expect(new Set(sequence).size).toBeGreaterThanOrEqual(12)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: sequence })).toThrow(/trivially guessable/)
    // Surrounding whitespace is trimmed before decoding, so it adds no entropy.
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: ` \t${'1'.repeat(64)}\n` })).toThrow(/trivially guessable/)
    // A short block repeated has many distinct characters but no entropy.
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: 'abcdefghijklm'.repeat(3) })).toThrow(/trivially guessable/)
    expect(() => assertRuntimeSecrets({ ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') })).not.toThrow()
  })

  it('rejects a missing or example Shopify client id in production', () => {
    const production = { ENCRYPTION_KEY: HEX_KEY, NODE_ENV: 'production', SHOPIFY_API_SECRET: 'shopify-secret' }
    expect(() => assertRuntimeSecrets(production)).toThrow(/SHOPIFY_API_KEY/)
    expect(() => assertRuntimeSecrets({ ...production, SHOPIFY_API_KEY: 'your_shopify_api_key' })).toThrow(/SHOPIFY_API_KEY/)
    expect(() => assertRuntimeSecrets({ ...production, SHOPIFY_API_KEY: 'shopify-client-id', CAP_OPERATIONS_TOKEN: OPS_TOKEN }))
      .not.toThrow()
    expect(() => assertRuntimeSecrets(production, { mode: 'mcp' })).not.toThrow()
  })

  it('requires the operations token on the production API only', () => {
    const production = {
      ENCRYPTION_KEY: HEX_KEY,
      NODE_ENV: 'production',
      SHOPIFY_API_SECRET: 'shopify-secret',
      SHOPIFY_API_KEY: 'shopify-client-id',
    }
    expect(() => assertRuntimeSecrets(production)).toThrow(/CAP_OPERATIONS_TOKEN must be set/)
    expect(() => assertRuntimeSecrets(production, { mode: 'worker' })).not.toThrow()
    expect(() => assertRuntimeSecrets(production, { mode: 'mcp' })).not.toThrow()
  })

  it('skips operations token checks in MCP mode only', () => {
    const weakToken = { ENCRYPTION_KEY: HEX_KEY, CAP_OPERATIONS_TOKEN: 'a'.repeat(40) }
    expect(() => assertRuntimeSecrets(weakToken, { mode: 'mcp' })).not.toThrow()
    expect(() => assertRuntimeSecrets(weakToken, { mode: 'http' })).toThrow(/CAP_OPERATIONS_TOKEN/)
  })

  it('rejects a blank Shopify secret in production but not in MCP mode', () => {
    const production = { ENCRYPTION_KEY: HEX_KEY, NODE_ENV: 'production', SHOPIFY_API_SECRET: '   ' }
    expect(() => assertRuntimeSecrets(production)).toThrow(/SHOPIFY_API_SECRET/)
    expect(() => assertRuntimeSecrets(production, { mode: 'mcp' })).not.toThrow()
  })
})
