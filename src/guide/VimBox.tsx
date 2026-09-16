'use client'

// The dev-only vim textarea, shared by the guide's copy editor and its review
// comments. It owns the VimState (src/guide/vim.ts), keeps the textarea caret
// in step with the vim cursor, and hands writes back to its parent:
//
//   Escape or `fd`   leave insert mode
//   :w               write            :q closes, :wq and :x write and close
//   C-c C-c          write and close, from any mode
//   C-s / Cmd-s      write
//
// The buffer is seeded once, on mount: a parent that switches targets renders
// this with a new `key` so the state starts over.
//
// Nothing here reaches a production bundle, because both of its callers are
// aliased to no-op stubs by next.config.mjs.

import { useCallback, useEffect, useRef, useState } from 'react'

import styles from './copy-editor.module.css'
import { applyNormalKey, initialVimState, type VimState } from './vim'

/**
 * Offsets where each *visual* (wrapped) line starts, measured in a mirror of
 * the textarea. j/k move by these, not by newlines — the strings are one long
 * line, so buffer-line motion would be a no-op.
 */
function visualLineStarts(area: HTMLTextAreaElement, text: string) {
  const style = getComputedStyle(area)
  const mirror = document.createElement('div')
  mirror.style.cssText = [
    'position:absolute',
    'visibility:hidden',
    'top:-9999px',
    'left:0',
    'white-space:pre-wrap',
    'overflow-wrap:break-word',
    'padding:0',
    'border:0',
    `width:${area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`,
    `font:${style.font}`,
    `letter-spacing:${style.letterSpacing}`,
    `line-height:${style.lineHeight}`,
    `tab-size:${style.tabSize}`,
  ].join(';')
  mirror.textContent = text
  document.body.appendChild(mirror)

  const starts = [0]
  const node = mirror.firstChild
  if (node) {
    const range = document.createRange()
    let lastTop: number | null = null
    for (let i = 0; i < text.length; i += 1) {
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const rect = range.getClientRects()[0]
      if (!rect) continue
      if (lastTop != null && rect.top > lastTop + 1) starts.push(i)
      lastTop = rect.top
    }
  }
  mirror.remove()
  return starts
}

