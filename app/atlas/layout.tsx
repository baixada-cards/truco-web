import type { Metadata } from 'next'

import '@baixada-cards/design-system/tokens.css'

export const metadata: Metadata = {
  title: 'Solution Atlas — Baixada',
  description: 'Poker-range-style viewer for solved Truco CFR strategies.',
}

// Non-localized standalone route. It lives outside app/[locale], so it provides
// its own <html>/<body> shell (the localized app shell does the same for the
// rest of the product).
export default function AtlasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
