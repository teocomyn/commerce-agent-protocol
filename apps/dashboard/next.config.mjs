/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.shopify.com' },
      { protocol: 'https', hostname: '**.myshopify.com' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/cap/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/:path*`,
      },
    ]
  },
}

export default nextConfig
