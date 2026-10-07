// ============================================================
// SECRET VALIDATION
// ============================================================
// Example values from .env.example are long enough to pass length checks, so
// they must be rejected explicitly or a copied config would ship public keys.

const PLACEHOLDER_PATTERNS = [/change_?me/i, /^your_/i, /replace[-_]with/i]

export function isPlaceholderSecret(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))
}

/**
 * Decodes a full-entropy 32-byte key: 64 hex characters or base64/base64url
 * of 32 bytes (`openssl rand -hex 32` / `openssl rand -base64 32`).
 */
export function decodeCanonicalKey(raw: string): Buffer | null {
  const value = raw.trim()
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex')
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(value)) {
    const decoded = Buffer.from(value, 'base64')
    if (decoded.length === 32) return decoded
  }
  return null
}

// Random output of `openssl rand -hex 32` has 16 distinct characters, base64
// even more; '1234…', 'a'.repeat(32) or a short block repeated is not a secret.
const MIN_DISTINCT_CHARACTERS = 12

// True when the text is a block of at most half its length, repeated.
function isRepeatedBlock(value: string): boolean {
  for (let period = 1; period <= value.length / 2; period++) {
    let repeats = true
    for (let index = period; index < value.length && repeats; index++) {
      repeats = value[index] === value[index - period]
    }
    if (repeats) return true
  }
  return false
}

// 32 random bytes hold about 30 distinct values and no arithmetic run; hex or
// base64 of 0x00..0x1f or of one repeated byte decodes to a guessable key.
function isWeakKeyMaterial(key: Buffer): boolean {
  if (new Set(key).size < 16) return true
  const step = (key[1]! - key[0]! + 256) % 256
  return key.every((byte, index) => index === 0 || (byte - key[index - 1]! + 256) % 256 === step)
}

function isTriviallyGuessable(raw: string): boolean {
  // Checked on the value that is actually used: decoding trims whitespace.
  const value = raw.trim()
  const decoded = decodeCanonicalKey(value)
  if (decoded && isWeakKeyMaterial(decoded)) return true
  return new Set(value).size < MIN_DISTINCT_CHARACTERS || isRepeatedBlock(value)
}

let legacyKeyWarningShown = false

export interface RuntimeSecretOptions {
  /**
   * `mcp`: the stdio MCP server never serves HTTP, so the Shopify app secret
   * and the operations token are not required there.
   */
  mode?: 'http' | 'mcp' | 'worker'
}

/**
 * Fails fast at process start instead of on the first OAuth or checkout.
 * Production requires a canonical 32-byte encryption key; other environments
 * accept the legacy "32+ character string" format with a warning.
 */
export function assertRuntimeSecrets(
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeSecretOptions = {},
): void {
  const production = env['NODE_ENV'] === 'production'
  const mode = options.mode ?? 'http'
  const errors: string[] = []

  const encryptionKey = env['ENCRYPTION_KEY'] ?? ''
  if (!encryptionKey) {
    errors.push('ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32`.')
  } else if (isPlaceholderSecret(encryptionKey)) {
    errors.push('ENCRYPTION_KEY still contains the example value. Generate one with `openssl rand -hex 32`.')
  } else if (!decodeCanonicalKey(encryptionKey) && Buffer.byteLength(encryptionKey, 'utf8') < 32) {
    errors.push('ENCRYPTION_KEY must contain at least 32 bytes. Generate one with `openssl rand -hex 32`.')
  } else if (isTriviallyGuessable(encryptionKey)) {
    // Applies to every format: '1'.repeat(64) is valid hex but not a secret.
    errors.push('ENCRYPTION_KEY is trivially guessable. Generate one with `openssl rand -hex 32`.')
  } else if (!decodeCanonicalKey(encryptionKey)) {
    if (production) {
      errors.push(
        'ENCRYPTION_KEY must be 64 hex characters or base64 of 32 bytes in production. ' +
        'Move the current value to ENCRYPTION_KEY_PREVIOUS so existing tokens stay readable.',
      )
    } else if (!legacyKeyWarningShown) {
      legacyKeyWarningShown = true
      console.warn('[Config] ENCRYPTION_KEY uses the legacy string format; use `openssl rand -hex 32`.')
    }
  }

  // Validated as strictly as the current key: an unusable previous key would
  // otherwise only fail on the first decryption.
  const previousKey = env['ENCRYPTION_KEY_PREVIOUS']
  if (previousKey && (
    isPlaceholderSecret(previousKey) ||
    isTriviallyGuessable(previousKey) ||
    (!decodeCanonicalKey(previousKey) && Buffer.byteLength(previousKey, 'utf8') < 32)
  )) {
    errors.push('ENCRYPTION_KEY_PREVIOUS must be the previous 32-byte key (not an example or shorter value).')
  }

  if (mode !== 'mcp') {
    const operationsToken = env['CAP_OPERATIONS_TOKEN']
    // Workers never serve the operations endpoints; the production API must
    // have the token, or every /internal/operations call answers 503.
    if (production && mode === 'http' && !operationsToken?.trim()) {
      errors.push('CAP_OPERATIONS_TOKEN must be set in production (`openssl rand -hex 32`).')
    }
    if (operationsToken && (
      operationsToken.length < 32 || isPlaceholderSecret(operationsToken) || isTriviallyGuessable(operationsToken)
    )) {
      errors.push('CAP_OPERATIONS_TOKEN must be a random value of at least 32 characters (`openssl rand -hex 32`).')
    }

    const shopifySecret = env['SHOPIFY_API_SECRET']?.trim()
    if (production && (!shopifySecret || isPlaceholderSecret(shopifySecret))) {
      errors.push('SHOPIFY_API_SECRET must be set to the Shopify app secret in production.')
    }
    // Sent as client_id on install and token refresh: an example value only
    // fails once Shopify rejects the first install.
    const shopifyKey = env['SHOPIFY_API_KEY']?.trim()
    if (production && (!shopifyKey || isPlaceholderSecret(shopifyKey))) {
      errors.push('SHOPIFY_API_KEY must be set to the Shopify app client id in production.')
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`)
  }
}
