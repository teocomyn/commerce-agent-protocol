import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.join(__dirname, '../..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: monorepoRoot,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
