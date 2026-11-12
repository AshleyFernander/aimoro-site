import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { ThemeProvider } from '@/components/ThemeProvider'
import { AuthProvider } from '@/components/AuthProvider'

const DESCRIPTION = 'Products sourced from China, delivered to your door in The Bahamas. Bulk, branded or just one item: tell us what you need, get one clear quote, and we handle the rest.'

export const metadata: Metadata = {
  metadataBase: new URL('https://aimoro.co'),
  title: 'AIMORO · Sourced from China, delivered to your door in The Bahamas',
  description: DESCRIPTION,
  manifest: '/manifest.json',
  icons: { icon: '/favicon.png', apple: '/favicon.png' },
  openGraph: {
    type: 'website',
    url: 'https://aimoro.co',
    siteName: 'AIMORO',
    title: 'AIMORO · Sourced from China, delivered to your door',
    description: DESCRIPTION,
    images: [{ url: '/AimoroLogo.png', width: 500, height: 500, alt: 'AIMORO' }],
  },
  twitter: { card: 'summary', title: 'AIMORO', description: DESCRIPTION, images: ['/AimoroLogo.png'] },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Anti-FOUC: apply saved theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('aimoro_theme');if(t==='dark')document.documentElement.classList.add('dark')})()`,
          }}
        />
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AIMORO" />
        <link rel="apple-touch-icon" href="/favicon.png" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
