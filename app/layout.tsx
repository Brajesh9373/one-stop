import { Analytics } from '@vercel/analytics/next'
import { DM_Mono, DM_Sans, Space_Grotesk } from 'next/font/google'
import type { Metadata, Viewport } from 'next'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-dm-mono' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })
import './globals.css'

export const metadata: Metadata = {
  title: 'OneStop — The Agentic AI Classroom, Everywhere.',
  description: 'OneStop brings lectures, academic knowledge, and intelligent learning companions into one focused workspace.',
  generator: 'OneStop',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#171923' }],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${dmSans.variable} ${dmMono.variable} ${spaceGrotesk.variable} antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
