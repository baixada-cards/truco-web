// A compact vim for the dev-only guide copy editor: enough normal and visual
// mode to edit a sentence without reaching for the mouse, and nothing else.
// Pure functions over {text, cursor, mode} so the behaviour is testable
// without a DOM (see vim.test.ts).
//
// Supported in normal mode:
//   motions   h l k j 0 ^ $ w b e gg G
//   edits     x s D C i a I A o O p P u
//   operators d c y with a motion, plus dd cc yy
//   visual    v, then a motion, then d / c / y / x
// Counts, marks, registers beyond the unnamed one, and search are not here.

export type VimMode = 'normal' | 'insert' | 'visual'

export interface VimState {
  text: string
  cursor: number
  mode: VimMode
  /** a half-typed command: an operator (d/c/y) or the g of gg */
  pending: string
  /** the unnamed register */
  register: string
  /** where visual mode started */
  anchor: number | null
  undo: Array<{ text: string; cursor: number }>
}

const WORD = /[\p{L}\p{N}_]/u
const SPACE = /\s/

function classOf(char: string | undefined) {
  if (char == null || SPACE.test(char)) return 'space'
  return WORD.test(char) ? 'word' : 'punct'
}

function lineStart(text: string, at: number) {
  const before = text.lastIndexOf('\n', Math.max(0, at - 1))
  return before === -1 ? 0 : before + 1
}

function lineEnd(text: string, at: number) {
  const after = text.indexOf('\n', at)
  return after === -1 ? text.length : after
}

function clamp(text: string, at: number) {
  return Math.max(0, Math.min(at, Math.max(0, text.length - 1)))
}

/** start of the next word, vim's `w` */
function nextWord(text: string, at: number) {
  let i = at
  const start = classOf(text[i])
  if (start !== 'space') {
    while (i < text.length && classOf(text[i]) === start) i += 1
  }
  while (i < text.length && classOf(text[i]) === 'space') i += 1
  return Math.min(i, text.length)
}

/** start of the previous word, vim's `b` */
function prevWord(text: string, at: number) {
  let i = at - 1
  while (i > 0 && classOf(text[i]) === 'space') i -= 1
  if (i <= 0) return 0
  const kind = classOf(text[i])
  while (i > 0 && classOf(text[i - 1]) === kind) i -= 1
  return Math.max(0, i)
}

/** end of the current or next word, vim's `e` */
function wordEnd(text: string, at: number) {
  let i = at + 1
  while (i < text.length && classOf(text[i]) === 'space') i += 1
  const kind = classOf(text[i])
  while (i + 1 < text.length && classOf(text[i + 1]) === kind) i += 1
  return Math.min(i, Math.max(0, text.length - 1))
}

function verticalMove(text: string, at: number, delta: number) {
  const start = lineStart(text, at)
  const column = at - start
  if (delta < 0) {
    if (start === 0) return at
    const prevStart = lineStart(text, start - 1)
    return Math.min(prevStart + column, Math.max(prevStart, start - 2))
  }
  const end = lineEnd(text, at)
  if (end >= text.length) return at
  const nextStart = end + 1
  return Math.min(nextStart + column, lineEnd(text, nextStart))
}

/** the target of a motion key, or null when the key isn't one */
export function motionTarget(state: VimState, key: string): number | null {
  const { text, cursor } = state
  switch (key) {
    case 'h':
      return Math.max(lineStart(text, cursor), cursor - 1)
    case 'l':
      return Math.min(lineEnd(text, cursor), cursor + 1)
    case 'j':
      return verticalMove(text, cursor, 1)
    case 'k':
      return verticalMove(text, cursor, -1)
    case '0':
      return lineStart(text, cursor)
    case '^': {
      const start = lineStart(text, cursor)
      let i = start
      while (i < text.length && text[i] !== '\n' && SPACE.test(text[i])) i += 1
      return i
    }
    case '$':
      return Math.max(lineStart(text, cursor), lineEnd(text, cursor) - 1)
    case 'w':
      return nextWord(text, cursor)
    case 'b':
      return prevWord(text, cursor)
    case 'e':
      return wordEnd(text, cursor)
    case 'G':
      return Math.max(0, text.length - 1)
    default:
      return null
  }
}

function pushUndo(state: VimState): VimState['undo'] {
  return [...state.undo, { text: state.text, cursor: state.cursor }].slice(-100)
}

function cut(state: VimState, from: number, to: number, enterInsert: boolean): VimState {
  const start = Math.max(0, Math.min(from, to))
  const end = Math.min(state.text.length, Math.max(from, to))
  return {
    ...state,
    undo: pushUndo(state),
    register: state.text.slice(start, end),
    text: state.text.slice(0, start) + state.text.slice(end),
    cursor: enterInsert ? start : clamp(state.text.slice(0, start) + state.text.slice(end), start),
    mode: enterInsert ? 'insert' : 'normal',
    pending: '',
    anchor: null,
  }
}

