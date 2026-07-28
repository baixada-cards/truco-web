// Dev-only copy editing for the field guide. GET hands the client a flat
// map of every Study.guide message so it can match a double-clicked
// paragraph back to its catalog key; PATCH writes one key back into
// messages/<locale>.json, preserving the file's formatting exactly.
//
// Disabled whenever dev routes are (always in production) — see
// src/server/dev-routes.ts. Nothing here is reachable from a prod build.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server.js'

import { areDevRoutesEnabled, disabledDevRouteResponse } from '../../../../src/server/dev-routes'

export const dynamic = 'force-dynamic'

const LOCALES = ['en', 'pt-BR', 'es'] as const
type Locale = (typeof LOCALES)[number]

/** the only subtree this route will read or write */
const ROOT = ['Study', 'guide'] as const

type Catalog = Record<string, unknown>

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

function catalogPath(locale: Locale) {
  return path.join(process.cwd(), 'messages', `${locale}.json`)
}

async function readCatalog(locale: Locale): Promise<Catalog> {
  return JSON.parse(await readFile(catalogPath(locale), 'utf8')) as Catalog
}

/** messages/*.json is 2-space indented, unescaped UTF-8, one trailing newline */
async function writeCatalog(locale: Locale, catalog: Catalog) {
  await writeFile(catalogPath(locale), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
}

function guideSubtree(catalog: Catalog): Record<string, unknown> {
  let node: unknown = catalog
  for (const step of ROOT) {
    if (typeof node !== 'object' || node === null) return {}
    node = (node as Record<string, unknown>)[step]
  }
  return typeof node === 'object' && node !== null ? (node as Record<string, unknown>) : {}
}

/** every string under Study.guide, keyed by its dotted path */
function flatten(node: unknown, prefix = '', out: Record<string, string> = {}) {
  if (typeof node === 'string') {
    out[prefix] = node
    return out
  }
  if (typeof node !== 'object' || node === null) return out
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

/** a dotted key is only accepted if it already names a string in the catalog */
function setExisting(subtree: Record<string, unknown>, key: string, value: string) {
  const steps = key.split('.')
  let node: Record<string, unknown> = subtree
  for (const step of steps.slice(0, -1)) {
    const next = node[step]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) return false
    node = next as Record<string, unknown>
  }
  const last = steps[steps.length - 1]
  if (typeof node[last] !== 'string') return false
  node[last] = value
  return true
}

export async function GET(request: Request) {
  if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

  const locale = new URL(request.url).searchParams.get('locale') ?? 'en'
  if (!isLocale(locale)) {
    return NextResponse.json({ code: 'BAD_LOCALE', message: 'unknown locale' }, { status: 400 })
  }

  const catalog = await readCatalog(locale)
  return NextResponse.json({ locale, messages: flatten(guideSubtree(catalog)) })
}

export async function PATCH(request: Request) {
  if (!areDevRoutesEnabled()) return disabledDevRouteResponse()

  const body = (await request.json()) as { locale?: unknown; key?: unknown; value?: unknown }
  if (!isLocale(body.locale)) {
    return NextResponse.json({ code: 'BAD_LOCALE', message: 'unknown locale' }, { status: 400 })
  }
  if (typeof body.key !== 'string' || typeof body.value !== 'string') {
    return NextResponse.json({ code: 'BAD_REQUEST', message: 'key and value are required' }, { status: 400 })
  }
  if (!/^[\w-]+(\.[\w-]+)*$/.test(body.key)) {
    return NextResponse.json({ code: 'BAD_KEY', message: 'malformed key' }, { status: 400 })
  }

  const catalog = await readCatalog(body.locale)
  if (!setExisting(guideSubtree(catalog), body.key, body.value)) {
    return NextResponse.json({ code: 'UNKNOWN_KEY', message: `no such guide string: ${body.key}` }, { status: 404 })
  }
  await writeCatalog(body.locale, catalog)

  return NextResponse.json({ locale: body.locale, key: body.key, written: true })
}
