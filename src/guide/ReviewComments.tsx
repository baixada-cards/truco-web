'use client'

// Dev-only review comments on the field guide, in the spirit of Google Docs.
// The author reads a chapter on a local dev server and leaves notes on it
// instead of rewriting it; a coding agent reads them out of the JSON file
// afterwards.
//
//   select text in a paragraph   a small "Comment" button appears by the
//                                selection; click it to comment on the quote
//   Alt+C                        the same thing from the keyboard: comments on
//                                the selection, or, with nothing selected, on
//                                the paragraph the caret last landed in
//   Alt+click a paragraph        comment on the whole element, with no quote
//   numbered margin marker       open the thread: resolve, edit, delete, or
//                                add another comment to the same element
//   pill, bottom right           how many comments are open on this page, and
//                                the toggle that also shows resolved ones
//
// The box is the copy editor's textarea (src/guide/VimBox.tsx) with the same
// vim keymap, opened in insert mode: Escape or `fd` leaves insert, `:w`
// saves, `:q` closes, C-c C-c saves and closes.
//
// Elements are matched to a catalog key by their rendered text, exactly as
// the copy editor matches them, plus a text-prefix fallback so that strings
// carrying an ICU placeholder can still be commented on.
//
// Production builds alias this module to ReviewComments.prod.tsx (a no-op),
// and /api/dev/guide-comments is disabled outside development.

import { useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildCatalogIndex } from './catalog-text'
import { EDITABLE, keyForElement } from './guide-dom'
import type { GuideReviewComment } from './review-comment'
import styles from './review-comments.module.css'
import { VimBox } from './VimBox'

const API = '/api/dev/guide-comments'
const PANEL_WIDTH = 316

interface Spot {
  key: string
  index: number
  count: number
  top: number
  left: number
}

interface Draft {
  /** null until the first save, then the comment being edited */
  id: string | null
  key: string
  quote: string
  body: string
  top: number
  left: number
  /** bumps on every open, so the vim box starts a fresh buffer */
  seq: number
}

function shortTime(iso: string) {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toISOString().slice(0, 16).replace('T', ' ')
}

