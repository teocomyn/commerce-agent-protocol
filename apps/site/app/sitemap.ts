import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://cap-protocol.org'
  const now = new Date()
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
  ]
}
