import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { brand, siteUrl } from '@/lib/config';
import './globals.css';

const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display-face', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${brand.name}: resize, compress and enhance images online`, template: `%s · ${brand.name}` },
  description: brand.tagline,
  applicationName: brand.name,
  openGraph: { type: 'website', siteName: brand.name, url: siteUrl },
  twitter: { card: 'summary' },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#111214' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${body.variable} ${display.variable}`}>
      <body className="min-h-dvh bg-paper text-ink">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
