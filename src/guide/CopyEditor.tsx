'use client'

// Dev-only copy editing for the guide. Double-click any paragraph, heading or
// list item and it opens in a small modal editor holding the RAW catalog
// string (rich tags and all), driven by a compact vim: `fd` or Escape leaves
// insert mode, `:w` writes the string back to messages/<locale>.json.
//
// The element is matched back to its catalog key by its rendered text, so
// chapter components need no annotations. Strings carrying ICU placeholders
// ({rank}, {pp}, …) don't match and stay read-only — edit those in the JSON.
//
// Production builds alias this module to CopyEditor.prod.tsx (a no-op), and
// the API it writes through is disabled outside development.

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import styles from './copy-editor.module.css'
import { applyNormalKey, type VimState } from './vim'

const EDITABLE = 'p, li, dd, dt, h1, h2, h3, figcaption, blockquote, aside, span, b, i, em, td, th'

/** rendered text of a raw catalog string: tags out, whitespace collapsed */
function renderedText(raw: string) {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function domText(el: Element) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function CopyEditor() {
  const devBuild = process.env.NODE_ENV !== 'production'
  const locale = useLocale()
  const router = useRouter()
  const [messages, setMessages] = useState<Record<string, string> | null>(null)
  const [target, setTarget] = useState<{ key: string; original: string } | null>(null)
  const [vim, setVim] = useState<VimState>({ text: '', cursor: 0, mode: 'normal', pending: '', register: '', anchor: null, undo: [] })
  const [command, setCommand] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // `f` then `d` inside 400ms leaves insert mode, vim-style
  const lastInsert = useRef<{ key: string; at: number }>({ key: '', at: 0 })

  // rendered text → catalog key, for matching a clicked element back
  const index = useMemo(() => {
    const map = new Map<string, string>()
    if (!messages) return map
    for (const [key, raw] of Object.entries(messages)) {
      if (/\{[a-zA-Z]/.test(raw)) continue // ICU placeholders can't be matched
      const text = renderedText(raw)
      if (text.length < 2 || map.has(text)) continue
      map.set(text, key)
    }
    return map
  }, [messages])

  useEffect(() => {
    if (!devBuild) return
    let live = true
    fetch(`/api/dev/guide-copy?locale=${encodeURIComponent(locale)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { messages?: Record<string, string> } | null) => {
        if (live && body?.messages) setMessages(body.messages)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [devBuild, locale])

  const open = useCallback(
    (key: string, raw: string) => {
      setTarget({ key, original: raw })
      setVim({ text: raw, cursor: 0, mode: 'normal', pending: '', register: '', anchor: null, undo: [] })
      setCommand(null)
      setStatus('')
    },
    [],
  )

  // double-click a text element → find its catalog key by rendered text
  useEffect(() => {
    if (!devBuild || index.size === 0) return
    const onDouble = (event: MouseEvent) => {
      const start = event.target as Element | null
      if (!start || start.closest(`.${styles.panel}`)) return
      let node: Element | null = start.closest(EDITABLE)
      for (let depth = 0; node && depth < 6; depth += 1) {
        const key = index.get(domText(node))
        if (key && messages) {
          event.preventDefault()
          open(key, messages[key])
          return
        }
        node = node.parentElement?.closest(EDITABLE) ?? null
      }
    }
    document.addEventListener('dblclick', onDouble)
    return () => document.removeEventListener('dblclick', onDouble)
  }, [devBuild, index, messages, open])

  const close = useCallback(() => {
    setTarget(null)
    setCommand(null)
  }, [])

  const write = useCallback(
    async (thenClose: boolean) => {
      if (!target) return
      setStatus('writing…')
      try {
        const res = await fetch('/api/dev/guide-copy', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale, key: target.key, value: vim.text }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null
          setStatus(`error: ${body?.message ?? res.status}`)
          return
        }
        setMessages((prev) => (prev ? { ...prev, [target.key]: vim.text } : prev))
        setStatus(`written to messages/${locale}.json`)
        router.refresh()
        if (thenClose) close()
      } catch (error) {
        setStatus(`error: ${String(error)}`)
      }
    },
    [close, locale, router, target, vim.text],
  )

  const runCommand = useCallback(
    (line: string) => {
      const cmd = line.trim()
      setCommand(null)
      if (cmd === 'w') void write(false)
      else if (cmd === 'wq' || cmd === 'x') void write(true)
      else if (cmd === 'q') close()
      else if (cmd === 'q!') close()
      else setStatus(`not a command: :${cmd}`)
    },
    [close, write],
  )

  // keep the textarea's caret and the vim cursor in step
  useEffect(() => {
    const area = areaRef.current
    if (!area || !target) return
    if (vim.mode === 'visual' && vim.anchor != null) {
      area.setSelectionRange(Math.min(vim.anchor, vim.cursor), Math.max(vim.anchor, vim.cursor) + 1)
    } else {
      area.setSelectionRange(vim.cursor, vim.mode === 'normal' ? Math.min(vim.cursor + 1, vim.text.length) : vim.cursor)
    }
    if (document.activeElement !== area) area.focus()
  }, [target, vim])

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!target) return

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
      void write(false)
      return
    }

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
      setVim((state) => ({ ...state, mode: 'normal', pending: '', anchor: null }))
      return
    }
    if (event.key.length !== 1 && !['Backspace', 'Enter'].includes(event.key)) return

    event.preventDefault()
    setVim((state) => applyNormalKey(state, event.key))
  }

  if (!devBuild || !target) return null

  const dirty = vim.text !== target.original

  return (
    <div className={styles.panel} role="dialog" aria-label="Edit guide copy">
      <div className={styles.head}>
        <span className={styles.key}>{target.key}</span>
        <span className={styles.locale}>{locale}</span>
        {dirty ? <span className={styles.dirty}>modified</span> : null}
        <button type="button" className={styles.close} onClick={close} aria-label="Close editor">
          ✕
        </button>
      </div>
      <textarea
        ref={areaRef}
        className={styles.area}
        value={vim.text}
        spellCheck
        onChange={(event) => {
          const area = event.target
          setVim((state) => ({ ...state, text: area.value, cursor: area.selectionStart }))
        }}
        onKeyDown={onKeyDown}
        rows={Math.min(14, Math.max(4, Math.ceil(vim.text.length / 78)))}
      />
      <div className={styles.status}>
        {command != null ? (
          <span className={styles.cmdline}>:{command}</span>
        ) : (
          <span className={vim.mode === 'insert' ? styles.modeInsert : styles.mode}>
            {vim.mode === 'insert' ? '-- INSERT --' : vim.mode === 'visual' ? '-- VISUAL --' : '-- NORMAL --'}
          </span>
        )}
        <span className={styles.hint}>fd → normal · :w write · :wq write &amp; close · :q close</span>
        {status ? <span className={styles.msg}>{status}</span> : null}
      </div>
    </div>
  )
}
