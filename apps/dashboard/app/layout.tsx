import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CAP Dashboard — Commerce Agent Protocol',
  description: 'Make your products visible to AI shopping agents',
  robots: 'noindex', // Dashboard is private
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
