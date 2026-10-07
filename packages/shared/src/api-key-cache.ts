// API key lookups are cached in Redis under the key hash, never the secret.
// The API (which fills the cache) and the dashboard (which revokes keys) share
// these values so the revocation notice matches the real cache window.
//
// Invalidation writes a tombstone instead of deleting the entry, and lookups
// fill the cache with SET NX: a lookup that read the key from Postgres just
// before it was revoked can no longer recreate an active entry afterwards.
export const API_KEY_CACHE_TTL_SECONDS = 60
export const API_KEY_CACHE_TOMBSTONE = 'invalidated'

// v2: entries written by releases before the tombstone scheme (5-minute TTL,
// no tombstone) live under `apikey:<hash>` and are never read again.
export const apiKeyCacheKey = (keyHash: string) => `apikey:v2:${keyHash}`
export const apiKeyRateLimitKey = (keyHash: string) => `rl:${keyHash}`
