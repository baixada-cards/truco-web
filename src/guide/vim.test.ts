import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyNormalKey, initialVimState, motionTarget, type VimState } from './vim.ts'

function start(text: string, cursor = 0): VimState {
  return { ...initialVimState(text), cursor }
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

test('counts repeat motions and edits', () => {
  // the(0) → truco(4) → ladder(10) → here(17)
  assert.equal(applyNormalKey(applyNormalKey(start('the truco ladder here'), '3'), 'w').cursor, 17)
  assert.equal(applyNormalKey(applyNormalKey(start('manilha'), '3'), 'x').text, 'ilha')
  // d2w takes two words
  const deleted = ['d', '2', 'w'].reduce((acc, key) => applyNormalKey(acc, key), start('the truco ladder'))
  assert.equal(deleted.text, 'ladder')
})

test('r replaces the character under the cursor', () => {
  const replaced = applyNormalKey(applyNormalKey(start('vira', 0), 'r'), 'V')
  assert.equal(replaced.text, 'Vira')
  assert.equal(replaced.mode, 'normal')
})

test('V selects the whole line', () => {
  const selected = applyNormalKey(start('accept or fold', 4), 'V')
  assert.equal(selected.mode, 'visual')
  assert.equal(selected.linewise, true)
  assert.equal(applyNormalKey(selected, 'd').text, '')
})

test('f and t find within the line, ; repeats', () => {
  const found = applyNormalKey(applyNormalKey(start('a, b, c'), 'f'), ',')
  assert.equal(found.cursor, 1)
  assert.equal(applyNormalKey(found, ';').cursor, 4)
  const till = applyNormalKey(applyNormalKey(start('a, b, c'), 't'), 'b')
  assert.equal(till.cursor, 2)
})

test('df{char} deletes through the character', () => {
  const after = ['d', 'f', ','].reduce((acc, key) => applyNormalKey(acc, key), start('one, two'))
  assert.equal(after.text, ' two')
})

test('ci" changes inside quotes', () => {
  const after = ['c', 'i', '"'].reduce((acc, key) => applyNormalKey(acc, key), start('say "no flor" here', 6))
  assert.equal(after.text, 'say "" here')
  assert.equal(after.mode, 'insert')
})

test('diw takes the word under the cursor', () => {
  const after = ['d', 'i', 'w'].reduce((acc, key) => applyNormalKey(acc, key), start('the truco ladder', 5))
  assert.equal(after.text, 'the  ladder')
})

test('~ toggles case and steps right', () => {
  const after = applyNormalKey(start('vira'), '~')
  assert.equal(after.text, 'Vira')
  assert.equal(after.cursor, 1)
})

test('j and k use the measured visual line when one is supplied', () => {
  // one long line wrapped at 10 columns: 0..9, 10..19, 20..
  const ctx = { visualLine: (cursor: number, delta: number) => cursor + delta * 10 }
  assert.equal(motionTarget(start('x'.repeat(30), 3), 'j', ctx), 13)
  assert.equal(motionTarget(start('x'.repeat(30), 23), 'k', ctx), 13)
  // gj and gk are the same motion
  const g = applyNormalKey(start('x'.repeat(30), 3), 'g')
  assert.equal(applyNormalKey(g, 'j', ctx).cursor, 13)
})
