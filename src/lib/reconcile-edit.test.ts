// reconcileEdit (plan 76 H-2): the conservative keep. Class indices are the
// tc=0 (vira 4) ladder: 0=4 1=6 2=7 3=Q 4=J 5=K 6=A 7=2 8=3, 9..12 = the
// manilhas 5♦ 5♠ 5♥ 5♣. With dealer 0, seat 1 is mão and leads trick 1.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { reconcileEdit } from './reconcile-edit.ts'
import type { BandContext } from './study-data.ts'

const ctx: BandContext = { dealer: 0, score: [5, 5] }
const TC = 0

test('same-winner card swap keeps the whole suffix', () => {
  // mão 3 beats pé 4; trick 2: mão A, pé 6. Swap mão's lead 3 → 2:
  // still beats the 4, so nothing downstream changes meaning.
  const line = [8, 0, 6, 1]
  const rec = reconcileEdit(line, 0, 7, ctx, TC)
  assert.deepEqual(rec.next, [7, 0, 6, 1])
  assert.equal(rec.kept, 3)
  assert.equal(rec.dropped, 0)
  assert.equal(rec.reason, null)
})

test('a lead turned face-down flips the trick and cuts at the flip', () => {
  // face-down always loses: pé now wins trick 1 and leads trick 2, so the
  // reply in trick 1 survives (same seat, same trick) and everything from
  // trick 2 is re-attributed — cut there.
  const line = [8, 0, 6, 1]
  const rec = reconcileEdit(line, 0, 13 + 8, ctx, TC)
  assert.deepEqual(rec.next, [13 + 8, 0])
  assert.equal(rec.kept, 1)
  assert.equal(rec.dropped, 2)
  assert.equal(rec.reason, 'actor')
})

test('a tie keeps the leader, so the suffix survives', () => {
  // mão's 3-beats-4 becomes 4-ties-4: ties keep the leader, so trick 2
  // still belongs to mão and the whole future stays.
  const line = [8, 0, 6, 1]
  const rec = reconcileEdit(line, 0, 0, ctx, TC)
  assert.equal(rec.kept, 3)
  assert.equal(rec.reason, null)
})

test('an edit that steals a later card cuts on deck legality', () => {
  // trick 2 plays the lone 5♦; editing the trick-1 lead to that same 5♦
  // keeps the trick-1 reply but the second 5♦ has no copies left.
  const line = [8, 0, 9, 1]
  const rec = reconcileEdit(line, 0, 9, ctx, TC)
  assert.deepEqual(rec.next, [9, 0])
  assert.equal(rec.kept, 1)
  assert.equal(rec.dropped, 2)
  assert.equal(rec.reason, 'deck')
})

test('raises and answers ride along when the story holds', () => {
  // trick 1, then mão raises to 3, pé accepts, mão leads trick 2. Editing
  // pé's trick-1 reply from 4 to 6 (mão's 3 still wins) keeps it all.
  const line = [8, 0, 27, 31, 6]
  const rec = reconcileEdit(line, 1, 1, ctx, TC)
  assert.deepEqual(rec.next, [8, 1, 27, 31, 6])
  assert.equal(rec.kept, 3)
  assert.equal(rec.reason, null)
})

test('a fold stays a legal ending for the kept tail', () => {
  const line = [8, 0, 27, 32]
  const rec = reconcileEdit(line, 0, 7, ctx, TC)
  assert.deepEqual(rec.next, [7, 0, 27, 32])
  assert.equal(rec.dropped, 0)
})

test('switching the eleven accept to a fold drops everything after', () => {
  const elevenCtx: BandContext = { dealer: 0, score: [11, 3] }
  const line = [33, 8, 0]
  const rec = reconcileEdit(line, 0, 34, elevenCtx, TC)
  assert.deepEqual(rec.next, [34])
  assert.equal(rec.kept, 0)
  assert.equal(rec.dropped, 2)
  assert.equal(rec.reason, 'illegal')
})

test('editing the frontier action reconciles trivially', () => {
  const line = [8, 0]
  const rec = reconcileEdit(line, 1, 6, ctx, TC)
  assert.deepEqual(rec.next, [8, 6])
  assert.equal(rec.kept, 0)
  assert.equal(rec.dropped, 0)
  assert.equal(rec.reason, null)
})
