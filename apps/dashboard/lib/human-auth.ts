import crypto from 'node:crypto'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000

export const MIN_HUMAN_PASSWORD_LENGTH = 12
export const MAX_HUMAN_PASSWORD_LENGTH = 256

interface ScryptParams {
  N: number
  r: number
  p: number
}

// Current format: scrypt$N=32768,r=8,p=1$<salt base64>$<key base64>.
// The parameters travel with each hash so they can be raised later; verification
// always uses the stored parameters and needsRehash() flags weaker hashes.
const SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1 }
const SCRYPT_KEY_LENGTH = 64
const SCRYPT_SALT_BYTES = 16
// scrypt needs about 128 * N * r bytes (32 MiB here). That exceeds Node's 32 MiB
// default maxmem once OpenSSL's bookkeeping is added, so scrypt would throw.
const SCRYPT_MAXMEM = 64 * 1024 * 1024

// Legacy format: scrypt$<hex salt>$<64 hex chars>. The hex text itself was the
// salt, with Node's defaults (N=16384, r=8, p=1) and a 32-byte key.
const LEGACY_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 14, r: 8, p: 1 }

const PARAMS_PATTERN = /^N=(\d{1,8}),r=(\d{1,3}),p=(\d{1,3})$/
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

interface ParsedPasswordHash {
  params: ScryptParams
  salt: Buffer | string
  key: Buffer
  legacy: boolean
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function validateHumanPassword(value: string): string | null {
  if (value.length < MIN_HUMAN_PASSWORD_LENGTH) {
    return `Password must contain at least ${MIN_HUMAN_PASSWORD_LENGTH} characters`
  }
  if (value.length > MAX_HUMAN_PASSWORD_LENGTH) {
    return `Password must contain at most ${MAX_HUMAN_PASSWORD_LENGTH} characters`
  }
  return null
}

function deriveKey(
  password: string,
  salt: Buffer | string,
  keyLength: number,
  params: ScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    )
  })
}

function formatPasswordHash(params: ScryptParams, salt: Buffer, key: Buffer): string {
  return `scrypt$N=${params.N},r=${params.r},p=${params.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

function isSupportedParams({ N, r, p }: ScryptParams): boolean {
  // N must be a power of two; the upper bounds keep a corrupted row from
  // asking for an unbounded amount of work (maxmem still caps memory).
  return N >= 2 && N <= 2 ** 20 && (N & (N - 1)) === 0 && r >= 1 && r <= 32 && p >= 1 && p <= 16
}

function parsePasswordHash(stored: string): ParsedPasswordHash | null {
  const parts = stored.split('$')
  if (parts[0] !== 'scrypt') return null

  if (parts.length === 3) {
    const [, salt, keyHex] = parts
    if (!salt || !keyHex || !/^[a-f0-9]{64}$/.test(keyHex)) return null
    return { params: LEGACY_SCRYPT_PARAMS, salt, key: Buffer.from(keyHex, 'hex'), legacy: true }
  }

  if (parts.length !== 4) return null
  const [, paramText, saltText, keyText] = parts
  const match = PARAMS_PATTERN.exec(paramText ?? '')
  if (!match || !saltText || !keyText || !BASE64_PATTERN.test(saltText) || !BASE64_PATTERN.test(keyText)) {
    return null
  }
  const params = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) }
  const salt = Buffer.from(saltText, 'base64')
  const key = Buffer.from(keyText, 'base64')
  if (!isSupportedParams(params) || salt.length === 0 || key.length < 16 || key.length > 128) {
    return null
  }
  return { params, salt, key, legacy: false }
}

export async function hashHumanPassword(password: string): Promise<string> {
  const validationError = validateHumanPassword(password)
  if (validationError) throw new Error(validationError)
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
  const key = await deriveKey(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_PARAMS)
  return formatPasswordHash(SCRYPT_PARAMS, salt, key)
}

/**
 * Hash in the current format that matches no password. Verifying against it
 * costs the same as a real account, so unknown emails are not faster to reject.
 */
export const DUMMY_PASSWORD_HASH = formatPasswordHash(
  SCRYPT_PARAMS,
  Buffer.alloc(SCRYPT_SALT_BYTES),
  Buffer.alloc(SCRYPT_KEY_LENGTH),
)

// While legacy hashes (N=2^14) are still being upgraded, verification of a
// legacy hash is cheaper than of a current one or of the dummy used for
// unknown emails, which would let response times reveal which accounts exist.
// Every verification therefore also runs the derivation of the other format,
// in parallel, so all paths cost the same. Remove once no legacy hash remains.
const PAD_LEGACY_TIMING = true

async function timingPad(legacy: boolean, password: string): Promise<void> {
  if (!PAD_LEGACY_TIMING) return
  const params = legacy ? SCRYPT_PARAMS : LEGACY_SCRYPT_PARAMS
  const keyLength = legacy ? SCRYPT_KEY_LENGTH : 32
  await deriveKey(password, Buffer.alloc(SCRYPT_SALT_BYTES), keyLength, params).catch(() => undefined)
}

export async function verifyHumanPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > MAX_HUMAN_PASSWORD_LENGTH) return false
  const parsed = parsePasswordHash(stored)
  if (!parsed) return false

  let derived: Buffer
  try {
    ;[derived] = await Promise.all([
      deriveKey(password, parsed.salt, parsed.key.length, parsed.params),
      timingPad(parsed.legacy, password),
    ])
  } catch {
    return false
  }
  return derived.length === parsed.key.length && crypto.timingSafeEqual(derived, parsed.key)
}

/**
 * True when a stored hash uses the legacy format or weaker parameters than
 * hashHumanPassword() produces today. Call it only after a successful
 * verification, then store a fresh hash of the same password.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parsePasswordHash(stored)
  if (!parsed || parsed.legacy) return true
  const { params, salt, key } = parsed
  return (
    params.N < SCRYPT_PARAMS.N ||
    params.r < SCRYPT_PARAMS.r ||
    params.p < SCRYPT_PARAMS.p ||
    salt.length < SCRYPT_SALT_BYTES ||
    key.length < SCRYPT_KEY_LENGTH
  )
}

export function createInvitationCredential(nowMs = Date.now()): {
  token: string
  tokenHash: string
  expiresAt: Date
} {
  const token = crypto.randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(nowMs + INVITATION_TTL_MS),
  }
}

export function isInvitationTokenFormat(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
