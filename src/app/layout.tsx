import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Outfit, Inter } from 'next/font/google';
import '@/app/globals.css';
import '@radix-ui/themes/styles.css';
import { Providers } from './providers';
import messages from '@/messages/en.json';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeScript } from '@/components/theme/theme-script';
import { PageWrapper } from '@/components/layout/page-wrapper';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  adjustFontFallback: true,
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  adjustFontFallback: true,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d14' }
  ]
};

export const metadata: Metadata = {
  title: {
    default: "Ascenda — Find universities you'll actually get into",
    template: '%s | Ascenda'
  },
  description: "Find universities you'll actually get into. Real fit scores, real deadlines, real plans — built for ambitious students.",
  openGraph: {
    title: 'Ascenda — Find universities you\'ll actually get into',
    description: "Find universities you'll actually get into. Real fit scores, real deadlines, real plans — built for ambitious students.",
    siteName: 'Ascenda',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ascenda — Find universities you\'ll actually get into',
    description: "Find universities you'll actually get into. Real fit scores, real deadlines, real plans — built for ambitious students."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={cn(
        "min-h-screen bg-background font-sans antialiased",
        outfit.variable,
        inter.variable
      )}>
        <a
          href="#main-content"
          className="absolute left-4 top-4 -translate-y-16 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground shadow focus-visible:translate-y-0 z-50"
        >
          Skip to content
        </a>
        <ThemeProvider>
          {/* overflow-x-clip (not overflow-hidden): clips decorative blob overflow without creating a
              scroll container, which would neutralise every position:sticky element in the app */}
          <div className="relative min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground">
            <Providers messages={messages}>
              <PageWrapper>
                {children}
              </PageWrapper>
            </Providers>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
