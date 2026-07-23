import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ALLOW, GLOW, LIFT, OPEN, clearDecorations, clearTourDom, markStepDom, type TourDoc } from './tour-dom.ts'

// A minimal in-memory DOM: enough of querySelectorAll / setAttribute /
// removeAttribute to exercise the tour's decoration bookkeeping. Selectors
// supported: `[attr]` (presence), `.class`, `#id`.
interface El {
  id: string | null
  classes: string[]
  attrs: Map<string, string>
  setAttribute: (name: string, value: string) => void
  removeAttribute: (name: string) => void
  has: (name: string) => boolean
}

function el(id: string | null = null, classes: string[] = []): El {
  const attrs = new Map<string, string>()
  return {
    id,
    classes,
    attrs,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: (name) => attrs.delete(name),
    has: (name) => attrs.has(name),
  }
}

function doc(els: El[]): TourDoc & { body: El } {
  const body = el('body')
  const all = () => [body, ...els]
  return {
    body,
    querySelectorAll(sel: string): El[] & Iterable<El> {
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const attr = sel.slice(1, -1)
        return all().filter((e) => e.has(attr))
      }
      if (sel.startsWith('.')) return all().filter((e) => e.classes.includes(sel.slice(1)))
      if (sel.startsWith('#')) return all().filter((e) => e.id === sel.slice(1))
      return []
    },
  }
}

const rail = () => el('rail', ['rail'])
const opt = () => el(null, ['opt'])
const badge = () => el(null, ['badge'])
const stray = () => el(null, ['stray'])

const STEP = { lift: '.rail', allow: ['.opt'], glow: ['.badge'] }

test('markStepDom sets lift/allow/glow attributes and the body flag', () => {
  const r = rail()
  const o = opt()
  const b = badge()
  const d = doc([r, o, b, stray()])
  markStepDom(d, STEP)
  assert.ok(d.body.has(OPEN), 'body open flag set')
  assert.ok(r.has(LIFT), 'lifted section marked')
  assert.ok(o.has(ALLOW), 'allowed control marked')
  assert.ok(b.has(GLOW), 'glowed control marked')
})

test('clearTourDom removes every decoration and the body flag', () => {
  const r = rail()
  const o = opt()
  const b = badge()
  const d = doc([r, o, b])
  markStepDom(d, STEP)
  clearTourDom(d)
  assert.equal(d.body.has(OPEN), false, 'body flag cleared')
  for (const e of [r, o, b]) {
    for (const attr of [LIFT, ALLOW, GLOW]) {
      assert.equal(e.has(attr), false, `${attr} cleared`)
    }
  }
})

test('teardown is by global query — it clears marks even on elements the step never named', () => {
  // simulate a node that got lifted, then a remount left a duplicate carrying
  // a stale attribute the closure never tracked
  const orphan = el(null, [])
  orphan.setAttribute(LIFT, '')
  orphan.setAttribute(ALLOW, '')
  const d = doc([orphan])
  clearTourDom(d)
  assert.equal(orphan.has(LIFT), false)
  assert.equal(orphan.has(ALLOW), false)
})

test('clearTourDom is idempotent and safe when nothing is decorated', () => {
  const d = doc([rail(), opt()])
  clearTourDom(d) // never applied
  clearTourDom(d) // twice
  assert.equal(d.body.has(OPEN), false)
})

test('abrupt close after any step leaves zero residue', () => {
  // walk several steps with different selector sets, then close abruptly
  const r = rail()
  const o = opt()
  const b = badge()
  const d = doc([r, o, b])
  markStepDom(d, { lift: '.rail', allow: ['.opt'] })
  clearDecorations(d)
  markStepDom(d, { glow: ['.badge'] })
  clearDecorations(d)
  markStepDom(d, { lift: '.rail', allow: ['.opt'], glow: ['.badge'] })
  // Esc — component unmounts, cleanup runs clearTourDom by global query
  clearTourDom(d)
  const anyMark = [r, o, b, d.body].some(
    (e) => e.has(LIFT) || e.has(ALLOW) || e.has(GLOW) || e.has(OPEN),
  )
  assert.equal(anyMark, false, 'no lift/allow/glow/open attribute survives an abrupt close')
})

test('re-marking after a clear restores the current step (no stale accumulation)', () => {
  const r = rail()
  const o = opt()
  const d = doc([r, o])
  markStepDom(d, { lift: '.rail', allow: ['.opt'] })
  clearDecorations(d)
  // next step lifts nothing and allows nothing
  markStepDom(d, {})
  assert.equal(r.has(LIFT), false, 'previous lift did not survive the step change')
  assert.equal(o.has(ALLOW), false, 'previous allow did not survive the step change')
  assert.ok(d.body.has(OPEN), 'tour is still open')
})
