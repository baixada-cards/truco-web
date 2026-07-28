import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createElement } from 'react'

import { splitParagraphs } from './paragraphs.ts'

test('a string without a blank line stays one paragraph', () => {
  assert.deepEqual(splitParagraphs('one sentence, then another'), [['one sentence, then another']])
})

test('a blank line starts a new paragraph', () => {
  assert.deepEqual(splitParagraphs('first\n\nsecond'), [['first'], ['second']])
})

test('a single newline is only whitespace, as in HTML', () => {
  assert.deepEqual(splitParagraphs('first\nstill first'), [['first\nstill first']])
})

test('trailing and leading whitespace is trimmed off each paragraph', () => {
  assert.deepEqual(splitParagraphs('first. \n\n  second.\n'), [['first.'], ['second.']])
})

test('rendered elements survive the split and stay with their paragraph', () => {
  const bold = createElement('b', { key: 'b' }, 'engine')
  const parts = splitParagraphs(['the ', bold, ' wins.\n\nSo each manilha…'])
  assert.equal(parts.length, 2)
  assert.equal(parts[0].length, 3)
  assert.equal(parts[0][0], 'the ')
  assert.equal(parts[0][2], ' wins.')
  assert.deepEqual(parts[1], ['So each manilha…'])
})

test('several blank lines in a row make one break, not empty paragraphs', () => {
  assert.deepEqual(splitParagraphs('first\n\n\n\nsecond'), [['first'], ['second']])
})
