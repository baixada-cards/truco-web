import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderedCatalogText } from './catalog-text.ts'

test('supported rich-text tokens are removed for DOM text matching', () => {
  assert.equal(
    renderedCatalogText('The <b>engine</b> treats <em>that</em> as <code>26</code>.'),
    'The engine treats that as 26.',
  )
})

test('catalog whitespace collapses to the same shape as DOM text', () => {
  assert.equal(renderedCatalogText('  first\n\n second\tthird  '), 'first second third')
})

test('unsupported and malformed markup stays literal', () => {
  assert.equal(renderedCatalogText('read <script and <u>underline</u>'), 'read <script and <u>underline</u>')
})
