import createNextIntlPlugin from 'next-intl/plugin'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const productionTurbopackDevAliases = process.env.NODE_ENV === 'production'
  ? {
      './components/live/LiveDevPanel': './src/components/live/LiveDevPanel.prod.tsx',
      './lib/use-live-dev-actions': './src/lib/use-live-dev-actions.prod.ts',
      './lib/use-live-dev-controls': './src/lib/use-live-dev-controls.prod.ts',
      './lib/session-dev-api': './src/lib/session-dev-api.prod.ts',
    }
  : {}
const productionWebpackDevAliases = process.env.NODE_ENV === 'production'
  ? {
      './components/live/LiveDevPanel': path.join(
        dirname,
        'src/components/live/LiveDevPanel.prod.tsx',
      ),
      './lib/use-live-dev-actions': path.join(
        dirname,
        'src/lib/use-live-dev-actions.prod.ts',
      ),
      './lib/use-live-dev-controls': path.join(
        dirname,
        'src/lib/use-live-dev-controls.prod.ts',
      ),
      './lib/session-dev-api': path.join(
        dirname,
        'src/lib/session-dev-api.prod.ts',
      ),
    }
  : {}
const extraAllowedDevOrigins = (process.env.TRUCO_ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const baixadaApexHosts = ['baixada.cards', 'www.baixada.cards']
const baixadaApexRedirects = baixadaApexHosts.map((host) => ({
  source: '/:path*',
  has: [
    {
      type: 'host',
      value: host,
    },
  ],
  destination: 'https://truco.baixada.cards/:path*',
  permanent: false,
}))

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:locale/lab/study/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ]
  },
  async redirects() {
    return baixadaApexRedirects
  },
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '**.ts.net',
    ...extraAllowedDevOrigins,
  ],
  devIndicators: {
    position: 'bottom-left',
  },
  turbopack: {
    root: dirname,
    resolveAlias: productionTurbopackDevAliases,
  },
  webpack(config) {
    if (Object.keys(productionWebpackDevAliases).length > 0) {
      config.resolve.alias = {
        ...config.resolve.alias,
        ...productionWebpackDevAliases,
      }
    }

    return config
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
