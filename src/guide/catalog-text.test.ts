import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCatalogIndex, matchCatalogKey, renderedCatalogText } from './catalog-text.ts'

test('supported rich-text tokens are removed for DOM text matching', () => {
  assert.equal(
    renderedCatalogText('The <b>engine</b> treats <em>that</em> as <code>26</code>.'),
    'The engine treats that as 26.',
  )
})

test('a cross-reference tag leaves only the words it links', () => {
  assert.equal(
    renderedCatalogText('as <chart>the chart chapter</chart> showed, <numbers>Appendix B</numbers> lists it.'),
    'as the chart chapter showed, Appendix B lists it.',
  )
})

test('catalog whitespace collapses to the same shape as DOM text', () => {
  assert.equal(renderedCatalogText('  first\n\n second\tthird  '), 'first second third')
})

test('unsupported and malformed markup stays literal', () => {
  assert.equal(renderedCatalogText('read <script and <u>underline</u>'), 'read <script and <u>underline</u>')
})

test('an element matches the key whose rendered text it carries', () => {
  const index = buildCatalogIndex({
    'sec.a.p1': 'The <b>engine</b> treats that as 26.',
    'sec.a.p2': 'Short',
  })
  assert.equal(matchCatalogKey(index, 'The engine treats that as 26.'), 'sec.a.p1')
  assert.equal(matchCatalogKey(index, 'The engine treats that as 27.'), null)
  // strings under two characters match far too much of a page
  assert.equal(matchCatalogKey(index, 'Short'), 'sec.a.p2')
})

test('a placeholder string is anchored by its prefix, but only when asked', () => {
  const index = buildCatalogIndex({
    'sec.a.p1': 'The turn-up decides the manilha, and here it is {rank}.',
  })
  const text = 'The turn-up decides the manilha, and here it is 4.'
  assert.equal(matchCatalogKey(index, text), null)
  assert.equal(matchCatalogKey(index, text, { prefix: true }), 'sec.a.p1')
})

test('an ambiguous or too-short prefix anchors nothing', () => {
  const index = buildCatalogIndex({
    'sec.a.p1': 'It is worth {pp} points.',
    'sec.b.p1': 'The same opening words, and then {a}.',
    'sec.b.p2': 'The same opening words, and then {b}.',
  })
  assert.deepEqual(index.byPrefix, [])
  assert.equal(matchCatalogKey(index, 'It is worth 3 points.', { prefix: true }), null)
})

test('a prefix that also opens a whole string is left out', () => {
  const index = buildCatalogIndex({
    'sec.a.p1': 'The leader plays first, and then the dealer answers.',
    'sec.a.p2': 'The leader plays first, and then {who} answers.',
  })
  assert.deepEqual(index.byPrefix, [])
  assert.equal(
    matchCatalogKey(index, 'The leader plays first, and then the dealer answers.', {
      prefix: true,
    }),
    'sec.a.p1',
  )
})
