import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.join(__dirname, '../..')

// No script-src/style-src here: Next.js injects inline bootstrap scripts and
// styles that a strict policy would block without a nonce pipeline.
const contentSecurityPolicy = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
]

// Pages and routes that carry single-use credentials in the URL.
const noReferrerHeaders = [{ key: 'Referrer-Policy', value: 'no-referrer' }]

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client'],
  outputFileTracingRoot: monorepoRoot,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.shopify.com' },
      { protocol: 'https', hostname: '**.myshopify.com' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
    ],
  },
  async headers() {
    // When several entries set the same header, the last matching entry wins.
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/invite/:path*', headers: noReferrerHeaders },
      { source: '/session/:path*', headers: noReferrerHeaders },
      { source: '/api/session/merchant', headers: noReferrerHeaders },
    ]
  },
}

export default nextConfig
