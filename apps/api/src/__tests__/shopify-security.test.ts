import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildInstallUrl,
  decryptToken,
  encryptToken,
  isValidShopDomain,
  validateGrantedScopes,
  verifyShopifyOAuthHmac,
  verifyShopifyWebhook,
} from '../lib/shopify.js'

describe('Shopify security helpers', () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_SECRET = 'shopify-secret'
    process.env.SHOPIFY_API_KEY = 'client-id'
    process.env.SHOPIFY_SCOPES = 'read_products,read_inventory,read_orders'
    process.env.SHOPIFY_APP_URL = 'https://api.example.test'
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012'
  })

  afterEach(() => {
    delete process.env.SHOPIFY_API_SECRET
  })

  it.each([
    ['valid-store.myshopify.com', true],
    ['a.myshopify.com', true],
    ['-bad.myshopify.com', false],
    ['bad_.myshopify.com', false],
    ['evil.com', false],
    ['valid-store.myshopify.com.evil.test', false],
  ])('validates shop domain %s', (shop, valid) => {
    expect(isValidShopDomain(shop)).toBe(valid)
  })

  it('accepts a correct webhook HMAC', () => {
    const body = '{"id":1}'
    const hmac = crypto.createHmac('sha256', 'shopify-secret').update(body).digest('base64')
    expect(verifyShopifyWebhook(body, hmac)).toBe(true)
  })

  it('rejects incorrect and malformed webhook HMACs', () => {
    expect(verifyShopifyWebhook('{}', 'bad')).toBe(false)
    expect(verifyShopifyWebhook('{}', undefined)).toBe(false)
  })

  it('encrypts tokens with randomized authenticated encryption', () => {
    const first = encryptToken('shpat_secret')
    const second = encryptToken('shpat_secret')
    expect(first).not.toBe(second)
    expect(decryptToken(first)).toBe('shpat_secret')
    expect(decryptToken(second)).toBe('shpat_secret')
  })

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptToken('secret')
    const [version, iv, tag, ciphertext] = encrypted.split(':')
    expect(version).toBe('v2')
    const tamperedTag = `${tag?.startsWith('0') ? '1' : '0'}${tag?.slice(1)}`
    expect(() => decryptToken(`${version}:${iv}:${tamperedTag}:${ciphertext}`)).toThrow()
  })

  it('uses the full 32 bytes of a hex key and still reads legacy ciphertexts', () => {
    const hexKey = 'a1'.repeat(32)
    process.env.ENCRYPTION_KEY = hexKey
    // Legacy v1 format: first 32 UTF-8 bytes of the key string, 16-byte IV, no prefix.
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'utf8').subarray(0, 32), iv)
    const encrypted = Buffer.concat([cipher.update('legacy-token', 'utf8'), cipher.final()])
    const legacy = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`
    expect(decryptToken(legacy)).toBe('legacy-token')

    const current = encryptToken('current-token')
    process.env.ENCRYPTION_KEY = 'a1'.repeat(16) + 'b2'.repeat(16)
    expect(() => decryptToken(current)).toThrow()
    process.env.ENCRYPTION_KEY = hexKey
    expect(decryptToken(current)).toBe('current-token')
  })

  it('reads tokens encrypted with the previous key during rotation', () => {
    process.env.ENCRYPTION_KEY = 'c3'.repeat(32)
    const beforeRotation = encryptToken('rotated-token')
    process.env.ENCRYPTION_KEY_PREVIOUS = process.env.ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY = 'd4'.repeat(32)
    try {
      expect(decryptToken(beforeRotation)).toBe('rotated-token')
    } finally {
      delete process.env.ENCRYPTION_KEY_PREVIOUS
      process.env.ENCRYPTION_KEY = '12345678901234567890123456789012'
    }
  })

  it('rejects an undersized encryption key', () => {
    process.env.ENCRYPTION_KEY = 'short'
    expect(() => encryptToken('secret')).toThrow(/32 bytes/)
  })

  it('reports missing requested scopes', () => {
    expect(validateGrantedScopes(['read_products'])).toEqual(['read_inventory', 'read_orders'])
  })

  it('accepts all requested scopes regardless of order', () => {
    expect(validateGrantedScopes(['read_orders', 'read_products', 'read_inventory'])).toEqual([])
  })

  it('builds an offline OAuth URL without per-user access mode', () => {
    const url = new URL(buildInstallUrl('valid-store.myshopify.com', 'nonce'))
    expect(url.searchParams.get('state')).toBe('nonce')
    expect(url.searchParams.has('grant_options[]')).toBe(false)
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.example.test/shopify/callback')
  })

  it('validates a canonical Shopify OAuth callback HMAC', () => {
    const params = {
      code: '0907a61c0c8d55e99db179b68161bc00',
      shop: 'valid-store.myshopify.com',
      state: 'nonce-value',
      timestamp: '1337178173',
    }
    const message = Object.entries(params)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&')
    const hmac = crypto.createHmac('sha256', 'shopify-secret').update(message).digest('hex')
    expect(verifyShopifyOAuthHmac({ ...params, hmac })).toBe(true)
    expect(verifyShopifyOAuthHmac({ ...params, hmac: `${hmac.slice(0, -1)}0` })).toBe(false)
  })
})
