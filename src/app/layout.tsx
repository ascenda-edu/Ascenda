import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Outfit, Inter } from 'next/font/google';
import '@/app/globals.css';
import { Providers } from './providers';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeScript } from '@/components/theme/theme-script';

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
  // The resolved `--background` token (globals.css): light 0 0% 95.9%, dark
  // 0 0% 8.3%. A meta tag cannot read a CSS var, so this is a hand-synced copy —
  // one of FOUR (globals.css, scripts/tone-solver.mjs, here, and THEME_COLOR in
  // components/theme/theme-provider.tsx, which overwrites this tag on the client
  // once a preference is resolved). Change one, change all four.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f4' },
    { media: '(prefers-color-scheme: dark)', color: '#151515' }
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
        {/* `fixed`, not `absolute`: anchored to the document, focusing the skip
            link after any scroll revealed it 4rem above the current viewport —
            i.e. off screen, which is the one thing a skip link must never be.
            z-overlay clears the fixed navbar (z-50) and the chat panel. */}
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-overlay -translate-y-16 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground shadow-e-2 transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Skip to content
        </a>
        <ThemeProvider>
          {/* overflow-x-clip (not overflow-hidden): clips decorative blob overflow without creating a
              scroll container, which would neutralise every position:sticky element in the app */}
          <div className="relative min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground">
            <Providers>
              {children}
            </Providers>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
