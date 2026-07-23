import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assignLiveShortcut,
  buildDefaultLiveShortcutMap,
  getLiveShortcutFromKeyboardEvent,
  sanitizeLiveShortcutMap,
} from './live-keyboard-shortcuts.ts'

test('assigning a shortcut clears any conflicting binding', () => {
  const shortcuts = assignLiveShortcut(buildDefaultLiveShortcutMap(), 'raise_stake', '1')

  assert.equal(shortcuts.raise_stake, '1')
  assert.equal(shortcuts.play_card_1, '')
})

test('default shortcuts include tab for the strength guide', () => {
  const shortcuts = buildDefaultLiveShortcutMap()

  assert.equal(shortcuts.toggle_strength_guide, 'Tab')
})

test('keyboard events normalize letter and digit shortcuts consistently', () => {
  assert.equal(
    getLiveShortcutFromKeyboardEvent({ key: 'a', code: 'KeyA', shiftKey: false }),
    'A',
  )
  assert.equal(
    getLiveShortcutFromKeyboardEvent({ key: '!', code: 'Digit1', shiftKey: true }),
    'Shift+1',
  )
  assert.equal(
    getLiveShortcutFromKeyboardEvent({ key: 'Tab', code: 'Tab', shiftKey: false }),
    'Tab',
  )
})

test('sanitizing legacy defaults upgrades to the live shortcut cluster', () => {
  const shortcuts = sanitizeLiveShortcutMap({
    raise_stake: 'T',
    accept_raise: 'A',
    decline_raise: 'D',
  })

  assert.equal(shortcuts.raise_stake, 'Q')
  assert.equal(shortcuts.accept_raise, 'W')
  assert.equal(shortcuts.decline_raise, 'E')
  assert.equal(shortcuts.hide_card_1, 'A')
  assert.equal(shortcuts.hide_card_2, 'S')
  assert.equal(shortcuts.hide_card_3, 'D')
  assert.equal(shortcuts.toggle_strength_guide, 'Tab')
})

test('sanitizing older shortcuts leaves strength guide unassigned when tab is already taken', () => {
  const shortcuts = sanitizeLiveShortcutMap({
    play_card_1: 'Tab',
    play_card_2: '2',
    play_card_3: '3',
    hide_card_1: 'A',
    hide_card_2: 'S',
    hide_card_3: 'D',
    raise_stake: 'Q',
    accept_raise: 'W',
    decline_raise: 'E',
  })

  assert.equal(shortcuts.play_card_1, 'Tab')
  assert.equal(shortcuts.toggle_strength_guide, '')
})
