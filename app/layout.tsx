import type { Metadata } from 'next'
import { AuthProvider } from '@/components/auth/AuthProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'SubzCreator - Transcription & Subtitling Platform',
  description: 'Professional transcription and subtitling platform for audio and video content',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-base text-text-primary">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
