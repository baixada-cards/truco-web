import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_BLOCK_VIEW,
  formatBlockView,
  parseBlockView,
  type BlockView,
} from './block-view.ts'
import { viraChoices, N_CLASSES } from './study-data.ts'

test('formatBlockView: the default view writes nothing', () => {
  assert.equal(formatBlockView(DEFAULT_BLOCK_VIEW, 0), null)
  // all-blocks single=null variants of the default split also write nothing
  assert.equal(formatBlockView({ split: 2, mode: 'all', single: null }, 5), null)
})

test('formatBlockView: non-default splits write their letter', () => {
  assert.equal(formatBlockView({ split: 0, mode: 'all', single: null }, 0), 'h')
  assert.equal(formatBlockView({ split: 1, mode: 'all', single: null }, 0), 'm')
})

test('merged vira labels round-trip a concrete fixed-card token', () => {
  const view: BlockView = { split: 1, mode: 'single', single: 12 }
  assert.equal(formatBlockView(view, 8, '3'), 'm:4c')
  assert.deepEqual(parseBlockView('m:4c', 8, '3'), view)
  assert.equal(parseBlockView('m:4c', 8, '2'), null)
})

test('formatBlockView: single mode without a card degrades to the split', () => {
  assert.equal(formatBlockView({ split: 2, mode: 'single', single: null }, 0), null)
  assert.equal(formatBlockView({ split: 0, mode: 'single', single: null }, 0), 'h')
})

test('parseBlockView: letters, case, and garbage', () => {
  assert.deepEqual(parseBlockView('l', 0), { split: 2, mode: 'all', single: null })
  assert.deepEqual(parseBlockView('H', 0), { split: 0, mode: 'all', single: null })
  assert.deepEqual(parseBlockView(' m ', 0), { split: 1, mode: 'all', single: null })
  // a trailing colon reads as all-blocks rather than an error
  assert.deepEqual(parseBlockView('l:', 0), { split: 2, mode: 'all', single: null })
  assert.equal(parseBlockView('', 0), null)
  assert.equal(parseBlockView('x', 0), null)
  assert.equal(parseBlockView('l:zz', 0), null)
  assert.equal(parseBlockView('l:4:4', 0), null)
  // the manilha rank alone is ambiguous under this vira — not a valid token
  assert.equal(parseBlockView('l:5', 0), null)
})

test('round-trip: every split × every class × every vira', () => {
  for (const { tc } of viraChoices()) {
    for (const split of [0, 1, 2] as const) {
      for (let cls = 0; cls < N_CLASSES; cls += 1) {
        const view: BlockView = { split, mode: 'single', single: cls }
        const raw = formatBlockView(view, tc)
        assert.notEqual(raw, null)
        assert.deepEqual(parseBlockView(raw!, tc), view, `tc=${tc} ${raw}`)
      }
      const all: BlockView = { split, mode: 'all', single: null }
      const rawAll = formatBlockView(all, tc)
      if (rawAll === null) {
        assert.deepEqual(all, DEFAULT_BLOCK_VIEW)
      } else {
        assert.deepEqual(parseBlockView(rawAll, tc), all)
      }
    }
  }
})
