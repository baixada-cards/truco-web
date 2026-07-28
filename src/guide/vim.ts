// A compact vim for the dev-only guide copy editor. Pure functions over
// {text, cursor, mode} so the behaviour is testable without a DOM (see
// vim.test.ts); anything that needs measurement — j/k over *visual* lines in
// a wrapped textarea — comes in through VimContext.
//
// Normal mode:
//   motions     h l 0 ^ $ w b e W B E gg G, f/F/t/T{char}, ; ,
//               j k (and gj gk) move by visual line, as in a wrapped buffer
//   edits       x s r{char} ~ J D C i a I A o O p P u
//   operators   d c y + motion or text object, plus dd cc yy
//   text objs   iw aw i" a" i' a' i( a( i[ a[ i{ a{
//   visual      v charwise, V linewise, then d c y x
//   counts      3w, d2w, 5x — digits before a command repeat it
// Marks, macros, search and named registers are not here.

export type VimMode = 'normal' | 'insert' | 'visual'

export interface VimState {
  text: string
  cursor: number
  mode: VimMode
  /** a half-typed command: an operator, a prefix (g), or one awaiting a char */
  pending: string
  /** digits typed before the command */
  count: string
  /** the unnamed register */
  register: string
  /** true when the register or the visual selection is whole lines */
  linewise: boolean
  /** where visual mode started */
  anchor: number | null
  /** the last f/F/t/T, for ; and , */
  lastFind: { command: string; char: string } | null
  undo: Array<{ text: string; cursor: number }>
}

/** measurement the pure engine can't do for itself */
export interface VimContext {
  /** move `delta` visual (wrapped) lines from `cursor`, keeping the column */
  visualLine?: (cursor: number, delta: number) => number
}

