import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Coding Platform',
  description: 'Practice coding problems',
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
