import { describe, expect, it } from 'vitest'
import { assertRuntimeSecrets, decodeCanonicalKey, isPlaceholderSecret } from '../lib/secrets.js'

const HEX_KEY = 'ab'.repeat(32)

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

  it('rejects a blank Shopify secret in production but not in MCP mode', () => {
    const production = { ENCRYPTION_KEY: HEX_KEY, NODE_ENV: 'production', SHOPIFY_API_SECRET: '   ' }
    expect(() => assertRuntimeSecrets(production)).toThrow(/SHOPIFY_API_SECRET/)
    expect(() => assertRuntimeSecrets(production, { mode: 'mcp' })).not.toThrow()
  })
})
