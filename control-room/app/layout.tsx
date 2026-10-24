import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BahnOS',
  description:
    'The deliveries whose records cannot settle themselves, and everything the agents already handled.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