export function VimBox({
  initialText,
  startInInsert = false,
  rows,
  hint,
  status,
  onTextChange,
  onWrite,
  onClose,
  onNotice,
}: {
  initialText: string
  /** comments are written far more often than read, so they open ready to type */
  startInInsert?: boolean
  rows: number
  hint: React.ReactNode
  /** the parent's message for the status line (write results, errors) */
  status?: string
  /** must be stable: a useState setter or a useCallback with no changing deps */
  onTextChange?: (text: string) => void
  onWrite: (text: string, thenClose: boolean) => void
  onClose: () => void
  onNotice?: (message: string) => void
}) {
  const [vim, setVim] = useState<VimState>(() => {
    const base = initialVimState(initialText)
    if (!startInInsert) return base
    return { ...base, mode: 'insert', cursor: initialText.length }
  })
  const [command, setCommand] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // `f` then `d` inside 400ms leaves insert mode, vim-style
  const lastInsert = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  // C-c C-c writes and closes; the first C-c only drops to normal mode
  const lastCtrlC = useRef(0)
  const lineCache = useRef<{ text: string; width: number; starts: number[] } | null>(null)

  useEffect(() => {
    onTextChange?.(vim.text)
  }, [onTextChange, vim.text])

  // keep the textarea's caret and the vim cursor in step
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    if (vim.mode === 'visual' && vim.anchor != null) {
      const from = Math.min(vim.anchor, vim.cursor)
      const to = Math.max(vim.anchor, vim.cursor)
      if (vim.linewise) {
        const start = vim.text.lastIndexOf('\n', Math.max(0, from - 1)) + 1
        const end = vim.text.indexOf('\n', to)
        area.setSelectionRange(start, end === -1 ? vim.text.length : end)
      } else {
        area.setSelectionRange(from, to + 1)
      }
    } else {
      area.setSelectionRange(
        vim.cursor,
        vim.mode === 'normal' ? Math.min(vim.cursor + 1, vim.text.length) : vim.cursor,
      )
    }
    if (document.activeElement !== area) area.focus()
  }, [vim])

  /** measured j/k, cached until the text or the width changes */
  const visualLine = useCallback(
    (cursor: number, delta: number) => {
      const area = areaRef.current
      if (!area) return cursor
      const cache = lineCache.current
      const starts =
        cache && cache.text === vim.text && cache.width === area.clientWidth
          ? cache.starts
          : visualLineStarts(area, vim.text)
      lineCache.current = { text: vim.text, width: area.clientWidth, starts }

      let line = 0
      while (line + 1 < starts.length && starts[line + 1] <= cursor) line += 1
      const column = cursor - starts[line]
      const to = Math.max(0, Math.min(starts.length - 1, line + delta))
      const from = starts[to]
      const end = to + 1 < starts.length ? starts[to + 1] - 1 : Math.max(0, vim.text.length - 1)
      return Math.max(from, Math.min(from + column, end))
    },
    [vim.text],
  )

  const runCommand = (line: string) => {
    const cmd = line.trim()
    setCommand(null)
    if (cmd === 'w') onWrite(vim.text, false)
    else if (cmd === 'wq' || cmd === 'x') onWrite(vim.text, true)
    else if (cmd === 'q' || cmd === 'q!') onClose()
    else onNotice?.(`not a command: :${cmd}`)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // C-c C-c: write and close, from every mode
    if (event.ctrlKey && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      const now = Date.now()
      if (now - lastCtrlC.current < 900) {
        lastCtrlC.current = 0
        onWrite(vim.text, true)
        return
      }
      lastCtrlC.current = now
      setCommand(null)
      setVim((state) => ({
        ...state,
        mode: 'normal',
        pending: '',
        count: '',
        anchor: null,
        cursor: state.mode === 'insert' ? Math.max(0, state.cursor - 1) : state.cursor,
      }))
      onNotice?.('C-c again to write and close')
      return
    }

    if (command != null) {
      if (event.key === 'Enter') {
        event.preventDefault()
        runCommand(command)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setCommand(null)
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        if (command === '') setCommand(null)
        else setCommand(command.slice(0, -1))
      } else if (event.key.length === 1) {
        event.preventDefault()
        setCommand(command + event.key)
      }
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      onWrite(vim.text, false)
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return

    if (vim.mode === 'insert') {
      if (event.key === 'Escape') {
        event.preventDefault()
        setVim((state) => ({ ...state, mode: 'normal', cursor: Math.max(0, state.cursor - 1) }))
        return
      }
      const now = Date.now()
      if (event.key === 'd' && lastInsert.current.key === 'f' && now - lastInsert.current.at < 400) {
        event.preventDefault()
        const area = areaRef.current
        const at = area ? area.selectionStart : vim.cursor
        setVim((state) => ({
          ...state,
          text: state.text.slice(0, Math.max(0, at - 1)) + state.text.slice(at),
          cursor: Math.max(0, at - 2),
          mode: 'normal',
        }))
        lastInsert.current = { key: '', at: 0 }
        return
      }
      lastInsert.current = { key: event.key, at: now }
      return // the textarea types it
    }

    if (event.key === ':') {
      event.preventDefault()
      setCommand('')
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setVim((state) => ({ ...state, mode: 'normal', pending: '', count: '', anchor: null }))
      return
    }
    if (event.key.length !== 1 && !['Backspace', 'Enter'].includes(event.key)) return

    event.preventDefault()
    setVim((state) => applyNormalKey(state, event.key, { visualLine }))
  }

  const modeLabel =
    vim.mode === 'insert'
      ? '-- INSERT --'
      : vim.mode === 'visual'
        ? vim.linewise
          ? '-- VISUAL LINE --'
          : '-- VISUAL --'
        : '-- NORMAL --'

  return (
    <>
      <textarea
        ref={areaRef}
        className={vim.mode === 'insert' ? `${styles.area} ${styles.areaInsert}` : styles.area}
        value={vim.text}
        spellCheck
        onChange={(event) => {
          const area = event.target
          setVim((state) => ({ ...state, text: area.value, cursor: area.selectionStart }))
        }}
        onKeyDown={onKeyDown}
        rows={rows}
      />
      <div className={styles.status}>
        {command != null ? (
          <span className={styles.cmdline}>:{command}</span>
        ) : (
          <span className={vim.mode === 'insert' ? styles.modeInsert : styles.mode}>{modeLabel}</span>
        )}
        {vim.count || vim.pending ? (
          <span className={styles.pending}>
            {vim.count}
            {vim.pending}
          </span>
        ) : null}
        <span className={styles.hint}>{hint}</span>
        {status ? <span className={styles.msg}>{status}</span> : null}
      </div>
    </>
  )
}
