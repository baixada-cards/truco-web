// Which guide books are actually on disk. The PDF and EPUB are built
// artifacts (scripts/build_guide_book.mjs → public/downloads, git-ignored),
// so the landing page links only what a given deploy really carries — never
// a 404.

import { statSync } from 'node:fs'
import path from 'node:path'

export type GuideBookFormat = 'pdf' | 'epub'

export interface GuideBook {
  format: GuideBookFormat
  href: string
  /** rounded for display: "8.0 MB", "132 KB" */
  size: string
}

const FORMATS: GuideBookFormat[] = ['pdf', 'epub']

function humanSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1000)} KB`
}

export function guideBooks(locale: string): GuideBook[] {
  const books: GuideBook[] = []
  for (const format of FORMATS) {
    const name = `baixada-truco-guide-${locale}.${format}`
    try {
      const stats = statSync(path.join(process.cwd(), 'public', 'downloads', name))
      if (stats.isFile()) books.push({ format, href: `/downloads/${name}`, size: humanSize(stats.size) })
    } catch {
      // not built for this locale — simply not offered
    }
  }
  return books
}
