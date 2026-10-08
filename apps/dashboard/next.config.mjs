import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.join(__dirname, '../..')

const development = process.env.NODE_ENV !== 'production'

// Every resource type is limited to the origins the dashboard really uses:
// itself, Google Fonts and Shopify product images. Scripts still allow
// 'unsafe-inline' because Next.js injects inline bootstrap scripts that only a
// per-request nonce pipeline could authorize; external script origins and
// exfiltration targets (connect, img) are blocked all the same.
const contentSecurityPolicy = [
  "default-src 'self'",
  // Development only: React Refresh evaluates code and HMR uses a websocket.
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.shopify.com https://*.myshopify.com",
  // The font origins are listed for the <link rel="preconnect"> hints in
  // app/layout.tsx, which browsers check against connect-src.
  `connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com${development ? ' ws: wss:' : ''}`,
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
