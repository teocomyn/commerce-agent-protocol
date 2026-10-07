import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://cap-protocol.org'),
  title: {
    default: 'CAP — Commerce Agent Protocol',
    template: '%s — CAP',
  },
  description:
    'An open protocol that lets AI agents search, compare and start a checkout that the shopper completes. Open spec and Apache 2.0 reference implementation, Shopify today.',
  keywords: [
    'commerce agent protocol',
    'CAP',
    'AI commerce',
    'agent commerce',
    'MCP',
    'shopping agents',
    'agent shopping',
    'shopify agent',
    'open protocol',
    'AI shopping',
  ],
  authors: [{ name: 'Teo Comyn', url: 'https://github.com/teocomyn' }],
  creator: 'Teo Comyn',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://cap-protocol.org',
    title: 'CAP — Commerce Agent Protocol',
    description:
      'Open protocol for AI agents to search, compare and start checkout on Shopify catalogs. Built in public.',
    siteName: 'Commerce Agent Protocol',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CAP — Commerce Agent Protocol',
    description:
      'Open protocol for AI agents to search, compare and start checkout on Shopify catalogs. Built in public.',
    creator: '@teocomyn',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050505',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans bg-void text-fg antialiased">
        {children}
      </body>
    </html>
  )
}
