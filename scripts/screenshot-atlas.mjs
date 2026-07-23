// Minimal Playwright screenshot capture for the Solution Atlas page.
// Usage: node scripts/screenshot-atlas.mjs [url] [outfile]
// Assumes a dev server is already running (default http://localhost:3002/atlas).

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const url = process.argv[2] ?? 'http://localhost:3002/atlas'
const out =
  process.argv[3] ?? join(here, '..', 'screenshots', 'solution-atlas.png')

mkdirSync(dirname(out), { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } })
await page.goto(url, { waitUntil: 'networkidle' })
// Wait for the hand grid to populate.
await page.waitForSelector('text=Opening lead by hand', { timeout: 15000 })
await page.waitForTimeout(600)
await page.screenshot({ path: out, fullPage: true })
console.log(`screenshot saved to ${out}`)
await browser.close()
