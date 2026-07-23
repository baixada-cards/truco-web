/* eslint-disable react-refresh/only-export-components */
import type { Metadata } from 'next'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import '../../src/baixada-tokens.css'
import '../../src/title-screens.tokens.css'
import '../../src/index.css'
import '../../src/App.css'

import { routing } from '../../src/i18n/routing'

const icons: Metadata['icons'] = {
  icon: [
    { url: '/favicon.ico?v=2', sizes: '32x32', type: 'image/x-icon' },
    { url: '/favicon.png?v=2', sizes: '32x32', type: 'image/png' },
  ],
  shortcut: ['/favicon.ico?v=2'],
  apple: [{ url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
}

type LocaleLayoutProps = Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Pick<LocaleLayoutProps, 'params'>): Promise<Metadata> {
  const { locale } = await params
  const resolvedLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
  const t = await getTranslations({ locale: resolvedLocale, namespace: 'Metadata' })

  return {
    title: t('title'),
    description: t('description'),
    icons,
  }
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Kalam:wght@400;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
