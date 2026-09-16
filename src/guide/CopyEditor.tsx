'use client'

// Dev-only copy editing for the guide. Double-click any paragraph, heading or
// list item and it opens in a small modal editor holding the RAW catalog
// string (rich tags and all), driven by a compact vim: `fd` or Escape leaves
// insert mode, `:w` writes the string back to messages/<locale>.json, and
// C-c C-c writes and closes from any mode. The textarea itself is VimBox,
// shared with the guide's review comments (src/guide/ReviewComments.tsx).
//
// The element is matched back to its catalog key by its rendered text, so
// chapter components need no annotations. Strings carrying ICU placeholders
// ({rank}, {pp}, …) don't match and stay read-only — edit those in the JSON.
//
// Production builds alias this module to CopyEditor.prod.tsx (a no-op), and
// the API it writes through is disabled outside development.

import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { buildCatalogIndex } from './catalog-text'
import styles from './copy-editor.module.css'
import { keyForElement } from './guide-dom'
import { VimBox } from './VimBox'

export function CopyEditor() {
  const devBuild = process.env.NODE_ENV !== 'production'
  const locale = useLocale()
  const router = useRouter()
  const [messages, setMessages] = useState<Record<string, string> | null>(null)
  const [target, setTarget] = useState<{ key: string; original: string } | null>(null)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')

  // rendered text → catalog key, for matching a clicked element back
  const index = useMemo(() => buildCatalogIndex(messages ?? {}), [messages])

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

  const open = useCallback((key: string, raw: string) => {
    setTarget({ key, original: raw })
    setText(raw)
    setStatus('')
  }, [])

  // double-click a text element → find its catalog key by rendered text
  useEffect(() => {
    if (!devBuild || index.byText.size === 0) return
    const onDouble = (event: MouseEvent) => {
      const start = event.target as Element | null
      if (!start || start.closest(`.${styles.panel}`)) return
      // exact matches only: a prefix guess is fine for anchoring a comment,
      // but not for deciding which string an edit overwrites
      const match = keyForElement(index, start)
      if (!match || !messages) return
      event.preventDefault()
      open(match.key, messages[match.key])
    }
    document.addEventListener('dblclick', onDouble)
    return () => document.removeEventListener('dblclick', onDouble)
  }, [devBuild, index, messages, open])

  const close = useCallback(() => {
    setTarget(null)
  }, [])

  const write = useCallback(
    async (value: string, thenClose: boolean) => {
      if (!target) return
      setStatus('writing…')
      try {
        const res = await fetch('/api/dev/guide-copy', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale, key: target.key, value }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null
          setStatus(`error: ${body?.message ?? res.status}`)
          return
        }
        setMessages((prev) => (prev ? { ...prev, [target.key]: value } : prev))
        setStatus(`written to messages/${locale}.json`)
        router.refresh()
        if (thenClose) close()
      } catch (error) {
        setStatus(`error: ${String(error)}`)
      }
    },
    [close, locale, router, target],
  )

  const onWrite = useCallback(
    (value: string, thenClose: boolean) => {
      void write(value, thenClose)
    },
    [write],
  )

  if (!devBuild || !target) return null

  const dirty = text !== target.original

  return (
    <div className={styles.panel} data-copy-editor role="dialog" aria-label="Edit guide copy">
      <div className={styles.head}>
        <span className={styles.key}>{target.key}</span>
        <span className={styles.locale}>{locale}</span>
        {dirty ? <span className={styles.dirty}>modified</span> : null}
        <button type="button" className={styles.close} onClick={close} aria-label="Close editor">
          ✕
        </button>
      </div>
      <VimBox
        key={target.key}
        initialText={target.original}
        rows={Math.min(14, Math.max(4, Math.ceil(text.length / 78)))}
        status={status}
        onTextChange={setText}
        onWrite={onWrite}
        onClose={close}
        onNotice={setStatus}
        hint={<>fd → normal · :w write · C-c C-c write &amp; close · blank line = new paragraph</>}
      />
    </div>
  )
}
