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
// even more; '1234…' or 'a'.repeat(32) is not a secret.
const MIN_DISTINCT_CHARACTERS = 12

function isTriviallyGuessable(value: string): boolean {
  return new Set(value).size < MIN_DISTINCT_CHARACTERS
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
  } else if (!decodeCanonicalKey(encryptionKey)) {
    if (Buffer.byteLength(encryptionKey, 'utf8') < 32) {
      errors.push('ENCRYPTION_KEY must contain at least 32 bytes. Generate one with `openssl rand -hex 32`.')
    } else if (isTriviallyGuessable(encryptionKey)) {
      errors.push('ENCRYPTION_KEY is trivially guessable. Generate one with `openssl rand -hex 32`.')
    } else if (production) {
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
    (!decodeCanonicalKey(previousKey) && Buffer.byteLength(previousKey, 'utf8') < 32)
  )) {
    errors.push('ENCRYPTION_KEY_PREVIOUS must be the previous 32-byte key (not an example or shorter value).')
  }

  if (mode !== 'mcp') {
    const operationsToken = env['CAP_OPERATIONS_TOKEN']
    if (operationsToken && (
      operationsToken.length < 32 || isPlaceholderSecret(operationsToken) || isTriviallyGuessable(operationsToken)
    )) {
      errors.push('CAP_OPERATIONS_TOKEN must be a random value of at least 32 characters (`openssl rand -hex 32`).')
    }

    const shopifySecret = env['SHOPIFY_API_SECRET']?.trim()
    if (production && (!shopifySecret || isPlaceholderSecret(shopifySecret))) {
      errors.push('SHOPIFY_API_SECRET must be set to the Shopify app secret in production.')
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`)
  }
}
