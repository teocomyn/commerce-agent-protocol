import type { ConnectionOptions } from 'bullmq'

/**
 * BullMQ / ioredis connection aligned with {@link REDIS_URL} (same as cache layer).
 * Supports `redis://`, `rediss://`, optional username/password (e.g. Upstash).
 */
export function getBullMQConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL?.trim()
  if (raw) {
    try {
      const u = new URL(raw)
      const port = u.port !== '' ? Number(u.port) : 6379

      const conn: ConnectionOptions = {
        host: u.hostname || 'localhost',
        port,
        maxRetriesPerRequest: null,
      }

      if (u.password) conn.password = decodeURIComponent(u.password)
      if (u.username && u.username !== '') conn.username = decodeURIComponent(u.username)
      if (u.protocol === 'rediss:') conn.tls = {}

      return conn
    } catch {
      console.warn('[Redis] REDIS_URL parse failed, falling back to REDIS_HOST / REDIS_PORT')
    }
  }

  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  }
}
