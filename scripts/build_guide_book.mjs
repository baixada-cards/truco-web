// Builds the field guide's PDF and EPUB from the running app, so the books
// can never drift from the site: both are rendered from
// /<locale>/lab/study/guide/print, which uses the same catalog and the same
// chapter components as the routed guide.
//
//   node scripts/build_guide_book.mjs                      # en, from :3002
//   node scripts/build_guide_book.mjs --locale pt-BR --locale es
//   node scripts/build_guide_book.mjs --base http://localhost:3002 --formats pdf
//
// Output lands in public/downloads/ (git-ignored — the binaries are built,
// never committed). The guide's landing page links whatever it finds there.

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { deflateRawSync } from 'node:zlib'

import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
function flags(name) {
  const out = []
  for (let i = 0; i < argv.length - 1; i += 1) if (argv[i] === `--${name}`) out.push(argv[i + 1])
  return out
}
const BASE = flags('base')[0] ?? 'http://localhost:3002'
const LOCALES = flags('locale').length > 0 ? flags('locale') : ['en']
const FORMATS = (flags('formats')[0] ?? 'pdf,epub').split(',').map((f) => f.trim())
const OUT = path.resolve(flags('out')[0] ?? 'public/downloads')

const TITLE_FALLBACK = 'Reading the solution charts'

// ---------------------------------------------------------------- zip writer

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

/** minimal ZIP writer: EPUB needs `mimetype` first and stored, the rest deflated */
function zip(entries) {
  const locals = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const stored = entry.store === true
    const body = stored ? raw : deflateRawSync(raw, { level: 9 })
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(stored ? 0 : 8, 8) // method
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0x21, 12) // mod date — a fixed 1980-01-01, for reproducibility
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4) // version made by
    dir.writeUInt16LE(20, 6) // version needed
    dir.writeUInt16LE(0, 8)
    dir.writeUInt16LE(stored ? 0 : 8, 10)
    dir.writeUInt16LE(0, 12)
    dir.writeUInt16LE(0x21, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(body.length, 20)
    dir.writeUInt32LE(raw.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt16LE(0, 30) // extra
    dir.writeUInt16LE(0, 32) // comment
    dir.writeUInt16LE(0, 34) // disk
    dir.writeUInt16LE(0, 36) // internal attrs
    dir.writeUInt32LE(0, 38) // external attrs
    dir.writeUInt32LE(offset, 42)
    central.push(dir, name)

    offset += local.length + name.length + body.length
  }

  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralBuffer, end])
}

// ---------------------------------------------------------------- extraction

/** pulled out of the print page: chapter XHTML, the page's CSS, the metadata */
async function extractBook(page) {
  return page.evaluate(() => {
    const serializer = new XMLSerializer()

    const clean = (element) => {
      const copy = element.cloneNode(true)
      copy.querySelectorAll('script, noscript, template, iframe, canvas, video, audio').forEach((n) => n.remove())
      // reading systems have no event loop for our widgets; leave the markup
      // but strip anything that would look actionable or invalid in XHTML
      copy.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'))
      copy.querySelectorAll('button, input, select, textarea').forEach((n) => {
        n.setAttribute('disabled', 'disabled')
        n.removeAttribute('onclick')
      })
      copy.querySelectorAll('*').forEach((n) => {
        for (const attribute of [...n.attributes]) {
          if (attribute.name.startsWith('on')) n.removeAttribute(attribute.name)
        }
      })
      return serializer.serializeToString(copy)
    }

    const css = [...document.styleSheets]
      .map((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
        } catch {
          return '' // cross-origin (web fonts) — the reader substitutes
        }
      })
      .join('\n')

    const chapters = [...document.querySelectorAll('[data-chapter]')].map((element) => ({
      id: element.getAttribute('data-chapter'),
      title: element.getAttribute('data-chapter-title'),
      roman: element.getAttribute('data-chapter-roman'),
      part: element.getAttribute('data-chapter-part'),
      xhtml: clean(element),
    }))

    const titlePage = document.querySelector('[data-book] > section')
    return {
      locale: document.querySelector('[data-book]')?.getAttribute('data-book') ?? 'en',
      title: document.querySelector('h1')?.textContent?.trim() ?? '',
      titleXhtml: titlePage ? clean(titlePage) : '',
      css,
      chapters,
    }
  })
}