export function initialVimState(text: string): VimState {
  return {
    text,
    cursor: 0,
    mode: 'normal',
    pending: '',
    count: '',
    register: '',
    linewise: false,
    anchor: null,
    lastFind: null,
    undo: [],
  }
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

/** start of the next word; `big` is vim's WORD (whitespace-delimited) */
function nextWord(text: string, at: number, big = false) {
  let i = at
  const kind = big ? (SPACE.test(text[i] ?? ' ') ? 'space' : 'word') : classOf(text[i])
  const at_ = (j: number) => (big ? (SPACE.test(text[j] ?? ' ') ? 'space' : 'word') : classOf(text[j]))
  if (kind !== 'space') while (i < text.length && at_(i) === kind) i += 1
  while (i < text.length && at_(i) === 'space') i += 1
  return Math.min(i, text.length)
}

function prevWord(text: string, at: number, big = false) {
  const at_ = (j: number) => (big ? (SPACE.test(text[j] ?? ' ') ? 'space' : 'word') : classOf(text[j]))
  let i = at - 1
  while (i > 0 && at_(i) === 'space') i -= 1
  if (i <= 0) return 0
  const kind = at_(i)
  while (i > 0 && at_(i - 1) === kind) i -= 1
  return Math.max(0, i)
}

function wordEnd(text: string, at: number, big = false) {
  const at_ = (j: number) => (big ? (SPACE.test(text[j] ?? ' ') ? 'space' : 'word') : classOf(text[j]))
  let i = at + 1
  while (i < text.length && at_(i) === 'space') i += 1
  const kind = at_(i)
  while (i + 1 < text.length && at_(i + 1) === kind) i += 1
  return Math.min(i, Math.max(0, text.length - 1))
}

/** j/k without measurement: by newline, keeping the column */
function bufferLineMove(text: string, at: number, delta: number) {
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

/** f/F/t/T within the current line */
function findChar(text: string, at: number, command: string, char: string) {
  const from = lineStart(text, at)
  const to = lineEnd(text, at)
  if (command === 'f' || command === 't') {
    const start = at + (command === 't' ? 2 : 1)
    for (let i = start; i < to; i += 1) if (text[i] === char) return command === 't' ? i - 1 : i
    return null
  }
  const start = at - (command === 'T' ? 2 : 1)
  for (let i = start; i >= from; i -= 1) if (text[i] === char) return command === 'T' ? i + 1 : i
  return null
}

/** the target of a motion key, or null when the key isn't one */
export function motionTarget(state: VimState, key: string, ctx: VimContext = {}): number | null {
  const { text, cursor } = state
  switch (key) {
    case 'h':
      return Math.max(lineStart(text, cursor), cursor - 1)
    case 'l':
      return Math.min(lineEnd(text, cursor), cursor + 1)
    case 'j':
      return ctx.visualLine ? ctx.visualLine(cursor, 1) : bufferLineMove(text, cursor, 1)
    case 'k':
      return ctx.visualLine ? ctx.visualLine(cursor, -1) : bufferLineMove(text, cursor, -1)
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
    case 'W':
      return nextWord(text, cursor, true)
    case 'b':
      return prevWord(text, cursor)
    case 'B':
      return prevWord(text, cursor, true)
    case 'e':
      return wordEnd(text, cursor)
    case 'E':
      return wordEnd(text, cursor, true)
    case 'G':
      return Math.max(0, text.length - 1)
    default:
      return null
  }
}

/** iw/aw and the quote/bracket pairs, as [start, end) */
function textObject(text: string, cursor: number, around: boolean, object: string): [number, number] | null {
  const PAIRS: Record<string, [string, string]> = {
    '(': ['(', ')'],
    ')': ['(', ')'],
    b: ['(', ')'],
    '[': ['[', ']'],
    ']': ['[', ']'],
    '{': ['{', '}'],
    '}': ['{', '}'],
    '<': ['<', '>'],
    '>': ['<', '>'],
  }

  if (object === 'w' || object === 'W') {
    const big = object === 'W'
    const at_ = (j: number) => (big ? (SPACE.test(text[j] ?? ' ') ? 'space' : 'word') : classOf(text[j]))
    const kind = at_(cursor)
    let start = cursor
    let end = cursor
    while (start > 0 && at_(start - 1) === kind) start -= 1
    while (end + 1 < text.length && at_(end + 1) === kind) end += 1
    let stop = end + 1
    if (around) while (stop < text.length && at_(stop) === 'space') stop += 1
    return [start, stop]
  }

  if (object === '"' || object === "'" || object === '`') {
    const line = [lineStart(text, cursor), lineEnd(text, cursor)]
    let open = -1
    for (let i = line[0]; i < line[1]; i += 1) {
      if (text[i] !== object) continue
      if (open === -1) {
        if (i >= cursor) {
          open = i
          continue
        }
        open = i
        continue
      }
      if (i >= cursor) return around ? [open, i + 1] : [open + 1, i]
      open = -1
    }
    return null
  }

  const pair = PAIRS[object]
  if (!pair) return null
  let depth = 0
  let open = -1
  for (let i = cursor; i >= 0; i -= 1) {
    if (text[i] === pair[1] && i !== cursor) depth += 1
    else if (text[i] === pair[0]) {
      if (depth === 0) {
        open = i
        break
      }
      depth -= 1
    }
  }
  if (open === -1) return null
  depth = 0
  for (let i = open + 1; i < text.length; i += 1) {
    if (text[i] === pair[0]) depth += 1
    else if (text[i] === pair[1]) {
      if (depth === 0) return around ? [open, i + 1] : [open + 1, i]
      depth -= 1
    }
  }
  return null
}

function pushUndo(state: VimState): VimState['undo'] {
  return [...state.undo, { text: state.text, cursor: state.cursor }].slice(-100)
}

function clear(state: VimState): VimState {
  return { ...state, pending: '', count: '' }
}

function cut(state: VimState, from: number, to: number, enterInsert: boolean, linewise = false): VimState {
  const start = Math.max(0, Math.min(from, to))
  const end = Math.min(state.text.length, Math.max(from, to))
  const text = state.text.slice(0, start) + state.text.slice(end)
  return {
    ...state,
    undo: pushUndo(state),
    register: state.text.slice(start, end),
    linewise,
    text,
    cursor: enterInsert ? start : clamp(text, start),
    mode: enterInsert ? 'insert' : 'normal',
    pending: '',
    count: '',
    anchor: null,
  }
}

function yank(state: VimState, from: number, to: number, linewise = false): VimState {
  const start = Math.max(0, Math.min(from, to))
  const end = Math.min(state.text.length, Math.max(from, to))
  return {
    ...state,
    register: state.text.slice(start, end),
    linewise,
    pending: '',
    count: '',
    anchor: null,
    mode: 'normal',
    cursor: start,
  }
}

function insertAt(state: VimState, at: number, insert: string, cursorAfter: number): VimState {
  return {
    ...state,
    undo: pushUndo(state),
    text: state.text.slice(0, at) + insert + state.text.slice(at),
    cursor: cursorAfter,
    pending: '',
    count: '',
    anchor: null,
  }
}

/** apply an operator over a range; `inclusive` extends it by one character */
function operate(state: VimState, operator: string, from: number, to: number, linewise = false): VimState {
  if (operator === 'y') return yank(state, from, to, linewise)
  return cut(state, from, to, operator === 'c', linewise)
}

/** the whole line(s) the cursor sits on, for dd/cc/yy and V */
function lineRange(text: string, at: number, count: number, includeBreak: boolean): [number, number] {
  const start = lineStart(text, at)
  let end = lineEnd(text, at)
  for (let i = 1; i < count; i += 1) {
    if (end >= text.length) break
    end = lineEnd(text, end + 1)
  }
  return [start, Math.min(text.length, includeBreak && end < text.length ? end + 1 : end)]
}

/** one keypress in normal or visual mode */
export function applyNormalKey(state: VimState, key: string, ctx: VimContext = {}): VimState {
  const { text, cursor } = state
  const count = state.count ? Math.max(1, parseInt(state.count, 10)) : 1

  // ---- counts: 3w, d2w, 5x (but not r2 or f2, where the digit is data) ----

  if ((/^[1-9]$/.test(key) || (key === '0' && state.count)) && (state.pending === '' || 'dcy'.includes(state.pending))) {
    return { ...state, count: state.count + key }
  }

  // ---- a command is waiting for another key -------------------------------

  if (state.pending) {
    const pending = state.pending

    // r{char}: replace the character(s) under the cursor
    if (pending === 'r') {
      if (key.length !== 1) return clear(state)
      const end = Math.min(text.length, cursor + count)
      return {
        ...insertAt({ ...state, text: text.slice(0, cursor) + text.slice(end) }, cursor, key.repeat(count), cursor + count - 1),
        undo: pushUndo(state),
      }
    }

    // f/F/t/T{char}, possibly behind an operator (df, ct, …)
    const findCommand = pending.length <= 2 && 'fFtT'.includes(pending[pending.length - 1]) ? pending[pending.length - 1] : null
    if (findCommand) {
      if (key.length !== 1) return clear(state)
      let target: number | null = cursor
      for (let i = 0; i < count && target != null; i += 1) target = findChar(text, target, findCommand, key)
      if (target == null) return clear(state)
      const next = { ...state, lastFind: { command: findCommand, char: key } }
      const operator = pending.length === 2 ? pending[0] : null
      if (!operator) return { ...clear(next), cursor: target }
      const forward = findCommand === 'f' || findCommand === 't'
      return operate(next, operator, cursor, forward ? target + 1 : target)
    }

    if (pending === 'g') {
      if (key === 'g') return { ...clear(state), cursor: 0 }
      if (key === 'j' || key === 'k') {
        let target = cursor
        for (let i = 0; i < count; i += 1) target = motionTarget({ ...state, cursor: target }, key, ctx) ?? target
        return { ...clear(state), cursor: target }
      }
      return clear(state)
    }

    // an operator waiting for a motion or a text object
    const operator = pending[0]
    if ('dcy'.includes(operator)) {
      const rest = pending.slice(1)

      if (rest === '' && (key === 'i' || key === 'a')) return { ...state, pending: operator + key }
      if (rest === 'i' || rest === 'a') {
        const range = textObject(text, cursor, rest === 'a', key)
        if (!range) return clear(state)
        return operate(state, operator, range[0], range[1])
      }
      if (rest === '' && 'fFtT'.includes(key)) return { ...state, pending: operator + key }
      if (rest === '' && key === 'g') return { ...state, pending: operator + 'g' }
      if (rest === 'g') {
        if (key !== 'g') return clear(state)
        return operate(state, operator, 0, cursor)
      }
      if (key === operator) {
        const [from, to] = lineRange(text, cursor, count, operator !== 'c')
        return operate(state, operator, from, to, true)
      }

      let target: number | null = cursor
      for (let i = 0; i < count && target != null; i += 1) {
        target = motionTarget({ ...state, cursor: target }, key, ctx)
      }
      if (target == null) return clear(state)
      const inclusive = key === 'e' || key === 'E' || key === '$' || key === 'G'
      return operate(state, operator, cursor, inclusive ? target + 1 : target)
    }

    return clear(state)
  }

  // ---- motions -------------------------------------------------------------

  let motion: number | null = cursor
  for (let i = 0; i < count && motion != null; i += 1) {
    motion = motionTarget({ ...state, cursor: motion }, key, ctx)
  }
  if (motion != null && motionTarget(state, key, ctx) != null) {
    return { ...clear(state), cursor: motion }
  }

  // ---- visual mode ---------------------------------------------------------

  if (state.mode === 'visual') {
    const anchor = state.anchor ?? cursor
    const charwise: [number, number] = [Math.min(anchor, cursor), Math.max(anchor, cursor) + 1]
    const lines: [number, number] = [
      lineStart(text, Math.min(anchor, cursor)),
      Math.min(text.length, lineEnd(text, Math.max(anchor, cursor)) + 1),
    ]
    const range = state.linewise ? lines : charwise

    switch (key) {
      case 'd':
      case 'x':
        return cut(state, range[0], range[1], false, state.linewise)
      case 'c':
      case 's':
        return cut(state, range[0], range[1], true, state.linewise)
      case 'y':
        return yank(state, range[0], range[1], state.linewise)
      case 'V':
        return state.linewise ? { ...state, mode: 'normal', anchor: null, linewise: false } : { ...state, linewise: true }
      case 'v':
        return state.linewise ? { ...state, linewise: false } : { ...state, mode: 'normal', anchor: null }
      case 'o':
        return { ...state, cursor: anchor, anchor: cursor }
      case 'r':
        return { ...state, pending: 'r' }
      case '~': {
        const swapped = [...text.slice(range[0], range[1])]
          .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
          .join('')
        return {
          ...insertAt({ ...state, text: text.slice(0, range[0]) + text.slice(range[1]) }, range[0], swapped, range[0]),
          undo: pushUndo(state),
          mode: 'normal',
          anchor: null,
        }
      }
      case 'g':
        return { ...state, pending: 'g' }
      default:
        return clear(state)
    }
  }

  // ---- normal mode ---------------------------------------------------------

  switch (key) {
    case 'g':
    case 'r':
    case 'd':
    case 'c':
    case 'y':
      return { ...state, pending: key }
    case 'f':
    case 'F':
    case 't':
    case 'T':
      return { ...state, pending: key }
    case ';':
    case ',': {
      if (!state.lastFind) return clear(state)
      const flip: Record<string, string> = { f: 'F', F: 'f', t: 'T', T: 't' }
      const command = key === ';' ? state.lastFind.command : flip[state.lastFind.command]
      const target = findChar(text, cursor, command, state.lastFind.char)
      return target == null ? clear(state) : { ...clear(state), cursor: target }
    }
    case 'v':
      return { ...clear(state), mode: 'visual', anchor: cursor, linewise: false }
    case 'V':
      return { ...clear(state), mode: 'visual', anchor: cursor, linewise: true }
    // entering insert snapshots the text, so one `u` undoes the whole session
    case 'i':
      return { ...clear(state), mode: 'insert', undo: pushUndo(state) }
    case 'a':
      return { ...clear(state), mode: 'insert', cursor: Math.min(text.length, cursor + 1), undo: pushUndo(state) }
    case 'I':
      return { ...clear(state), mode: 'insert', cursor: lineStart(text, cursor), undo: pushUndo(state) }
    case 'A':
      return { ...clear(state), mode: 'insert', cursor: lineEnd(text, cursor), undo: pushUndo(state) }
    case 'o':
      return { ...insertAt(state, lineEnd(text, cursor), '\n', lineEnd(text, cursor) + 1), mode: 'insert' }
    case 'O':
      return { ...insertAt(state, lineStart(text, cursor), '\n', lineStart(text, cursor)), mode: 'insert' }
    case 'x':
      return text.length === 0 ? clear(state) : cut(state, cursor, Math.min(text.length, cursor + count), false)
    case 's':
      return text.length === 0
        ? { ...clear(state), mode: 'insert' }
        : cut(state, cursor, Math.min(text.length, cursor + count), true)
    case 'D':
      return cut(state, cursor, lineEnd(text, cursor), false)
    case 'C':
      return cut(state, cursor, lineEnd(text, cursor), true)
    case 'J': {
      const end = lineEnd(text, cursor)
      if (end >= text.length) return clear(state)
      let after = end + 1
      while (after < text.length && text[after] === ' ') after += 1
      return {
        ...insertAt({ ...state, text: text.slice(0, end) + text.slice(after) }, end, ' ', end),
        undo: pushUndo(state),
      }
    }
    case '~': {
      const char = text[cursor]
      if (!char) return clear(state)
      const swapped = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()
      return {
        ...state,
        undo: pushUndo(state),
        text: text.slice(0, cursor) + swapped + text.slice(cursor + 1),
        cursor: Math.min(text.length - 1, cursor + 1),
        count: '',
      }
    }
    case 'p':
    case 'P': {
      if (!state.register) return clear(state)
      const payload = state.register.repeat(count)
      if (state.linewise) {
        const at = key === 'p' ? Math.min(text.length, lineEnd(text, cursor) + 1) : lineStart(text, cursor)
        const block = payload.endsWith('\n') ? payload : `${payload}\n`
        return insertAt(state, at, block, at)
      }
      const at = key === 'p' ? Math.min(text.length, cursor + 1) : cursor
      return insertAt(state, at, payload, at + payload.length - 1)
    }
    case 'u': {
      const last = state.undo[state.undo.length - 1]
      if (!last) return clear(state)
      return { ...clear(state), text: last.text, cursor: clamp(last.text, last.cursor), undo: state.undo.slice(0, -1) }
    }
    default:
      return clear(state)
  }
}