function yank(state: VimState, from: number, to: number): VimState {
  const start = Math.max(0, Math.min(from, to))
  const end = Math.min(state.text.length, Math.max(from, to))
  return { ...state, register: state.text.slice(start, end), pending: '', anchor: null, mode: 'normal', cursor: start }
}

function insertAt(state: VimState, at: number, insert: string, cursorAfter: number): VimState {
  return {
    ...state,
    undo: pushUndo(state),
    text: state.text.slice(0, at) + insert + state.text.slice(at),
    cursor: cursorAfter,
    pending: '',
    anchor: null,
  }
}

/** one keypress in normal or visual mode */
export function applyNormalKey(state: VimState, key: string): VimState {
  const { text, cursor } = state

  // an operator is waiting for its motion (d, c, y) — or we're mid-gg
  if (state.pending) {
    if (state.pending === 'g') {
      if (key === 'g') return { ...state, cursor: 0, pending: '' }
      return { ...state, pending: '' }
    }
    const operator = state.pending
    if (key === operator) {
      // dd / cc / yy — the whole line
      const start = lineStart(text, cursor)
      const end = Math.min(text.length, lineEnd(text, cursor) + (operator === 'c' ? 0 : 1))
      if (operator === 'y') return yank(state, start, end)
      return cut(state, start, end, operator === 'c')
    }
    const target = motionTarget(state, key)
    if (target == null) return { ...state, pending: '' }
    // w is exclusive for d/c but inclusive-ish for e/$
    const to = key === 'e' || key === '$' || key === 'G' ? target + 1 : target
    if (operator === 'y') return yank(state, cursor, to)
    return cut(state, cursor, to, operator === 'c')
  }

  if (state.mode === 'visual') {
    const target = motionTarget(state, key)
    if (target != null) return { ...state, cursor: target }
    const anchor = state.anchor ?? cursor
    if (key === 'd' || key === 'x') return cut(state, Math.min(anchor, cursor), Math.max(anchor, cursor) + 1, false)
    if (key === 'c') return cut(state, Math.min(anchor, cursor), Math.max(anchor, cursor) + 1, true)
    if (key === 'y') return yank(state, Math.min(anchor, cursor), Math.max(anchor, cursor) + 1)
    if (key === 'v') return { ...state, mode: 'normal', anchor: null }
    return state
  }

  const target = motionTarget(state, key)
  if (target != null) return { ...state, cursor: target }

  switch (key) {
    case 'g':
      return { ...state, pending: 'g' }
    case 'd':
    case 'c':
    case 'y':
      return { ...state, pending: key }
    case 'v':
      return { ...state, mode: 'visual', anchor: cursor }
    // entering insert snapshots the text, so one `u` undoes the whole session
    case 'i':
      return { ...state, mode: 'insert', undo: pushUndo(state) }
    case 'a':
      return { ...state, mode: 'insert', cursor: Math.min(text.length, cursor + 1), undo: pushUndo(state) }
    case 'I':
      return { ...state, mode: 'insert', cursor: lineStart(text, cursor), undo: pushUndo(state) }
    case 'A':
      return { ...state, mode: 'insert', cursor: lineEnd(text, cursor), undo: pushUndo(state) }
    case 'o':
      return { ...insertAt(state, lineEnd(text, cursor), '\n', lineEnd(text, cursor) + 1), mode: 'insert' }
    case 'O':
      return { ...insertAt(state, lineStart(text, cursor), '\n', lineStart(text, cursor)), mode: 'insert' }
    case 'x':
      return text.length === 0 ? state : cut(state, cursor, cursor + 1, false)
    case 's':
      return text.length === 0 ? { ...state, mode: 'insert' } : cut(state, cursor, cursor + 1, true)
    case 'D':
      return cut(state, cursor, lineEnd(text, cursor), false)
    case 'C':
      return cut(state, cursor, lineEnd(text, cursor), true)
    case 'p':
      return state.register
        ? insertAt(state, cursor + 1, state.register, cursor + state.register.length)
        : state
    case 'P':
      return state.register ? insertAt(state, cursor, state.register, cursor + state.register.length - 1) : state
    case 'u': {
      const last = state.undo[state.undo.length - 1]
      if (!last) return state
      return { ...state, text: last.text, cursor: clamp(last.text, last.cursor), undo: state.undo.slice(0, -1) }
    }
    default:
      return state
  }
}
