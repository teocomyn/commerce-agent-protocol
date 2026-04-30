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
    'The open protocol that lets AI agents actually buy things. Neutral infrastructure between e-commerce catalogs and shopping agents.',
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
      'The open protocol that lets AI agents actually buy things. Built in public.',
    siteName: 'Commerce Agent Protocol',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CAP — Commerce Agent Protocol',
    description:
      'The open protocol that lets AI agents actually buy things. Built in public.',
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
