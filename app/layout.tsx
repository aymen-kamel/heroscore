import type { Metadata, Viewport } from 'next';
import './globals.css';

// Préfixe GitHub Pages (/heroscore) ; vide en local.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const SITE_URL = `https://aymen-kamel.github.io${BASE}`;
const TITLE = 'HeroScore — Making sports intelligent';
const DESCRIPTION =
  'HeroScore is a Tunisian SportTech & AI startup. SmartPlay turns one padel match video into player tracking, heatmaps and movement stats.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: `${BASE}/images/logo.png`, apple: `${BASE}/images/logo.png` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/`,
    siteName: 'HeroScore',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}/images/hero.jpg`, alt: 'HeroScore SmartPlay — padel match analysis' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [`${SITE_URL}/images/hero.jpg`] },
};

export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