export function ReviewComments() {
  const devBuild = process.env.NODE_ENV !== 'production'
  const locale = useLocale()
  const [messages, setMessages] = useState<Record<string, string> | null>(null)
  const [comments, setComments] = useState<GuideReviewComment[]>([])
  const [showResolved, setShowResolved] = useState(false)
  const [spots, setSpots] = useState<Spot[]>([])
  const [anchored, setAnchored] = useState<ReadonlySet<string>>(new Set())
  const [pick, setPick] = useState<{ key: string; quote: string; top: number; left: number } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [thread, setThread] = useState<{ key: string; top: number; left: number } | null>(null)
  const [status, setStatus] = useState('')

  const anchors = useRef(new Map<string, HTMLElement>())
  const spotsRef = useRef<Spot[]>([])
  /** the last paragraph the caret or a click landed in, for Alt+C with no selection */
  const caret = useRef<string | null>(null)
  const seq = useRef(0)

  const index = useMemo(() => buildCatalogIndex(messages ?? {}), [messages])
  const mine = useMemo(() => comments.filter((one) => one.locale === locale), [comments, locale])
  const visible = useMemo(
    () => mine.filter((one) => showResolved || !one.resolved),
    [mine, showResolved],
  )

  useEffect(() => {
    if (!devBuild) return
    let live = true
    fetch(`/api/dev/guide-copy?locale=${encodeURIComponent(locale)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { messages?: Record<string, string> } | null) => {
        if (live && payload?.messages) setMessages(payload.messages)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [devBuild, locale])

  useEffect(() => {
    if (!devBuild) return
    let live = true
    fetch(`${API}?locale=${encodeURIComponent(locale)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { comments?: GuideReviewComment[] } | null) => {
        if (live && payload?.comments) setComments(payload.comments)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [devBuild, locale])

  /** where each marker sits right now, in viewport coordinates */
  const place = useCallback(() => {
    const counts = new Map<string, number>()
    for (const one of visible) counts.set(one.key, (counts.get(one.key) ?? 0) + 1)

    const next: Spot[] = []
    for (const [key, count] of counts) {
      const element = anchors.current.get(key)
      if (!element || !element.isConnected) continue
      const rect = element.getBoundingClientRect()
      next.push({
        key,
        index: 0,
        count,
        top: rect.top + 2,
        // the guide's right margin is narrow, so the marker rides its edge
        left: Math.min(rect.right + 12, window.innerWidth - 30),
      })
    }
    next.sort((a, b) => a.top - b.top)
    for (const [at, spot] of next.entries()) spot.index = at + 1

    const previous = spotsRef.current
    const same =
      previous.length === next.length &&
      next.every((spot, at) => {
        const was = previous[at]
        return (
          was.key === spot.key &&
          was.count === spot.count &&
          Math.abs(was.top - spot.top) < 0.5 &&
          Math.abs(was.left - spot.left) < 0.5
        )
      })
    if (same) return
    spotsRef.current = next
    setSpots(next)
  }, [visible])

  /** which catalog strings are on this page, and where */
  const rescan = useCallback(() => {
    const found = new Map<string, HTMLElement>()
    const matched: Element[] = []
    const elements = [...document.querySelectorAll(EDITABLE)]

    const take = (element: Element, prefix: boolean) => {
      // one marker per passage: an element that nests inside a match, or
      // wraps one, is the same piece of copy seen from another level
      if (matched.some((prev) => prev.contains(element) || element.contains(prev))) return
      const match = keyForElement(index, element, { prefix })
      if (!match || found.has(match.key)) return
      found.set(match.key, match.element)
      matched.push(match.element)
    }

    // exact matches first: a container's prefix must never shadow the
    // paragraph inside it that names its own string
    for (const element of elements) take(element, false)
    for (const element of elements) take(element, true)

    anchors.current = found
    setAnchored(new Set(found.keys()))
    place()
  }, [index, place])

  useEffect(() => {
    if (!devBuild || index.byText.size === 0) return
    rescan()
    // the copy editor refreshes the route after a write, which replaces the
    // paragraphs this was holding on to
    const root = document.querySelector('main') ?? document.body
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(rescan, 150)
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [devBuild, index, rescan])

  useEffect(() => {
    if (!devBuild) return
    place()
    let frame = 0
    const onMove = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    // the guide reveals sections with a rising transform, so a paragraph is
    // still moving for half a second after it scrolls into view
    document.addEventListener('animationend', onMove, true)
    document.addEventListener('transitionend', onMove, true)
    const observer = new ResizeObserver(onMove)
    observer.observe(document.body)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
      document.removeEventListener('animationend', onMove, true)
      document.removeEventListener('transitionend', onMove, true)
    }
  }, [devBuild, place])

  const anchorTo = useCallback((key: string) => {
    const rect = anchors.current.get(key)?.getBoundingClientRect()
    const top = rect ? rect.top : window.innerHeight / 3
    const left = rect ? rect.right + 16 : window.innerWidth - PANEL_WIDTH - 24
    return {
      top: Math.max(12, Math.min(top, Math.max(12, window.innerHeight - 260))),
      left: Math.max(12, Math.min(left, Math.max(12, window.innerWidth - PANEL_WIDTH - 12))),
    }
  }, [])

  const openDraft = useCallback(
    (target: { id: string | null; key: string; quote: string; body: string }) => {
      seq.current += 1
      setThread(null)
      setPick(null)
      setStatus('')
      setDraft({ ...target, ...anchorTo(target.key), seq: seq.current })
    },
    [anchorTo],
  )

  const closeDraft = useCallback(() => {
    setDraft(null)
    setStatus('')
  }, [])

  // a selection inside a guide paragraph offers the Comment button
  useEffect(() => {
    if (!devBuild || index.byText.size === 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const probe = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        setPick(null)
        return
      }
      const range = selection.getRangeAt(0)
      const node = range.commonAncestorContainer
      const element = (
        node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
      ) as Element | null
      // our own panels, and the copy editor's, are not guide copy
      if (!element || element.closest(`.${styles.panel}`) || document.querySelector('[data-copy-editor]')) {
        setPick(null)
        return
      }
      const match = keyForElement(index, element, { prefix: true })
      if (!match) {
        setPick(null)
        return
      }
      caret.current = match.key
      const quote = selection.toString().replace(/\s+/g, ' ').trim()
      if (selection.isCollapsed || quote.length < 2) {
        setPick(null)
        return
      }
      const rect = range.getBoundingClientRect()
      setPick({ key: match.key, quote, top: rect.top, left: rect.left + rect.width / 2 })
    }
    const onChange = () => {
      clearTimeout(timer)
      timer = setTimeout(probe, 80)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', onChange)
    }
  }, [devBuild, index])

  // Alt+click comments on a whole element; Alt+C does it from the keyboard
  useEffect(() => {
    if (!devBuild || index.byText.size === 0) return

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (!target || target.closest(`.${styles.panel}, .${styles.layer}, [data-copy-editor]`)) return
      const match = keyForElement(index, target, { prefix: true })
      if (!match) return
      caret.current = match.key
      if (!event.altKey) return
      event.preventDefault()
      openDraft({ id: null, key: match.key, quote: '', body: '' })
    }

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as Element | null
      // never from inside a text field: Option+C is how a Mac types ç, and
      // the copy editor is a textarea the guide is often edited in
      if (
        target?.closest(
          `.${styles.panel}, [data-copy-editor], textarea, input, [contenteditable="true"]`,
        )
      ) {
        return
      }
      if (event.key === 'Escape') {
        setThread(null)
        setPick(null)
        return
      }
      // Option+C types "ç" on a Mac layout, so this reads the physical key
      if (!event.altKey || event.code !== 'KeyC') return
      const selection = window.getSelection()
      const quote = selection ? selection.toString().replace(/\s+/g, ' ').trim() : ''
      const key = pick?.key ?? caret.current
      if (!key) return
      event.preventDefault()
      openDraft({ id: null, key, quote: pick ? pick.quote : quote.length > 1 ? quote : '', body: '' })
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [devBuild, index, openDraft, pick])

  const save = useCallback(
    async (text: string, thenClose: boolean) => {
      if (!draft) return
      const value = text.trim()
      if (value === '') {
        setStatus('nothing to save yet')
        return
      }
      setStatus('saving…')
      try {
        const res = draft.id
          ? await fetch(API, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: draft.id, body: value }),
            })
          : await fetch(API, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ locale, key: draft.key, quote: draft.quote, body: value }),
            })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null
          setStatus(`error: ${payload?.message ?? res.status}`)
          return
        }
        const { comment } = (await res.json()) as { comment: GuideReviewComment }
        setComments((prev) =>
          prev.some((one) => one.id === comment.id)
            ? prev.map((one) => (one.id === comment.id ? comment : one))
            : [...prev, comment],
        )
        // a second :w on the same box edits what the first one created
        setDraft((prev) => (prev ? { ...prev, id: comment.id } : prev))
        setStatus('saved to comments.json')
        if (thenClose) closeDraft()
      } catch (error) {
        setStatus(`error: ${String(error)}`)
      }
    },
    [closeDraft, draft, locale],
  )

  const onWrite = useCallback(
    (text: string, thenClose: boolean) => {
      void save(text, thenClose)
    },
    [save],
  )

  const setResolved = useCallback(async (comment: GuideReviewComment, resolved: boolean) => {
    const res = await fetch(API, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: comment.id, resolved }),
    }).catch(() => null)
    if (!res?.ok) return
    const payload = (await res.json()) as { comment: GuideReviewComment }
    setComments((prev) => prev.map((one) => (one.id === payload.comment.id ? payload.comment : one)))
  }, [])

  const remove = useCallback(async (comment: GuideReviewComment) => {
    const res = await fetch(`${API}?id=${encodeURIComponent(comment.id)}`, {
      method: 'DELETE',
    }).catch(() => null)
    if (!res?.ok) return
    setComments((prev) => prev.filter((one) => one.id !== comment.id))
  }, [])

  if (!devBuild) return null

  const onPage = mine.filter((one) => anchored.has(one.key))
  const openCount = onPage.filter((one) => !one.resolved).length
  const resolvedCount = onPage.length - openCount
  const threadComments = thread ? visible.filter((one) => one.key === thread.key) : []

  return (
    <>
      <div className={styles.layer}>
        {pick && !draft ? (
          <button
            type="button"
            className={styles.pick}
            style={{ top: pick.top, left: pick.left }}
            onClick={() => openDraft({ id: null, key: pick.key, quote: pick.quote, body: '' })}
          >
            Comment
          </button>
        ) : null}

        {spots.map((spot) => (
          <button
            key={spot.key}
            type="button"
            className={thread?.key === spot.key ? `${styles.marker} ${styles.markerOn}` : styles.marker}
            style={{ top: spot.top, left: spot.left }}
            aria-label={`${spot.count} comment(s) on ${spot.key}`}
            onClick={() =>
              setThread((prev) =>
                prev?.key === spot.key ? null : { key: spot.key, ...anchorTo(spot.key) },
              )
            }
          >
            {spot.index}
            {spot.count > 1 ? <span className={styles.count}>{spot.count}</span> : null}
          </button>
        ))}
      </div>

      {thread && threadComments.length > 0 ? (
        <div
          className={styles.panel}
          style={{ top: thread.top, left: thread.left }}
          role="dialog"
          aria-label="Guide review thread"
        >
          <div className={styles.head}>
            <span className={styles.key}>{thread.key}</span>
            <button
              type="button"
              className={styles.close}
              onClick={() => setThread(null)}
              aria-label="Close thread"
            >
              ✕
            </button>
          </div>
          {threadComments.map((comment) => (
            <div
              key={comment.id}
              className={comment.resolved ? `${styles.item} ${styles.itemDone}` : styles.item}
            >
              {comment.quote ? <div className={styles.quote}>{comment.quote}</div> : null}
              <div className={styles.body}>{comment.body}</div>
              <div className={styles.meta}>
                <span>{shortTime(comment.createdAt)}</span>
                {comment.resolved ? <span className={styles.done}>resolved</span> : null}
                <span className={styles.actions}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => void setResolved(comment, !comment.resolved)}
                  >
                    {comment.resolved ? 'reopen' : 'resolve'}
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() =>
                      openDraft({
                        id: comment.id,
                        key: comment.key,
                        quote: comment.quote,
                        body: comment.body,
                      })
                    }
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.danger}`}
                    onClick={() => void remove(comment)}
                  >
                    delete
                  </button>
                </span>
              </div>
            </div>
          ))}
          <div className={styles.foot}>
            <button
              type="button"
              className={styles.action}
              onClick={() => openDraft({ id: null, key: thread.key, quote: '', body: '' })}
            >
              + comment on this
            </button>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div
          className={styles.panel}
          style={{ top: draft.top, left: draft.left }}
          role="dialog"
          aria-label="Guide review comment"
        >
          <div className={styles.head}>
            <span className={styles.key}>{draft.key}</span>
            <button
              type="button"
              className={styles.close}
              onClick={closeDraft}
              aria-label="Close comment"
            >
              ✕
            </button>
          </div>
          {draft.quote ? <div className={styles.quote}>{draft.quote}</div> : null}
          <VimBox
            key={`draft-${draft.seq}`}
            initialText={draft.body}
            startInInsert
            rows={4}
            status={status}
            onWrite={onWrite}
            onClose={closeDraft}
            onNotice={setStatus}
            hint={<>:w save · C-c C-c close</>}
          />
        </div>
      ) : null}

      {onPage.length > 0 ? (
        <div className={styles.pill}>
          <span>
            <span className={styles.pillCount}>{openCount}</span> open
          </span>
          {resolvedCount > 0 ? (
            <button
              type="button"
              className={showResolved ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
              onClick={() => setShowResolved((on) => !on)}
            >
              {showResolved ? 'hide resolved' : `show resolved (${resolvedCount})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
