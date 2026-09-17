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

test('card and hand tokens leave the cards as the DOM spells them', () => {
  assert.equal(
    renderedCatalogText('Take <hand>5♣ Q 7</hand> and lead the <card>7</card>.'),
    'Take 5♣ Q 7 and lead the 7.',
  )
})

test('a score is read in the one spelling it renders in, however it is written', () => {
  // the thin spaces the token sets collapse to ordinary ones on both sides
  assert.equal(renderedCatalogText('at <score>11x11</score> the hand is worth 3.'), 'at 11 × 11 the hand is worth 3.')
  assert.equal(renderedCatalogText('at <score>11 x 11</score>.'), 'at 11 × 11.')
  assert.equal(renderedCatalogText('at <score>11 × 11</score>.'), 'at 11 × 11.')
  // lab notation inside <code> is not a score and is left as written
  assert.equal(renderedCatalogText('the <code>11x11 v4</code> export'), 'the 11x11 v4 export')
})

test('a manilha card reads with the m the token draws, however it is written', () => {
  assert.equal(renderedCatalogText('the top manilha is <card>♣</card>.'), 'the top manilha is m♣.')
  assert.equal(renderedCatalogText('the top manilha is <card>m♣</card>.'), 'the top manilha is m♣.')
  // an ordinary card is untouched, inside a hand as well as alone
  assert.equal(renderedCatalogText('lead the <card>5♣</card>'), 'lead the 5♣')
  assert.equal(renderedCatalogText('hold <hand>♥ Q 7</hand>'), 'hold m♥ Q 7')
})

test('a points token leaves its figure as the DOM spells it', () => {
  assert.equal(
    renderedCatalogText('from <pts>1</pts> point to <pts>3</pts>.'),
    'from 1 point to 3.',
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
