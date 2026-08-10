// Without this the site has no robots.txt at all, and the sitemap below is
// the only thing that tells a crawler the sitemap exists. Page-level `robots`
// metadata still decides what may be indexed; this only points the way in.
import type { MetadataRoute } from 'next'

import { siteOrigin } from '../src/server/site-url'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  }
}
