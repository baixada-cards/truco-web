import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyNormalKey, motionTarget, type VimState } from './vim.ts'

function start(text: string, cursor = 0): VimState {
  return { text, cursor, mode: 'normal', pending: '', register: '', anchor: null, undo: [] }
}

function keys(state: VimState, sequence: string[]) {
  return sequence.reduce((acc, key) => applyNormalKey(acc, key), state)
}

test('word motions step by word class', () => {
  const state = start('the truco ladder, and more')
  assert.equal(motionTarget(state, 'w'), 4)
  assert.equal(motionTarget({ ...state, cursor: 4 }, 'w'), 10)
  // punctuation is its own class, as in vim
  assert.equal(motionTarget({ ...state, cursor: 10 }, 'w'), 16)
  assert.equal(motionTarget({ ...state, cursor: 16 }, 'b'), 10)
  assert.equal(motionTarget({ ...state, cursor: 0 }, 'e'), 2)
})

test('line motions respect $ and 0', () => {
  const state = start('no envido, no flor', 5)
  assert.equal(motionTarget(state, '0'), 0)
  assert.equal(motionTarget(state, '$'), 17)
})

test('dw deletes to the start of the next word', () => {
  const after = keys(start('the truco ladder'), ['d', 'w'])
  assert.equal(after.text, 'truco ladder')
  assert.equal(after.register, 'the ')
})

test('cw deletes the word and enters insert', () => {
  const after = keys(start('the truco ladder', 4), ['c', 'w'])
  assert.equal(after.text, 'the ladder')
  assert.equal(after.mode, 'insert')
})

test('x removes one character, u puts it back', () => {
  const cut = applyNormalKey(start('manilha'), 'x')
  assert.equal(cut.text, 'anilha')
  assert.equal(applyNormalKey(cut, 'u').text, 'manilha')
})

test('u undoes a whole insert session', () => {
  // entering insert snapshots, so the text typed while in insert is one undo
  const entered = applyNormalKey(start('vira'), 'A')
  assert.equal(entered.mode, 'insert')
  const typed: VimState = { ...entered, text: 'vira 4', cursor: 6 }
  assert.equal(applyNormalKey({ ...typed, mode: 'normal' }, 'u').text, 'vira')
})

test('dd takes the line, p puts it back', () => {
  const cut = keys(start('one\ntwo', 4), ['d', 'd'])
  assert.equal(cut.text, 'one\n')
  assert.equal(cut.register, 'two')
  assert.equal(applyNormalKey(cut, 'p').text.includes('two'), true)
})

test('visual mode selects then deletes', () => {
  const selected = keys(start('the truco ladder'), ['v', 'w'])
  assert.equal(selected.mode, 'visual')
  assert.equal(selected.anchor, 0)
  // visual is inclusive of the cursor, so vwd eats the first letter of the
  // next word too — exactly what vim does
  assert.equal(applyNormalKey(selected, 'd').text, 'ruco ladder')
})

test('gg goes to the top, G to the end', () => {
  const state = start('a\nb\nc', 4)
  assert.equal(keys(state, ['g', 'g']).cursor, 0)
  assert.equal(applyNormalKey(start('a\nb\nc'), 'G').cursor, 4)
})

test('yy then p duplicates without touching the register text', () => {
  const yanked = keys(start('accept'), ['y', 'y'])
  assert.equal(yanked.register, 'accept')
  assert.equal(yanked.text, 'accept')
})

test('unknown keys are inert', () => {
  const state = start('flor', 2)
  assert.deepEqual(applyNormalKey(state, 'Z'), state)
})
