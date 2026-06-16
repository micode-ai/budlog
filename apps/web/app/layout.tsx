import type { Metadata } from 'next';
import { EB_Garamond, PT_Sans } from 'next/font/google';
import './globals.css';

const heading = EB_Garamond({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const body = PT_Sans({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BudLog — Report',
  // Report links are private/shareable — keep them out of search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${heading.variable} ${body.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
