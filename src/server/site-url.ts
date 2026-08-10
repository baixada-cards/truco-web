type SiteEnvironment = Readonly<Record<string, string | undefined>>

/**
 * The public origin this deployment is reached at, without a trailing slash.
 * Only the sitemap and robots.txt need it: everything else in the app links
 * relatively and has no business knowing its own hostname.
 */
export function siteOrigin(env: SiteEnvironment = process.env): string {
  const configured = env.TRUCO_SITE_URL?.trim()
  return (configured || 'https://truco.baixada.cards').replace(/\/+$/, '')
}