// ---------------------------------------------------------------- epub build

const xmlEscape = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function xhtmlDoc({ locale, title, body }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${xmlEscape(locale)}" lang="${xmlEscape(locale)}">
<head>
<meta charset="utf-8"/>
<title>${xmlEscape(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`
}

function buildEpub(book) {
  const { locale, title, chapters } = book
  // a stable id: same content in, same book id out
  const uid = `urn:uuid:${createHash('sha1').update(`baixada-guide-${locale}-${title}`).digest('hex').slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5')}`

  const files = chapters.map((chapter, index) => ({
    name: `ch${String(index + 1).padStart(2, '0')}-${chapter.id}.xhtml`,
    chapter,
  }))

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="style" href="style.css" media-type="text/css"/>',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
    ...files.map(
      (file, index) =>
        `<item id="c${index + 1}" href="${file.name}" media-type="application/xhtml+xml"/>`,
    ),
  ].join('\n    ')

  const spine = ['<itemref idref="title"/>', '<itemref idref="nav"/>', ...files.map((_, i) => `<itemref idref="c${i + 1}"/>`)].join(
    '\n    ',
  )

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${xmlEscape(locale)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${xmlEscape(uid)}</dc:identifier>
    <dc:title>${xmlEscape(title || TITLE_FALLBACK)}</dc:title>
    <dc:language>${xmlEscape(locale)}</dc:language>
    <dc:creator>Baixada</dc:creator>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>
`

  const nav = xhtmlDoc({
    locale,
    title: 'Contents',
    body: `<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
${files.map((file) => `<li><a href="${file.name}">${xmlEscape(file.chapter.title)}</a></li>`).join('\n')}
</ol>
</nav>`,
  })

  // the page's own CSS, plus the handful of overrides a reading system needs
  const css = `${book.css}

/* --- epub overrides --- */
html, body { margin: 0; padding: 0; background: #e9e7e1; color: #4a4032; }
body { font-family: serif; line-height: 1.6; padding: 0 1em; }
img, svg, table { max-width: 100%; }
button, input, select, textarea { pointer-events: none; }
`

  return zip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    {
      name: 'META-INF/container.xml',
      data: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
    },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: css },
    { name: 'OEBPS/title.xhtml', data: xhtmlDoc({ locale, title: title || TITLE_FALLBACK, body: book.titleXhtml }) },
    ...files.map((file) => ({
      name: `OEBPS/${file.name}`,
      data: xhtmlDoc({ locale, title: file.chapter.title, body: file.chapter.xhtml }),
    })),
  ])
}

// ---------------------------------------------------------------------- main

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const written = []

  try {
    for (const locale of LOCALES) {
      const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
      const url = `${BASE}/${locale}/lab/study/guide/print`
      process.stdout.write(`rendering ${url}\n`)
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 180_000 })
      if (!response || !response.ok()) throw new Error(`${url} → ${response ? response.status() : 'no response'}`)
      // let the client plates mount and settle before anything is captured
      await page.waitForTimeout(2500)

      const stem = `baixada-truco-guide-${locale}`

      if (FORMATS.includes('pdf')) {
        const file = path.join(OUT, `${stem}.pdf`)
        await page.emulateMedia({ media: 'print' })
        await page.pdf({
          path: file,
          format: 'A4',
          printBackground: true,
          margin: { top: '18mm', bottom: '20mm', left: '18mm', right: '18mm' },
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate:
            '<div style="width:100%;font-family:Inter,sans-serif;font-size:8px;color:#7a6d56;padding:0 18mm;display:flex;justify-content:space-between"><span>Baixada · Study · Field guide</span><span class="pageNumber"></span></div>',
        })
        await page.emulateMedia({ media: 'screen' })
        written.push(file)
      }

      if (FORMATS.includes('epub')) {
        const book = await extractBook(page)
        if (book.chapters.length === 0) throw new Error(`no chapters found at ${url}`)
        const file = path.join(OUT, `${stem}.epub`)
        await writeFile(file, buildEpub(book))
        written.push(file)
      }

      await page.close()
    }
  } finally {
    await browser.close()
  }

  for (const file of written) process.stdout.write(`wrote ${path.relative(process.cwd(), file)}\n`)
}

await main()
