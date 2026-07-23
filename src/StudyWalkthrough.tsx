'use client'

// Tour v2.2 — focus-first attention (plan 82). Each step has at most one
// intended interaction: only that control is lifted above the blocking overlay
// (surgical selectors, never whole sections), wrong clicks land on the blocker
// and do nothing, and the tour advances itself when the lab state shows the
// action happened. The eye is led by FOCUS (an N-hole spotlight over the real
// UI) first, with a crisp pulse ring on the exact control to click.
//
// All decoration is attribute-driven (data-tour-lift / -allow / -glow, CSS does
// pointer-events / z-index): teardown is a single global attribute sweep
// (lib/tour-dom), so an abrupt close (Esc) or a mid-tour remount can never
// strand a style and leave the page inert. NEXT stays the skip path; every
// step re-forces the state it needs, so skipping never strands the story.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'

import styles from './StudyWalkthrough.module.css'
import { clearDecorations, clearTourDom, markStepDom, type StepSelectors } from './lib/tour-dom'
import { TOUR_STEPS, asGroups, type TourObserve } from './lib/tour-steps'

/** what the tour may do to the lab (see StudyLab's mount site) */
export interface TourApi {
  apply: (s: string) => void
  setView: (v: 'strategy') => void
  setLayout: (l: 'grid' | 'list') => void
  /** force the pinned-hand panel open (it collapses on narrow viewports) */
  openHand: () => void
  /** move the rail cursor to a specific decision (open that plate) */
  focusDecision: (k: number) => void
  ready: boolean
}

const STEPS = TOUR_STEPS
const CONFIRM = '[data-tour="confirm"]'

type Rect = { top: number; left: number; width: number; height: number }

const rectsUnion = (rs: Rect[]): Rect | null => {
  if (rs.length === 0) return null
  const top = Math.min(...rs.map((r) => r.top))
  const left = Math.min(...rs.map((r) => r.left))
  const right = Math.max(...rs.map((r) => r.left + r.width))
  const bottom = Math.max(...rs.map((r) => r.top + r.height))
  return { top, left, width: right - left, height: bottom - top }
}

const sameRects = (a: Rect[], b: Rect[]) =>
  a.length === b.length &&
  a.every((r, i) => r.top === b[i].top && r.left === b[i].left && r.width === b[i].width && r.height === b[i].height)

export function StudyWalkthrough({
  open,
  onClose,
  tour,
  observe,
}: {
  open: boolean
  onClose: () => void
  tour: TourApi
  observe: TourObserve
}) {
  const t = useTranslations('Study.walkthrough')
  const locale = useLocale()
  const [step, setStep] = useState(0)
  const [rects, setRects] = useState<Rect[]>([])
  const [glowRects, setGlowRects] = useState<Rect[]>([])
  const [tick, setTick] = useState(0)
  const appliedFor = useRef(-1)
  /** lab state as it stood once this step's setup settled */
  const entryRef = useRef<{ obs: TourObserve; at: number }>({ obs: observe, at: 0 })
  const advanceTimer = useRef<number | null>(null)

  const last = step === STEPS.length - 1

  const finish = useCallback(() => {
    setStep(0)
    setRects([])
    onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      // heal any decoration a prior instance may have left behind, then start
      clearTourDom(document)
      setStep(0)
      setRects([])
      appliedFor.current = -1
    }
  }, [open])

  // fixed teaching conditions: force each step's lab state on entry, once per
  // visit, deferred until the manifest is in
  useEffect(() => {
    if (!open || !tour.ready || appliedFor.current === step) return
    appliedFor.current = step
    const def = STEPS[step]
    if (def.apply) tour.apply(def.apply)
    if (def.layout) tour.setLayout(def.layout)
    if (def.apply) tour.setView('strategy')
    if (def.hand) tour.openHand()
    if (def.cursorK !== undefined) tour.focusDecision(def.cursorK)
    entryRef.current = { obs: observe, at: Date.now() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, tour.ready])
  useEffect(() => {
    if (!open) appliedFor.current = -1
  }, [open])

  // auto-advance: watch the lab state; while the step's setup is still settling
  // (600ms) keep refreshing the entry snapshot instead of judging, then advance
  // shortly after the intended action lands
  useEffect(() => {
    if (!open) return
    const def = STEPS[step]
    if (!def.advanceWhen) return
    if (Date.now() - entryRef.current.at < 600) {
      entryRef.current = { ...entryRef.current, obs: observe }
      return
    }
    if (advanceTimer.current !== null) return
    if (def.advanceWhen(observe, entryRef.current.obs)) {
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null
        setStep((s) => Math.min(s + 1, STEPS.length - 1))
      }, 600)
    }
  }, [open, step, observe, tick])
  // a scheduled advance survives state churn; it only dies with the step
  useEffect(
    () => () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current)
        advanceTimer.current = null
      }
    },
    [open, step],
  )

  // Block USER scrolling (wheel, touch, and the scroll keys — Space, PageUp/Down,
  // Home/End, arrows) while the tour is open, so the page can't drift out from
  // under the spotlight. We prevent the events rather than set body
  // overflow:hidden, because the tour still needs to scroll targets into view
  // PROGRAMMATICALLY (scrollBy/scrollIntoView don't dispatch these events). Keys
  // are left alone when a form control / the whitelisted control / a tour button
  // is focused, so Space still activates Next and typing still works. Restores
  // the user's original scroll position on close.
  useEffect(() => {
    if (!open) return
    const prevScroll = window.scrollY
    const stopScroll = (e: Event) => e.preventDefault()
    const SCROLL_KEYS = new Set([' ', 'Spacebar', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'])
    const onKey = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key)) return
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.tagName === 'BUTTON' ||
          el.closest('[data-tour-allow]'))
      ) {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('wheel', stopScroll, { passive: false })
    window.addEventListener('touchmove', stopScroll, { passive: false })
    window.addEventListener('keydown', onKey, { passive: false })
    return () => {
      window.removeEventListener('wheel', stopScroll)
      window.removeEventListener('touchmove', stopScroll)
      window.removeEventListener('keydown', onKey)
      window.scrollTo({ top: prevScroll })
    }
  }, [open])

  // interaction whitelist + attention marks, all attribute-driven (CSS does the
  // pointer-events / z-index / glow). The scan re-runs so controls that mount
  // mid-step get marked; on step change or close the whole thing is swept by
  // global query — no closure bookkeeping to get out of sync, so no abrupt
  // close can leave the page inert.
  useEffect(() => {
    if (!open) return
    const def = STEPS[step]
    const sel: StepSelectors = { lift: def.lift, allow: def.allow, glow: def.glow }
    clearDecorations(document)
    markStepDom(document, sel)
    const iv = window.setInterval(() => markStepDom(document, sel), 400)
    return () => {
      window.clearInterval(iv)
      clearTourDom(document)
    }
  }, [open, step])

  // final safety net: whatever the unmount path, leave zero residue
  useEffect(() => () => clearTourDom(document), [])

  // Spotlight measurement. On step entry we CLEAR the spotlight, then measure
  // per animation frame until the target is stable (this step's apply reshapes
  // the DOM — a plate appears, the panel repopulates — over a frame or two), and
  // only THEN show the ring, already at its final position. So the ring never
  // slides from a stale/pre-layout position into place; it just appears where it
  // belongs. After it settles, a slow interval keeps it glued through scroll.
  useEffect(() => {
    if (!open) return
    const def = STEPS[step]
    const groups = asGroups(def.target)
    const glowSels = def.glow ?? []
    // wipe the previous step's spotlight so nothing lingers or slides
    setRects([])
    setGlowRects([])
    let settled = false
    let scrolled = false
    let lastRaw: Rect[] | null = null
    let frames = 0
    let raf = 0
    const rectsOf = (list: string[]) =>
      list
        .flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s)))
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { top: r.top, left: r.left, width: r.width, height: r.height }
        })
        .filter((r) => r.width > 0 && r.height > 0)
    // one hole per target group (a group's selectors merge into one tight rect)
    const measureGroups = () =>
      groups.map((g) => rectsUnion(rectsOf(g))).filter((r): r is Rect => r !== null)
    const syncGlow = () => {
      const glows = rectsOf(glowSels)
      setGlowRects((prev) => (sameRects(prev, glows) ? prev : glows))
    }
    const commit = (next: Rect[]) => {
      if (!scrolled) {
        scrolled = true
        // bring the region into view (targets can stack below the fold); instant,
        // not smooth, so the spotlight never slides in from an off position
        const u = rectsUnion(next)!
        const vh = window.innerHeight || 800
        if (u.top < 40 || u.top > vh * 0.55 || u.top + u.height > vh) {
          const targetTop = u.height > vh * 0.8 ? 40 : Math.max(40, (vh - u.height) / 2)
          window.scrollBy({ top: u.top - targetTop })
        }
      }
      setRects(next)
    }
    // settle: RAF until the FOCUS region is stable (two equal measures) or a
    // safety cap — that's the ring that must not visibly jump. The glow arrow,
    // being small, is synced every frame so it appears as soon as its target
    // exists rather than waiting on the focus. Frozen while an advance is pending.
    const settle = () => {
      if (advanceTimer.current === null) {
        syncGlow()
        const next = measureGroups()
        frames += 1
        if (next.length > 0 && ((lastRaw && sameRects(lastRaw, next)) || frames > 40)) {
          settled = true
          commit(next)
          return
        }
        lastRaw = next
      }
      raf = requestAnimationFrame(settle)
    }
    raf = requestAnimationFrame(settle)
    // track: once settled, keep the spotlight glued as the page scrolls/resizes
    const track = () => {
      if (!settled || advanceTimer.current !== null) return
      const glows = rectsOf(glowSels)
      setGlowRects((prev) => (sameRects(prev, glows) ? prev : glows))
      const next = measureGroups()
      setRects((prev) => (next.length === 0 ? (prev.length ? [] : prev) : sameRects(prev, next) ? prev : next))
      setTick((n) => n + 1)
    }
    const iv = window.setInterval(track, 400)
    window.addEventListener('resize', track)
    window.addEventListener('scroll', track, true)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(iv)
      window.removeEventListener('resize', track)
      window.removeEventListener('scroll', track, true)
    }
  }, [open, step])

  // keyboard: Esc closes the tour — unless a lab dialog is up, which owns it
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector(CONFIRM)) return
      finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, finish])

  if (!open) return null

  const def = STEPS[step]
  // one hole per target group (measured pre-merged)
  const holes = rects
  const union = rectsUnion(holes)

  // anchor the card on the glowed control (the thing being pointed at) when
  // there is one, else the focused region
  const glowUnion = rectsUnion(glowRects)
  const anchor = glowUnion ?? union

  // a side-placed card clears the WHOLE section named by cardAnchor (the rail,
  // the hand panel) horizontally, while staying vertically near the discussed
  // control — so it never covers any of the history / the panel
  const sideAnchor = (() => {
    if (!def.cardAnchor) return anchor
    const el = document.querySelector<HTMLElement>(def.cardAnchor)
    if (!el) return anchor
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, width: r.width, height: r.height }
  })()

  // card placement: a per-step side preference wins where it fits (keeps the
  // card off the rail history / the hand panel); otherwise below / above / side
  const pad = 10
  const cardW = 340
  const cardH = 300
  // guard against degenerate 0 reads (a transiently-unlaid-out viewport)
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280
  const vhOuter = (typeof window !== 'undefined' && window.innerHeight) || 800
  let tipStyle: React.CSSProperties
  let placement = 'center'
  const sideStyle = (dir: 'left' | 'right', a: Rect): React.CSSProperties => {
    const left = dir === 'right' ? Math.min(a.left + a.width + pad, vw - cardW - 8) : Math.max(16, a.left - cardW - pad)
    const v = anchor ?? a
    const top = Math.max(16, Math.min(vhOuter - cardH - 16, v.top + v.height / 2 - cardH / 2))
    return { top, left }
  }
  if (anchor && sideAnchor) {
    const fitsRight = sideAnchor.left + sideAnchor.width + pad + cardW < vw
    const fitsLeft = sideAnchor.left - pad - cardW > 8
    if (def.cardSide === 'right' && fitsRight) {
      placement = 'side'
      tipStyle = sideStyle('right', sideAnchor)
    } else if (def.cardSide === 'left' && fitsLeft) {
      placement = 'side'
      tipStyle = sideStyle('left', sideAnchor)
    } else if (anchor.top + anchor.height + cardH < vhOuter) {
      placement = 'below'
      tipStyle = { top: anchor.top + anchor.height + pad, left: Math.max(16, Math.min(vw - 356, anchor.left + anchor.width / 2 - 170)) }
    } else if (anchor.top - cardH > 16) {
      placement = 'above'
      tipStyle = { top: anchor.top - pad, left: Math.max(16, Math.min(vw - 356, anchor.left + anchor.width / 2 - 170)), transform: 'translateY(-100%)' }
    } else {
      placement = 'side'
      tipStyle = sideStyle(fitsRight || !fitsLeft ? 'right' : 'left', anchor)
    }
  } else {
    tipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  // never cover the exact thing the user must click (the glowed control if any,
  // else the first allowed element): nudge the card clear of its bounding box
  if (!tipStyle.transform && typeof tipStyle.top === 'number') {
    const avoid =
      glowUnion ??
      (def.allow?.length
        ? (() => {
            const el = document.querySelector<HTMLElement>(def.allow[0])
            if (!el) return null
            const r = el.getBoundingClientRect()
            return { top: r.top, left: r.left, width: r.width, height: r.height }
          })()
        : null)
    if (avoid) {
      const left = tipStyle.left as number
      const top = tipStyle.top
      const ar = { l: avoid.left, r: avoid.left + avoid.width, t: avoid.top, b: avoid.top + avoid.height }
      const overlaps = left < ar.r && left + cardW > ar.l && top < ar.b && top + cardH > ar.t
      if (overlaps) {
        // prefer sliding sideways (keeps side-preferred cards on their side)
        const room = { right: vw - ar.r, left: ar.l }
        if (Math.max(room.right, room.left) > cardW + pad) {
          tipStyle.left = room.right >= room.left ? Math.min(ar.r + pad, vw - cardW - 8) : Math.max(16, ar.l - cardW - pad)
        } else {
          const below = ar.b + 12
          tipStyle.top = below + cardH < vhOuter ? below : Math.max(16, ar.t - cardH - 12)
        }
      }
    }
  }

  const guideLink = (path: string | undefined, chunks: React.ReactNode) =>
    path ? (
      <a
        className={styles.guideLink}
        href={`/${locale}/lab/study/guide/${path}`}
        target="_blank"
        rel="noreferrer"
      >
        {chunks}
      </a>
    ) : (
      <>{chunks}</>
    )

  const body = t.rich(`steps.${def.key}.body`, {
    b: (chunks) => <b>{chunks}</b>,
    g: (chunks) => guideLink(def.guide, chunks),
    g2: (chunks) => guideLink(def.guide2, chunks),
  })

  const vh = (typeof window !== 'undefined' && window.innerHeight) || 800
  const R = 6 // hole padding

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('ariaLabel')}>
      {rects.length > 0 ? (
        <>
          {/* N-hole spotlight via an SVG mask (not box-shadow, which
              miscomposites in Chromium): white dims, black punches a hole */}
          <svg className={styles.mask} width={vw} height={vh} aria-hidden>
            <defs>
              <mask id="tour-mask">
                <rect x={0} y={0} width={vw} height={vh} fill="white" />
                {holes.map((r, i) => (
                  <rect
                    key={i}
                    x={r.left - R}
                    y={r.top - R}
                    width={r.width + R * 2}
                    height={r.height + R * 2}
                    rx={7}
                    fill="black"
                  />
                ))}
              </mask>
            </defs>
            <rect x={0} y={0} width={vw} height={vh} fill="rgba(31,22,16,0.7)" mask="url(#tour-mask)" />
          </svg>
          {holes.map((r, i) =>
            // skip the thin focus ring where the glow ring already outlines the
            // same control (avoids the doubled, offset-looking double outline)
            glowUnion &&
            r.left >= glowUnion.left - 3 &&
            r.top >= glowUnion.top - 3 &&
            r.left + r.width <= glowUnion.left + glowUnion.width + 3 &&
            r.top + r.height <= glowUnion.top + glowUnion.height + 3 ? null : (
              <div
                key={i}
                className={styles.ring}
                style={{ top: r.top - R, left: r.left - R, width: r.width + R * 2, height: r.height + R * 2 }}
              />
            ),
          )}
          {def.axes ? <AxisArrows /> : null}
        </>
      ) : (
        <div className={styles.scrim} />
      )}

      {/* Beacon: a bobbing arrow pointing at the one small control the step
          revolves around (the 5♦, a card, the pin) — a clearer "click here" than
          a ring, and no redundant golden rectangle. Portaled above the lifted
          controls (z 125). The arrow sits above the target, or below (pointing
          up) when the target is near the top of the viewport. */}
      {glowUnion && def.beacon
        ? createPortal(
            <div className={styles.glowLayer} aria-hidden>
              {(() => {
                const below = glowUnion.top < 84
                const cx = glowUnion.left + glowUnion.width / 2
                const y = below ? glowUnion.top + glowUnion.height + 8 : glowUnion.top - 8
                return (
                  <span
                    className={`${styles.beaconArrow} ${below ? styles.beaconArrowUp : styles.beaconArrowDown}`}
                    style={{ left: cx, top: y }}
                  >
                    {below ? '▲' : '▼'}
                  </span>
                )
              })()}
            </div>,
            document.body,
          )
        : null}

      {/* portaled: lifted anchors sit above the overlay's stacking context, and
          the card must beat them while lab dialogs (150) beat the card */}
      {createPortal(
        <div className={styles.tipPos} style={tipStyle}>
          <div className={`${styles.tip} ${styles[placement]}`}>
            <div className={styles.tipHead}>
              <span className={styles.tipStep}>{step + 1} / {STEPS.length}</span>
              {def.task ? <span className={styles.tryChip}>{t('tryIt')}</span> : null}
              <button type="button" className={styles.skip} onClick={finish}>{t('skip')}</button>
            </div>
            <h3 className={styles.tipTitle}>{t(`steps.${def.key}.title`)}</h3>
            <p className={styles.tipBody}>{body}</p>
            <div className={styles.dots} aria-hidden>
              {STEPS.map((_, i) => (
                <span key={i} className={i === step ? styles.dotOn : styles.dot} />
              ))}
            </div>
            <div className={styles.tipActions}>
              {step > 0 ? (
                <button type="button" className={styles.back} onClick={() => setStep((s) => s - 1)}>← {t('back')}</button>
              ) : <span />}
              <button
                type="button"
                className={styles.next}
                onClick={() => (last ? finish() : setStep((s) => s + 1))}
              >
                {last ? t('start') : <>{t('next')} →</>}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** the axis hint: one soft golden line along the column headers (M) and one
 *  down the row headers (H), each with a highlight that sweeps along it and a
 *  labelled tag at the end. Anchored to the real header cells and re-measured
 *  each parent render (the spotlight interval bumps `tick`). */
function AxisArrows() {
  if (typeof document === 'undefined') return null
  const block = document.querySelector('[data-tour-id="grid-block-0"]')
  if (!block) return null
  const vh = window.innerHeight || 800
  const cols = Array.from(block.querySelectorAll('thead th'))
    .slice(1)
    .map((th) => th.getBoundingClientRect())
    .filter((r) => r.width > 0)
  const rows = Array.from(block.querySelectorAll('tbody tr > th'))
    .map((th) => th.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.bottom > 0 && r.top < vh)
  if (cols.length === 0 && rows.length === 0) return null

  const bars: React.ReactNode[] = []
  if (cols.length) {
    const left = cols[0].left
    const right = cols[cols.length - 1].right
    const top = cols[0].bottom + 3
    bars.push(
      <div key="h" className={styles.axisBarH} style={{ left, top, width: Math.max(0, right - left) }}>
        <span className={styles.axisSweepH} />
      </div>,
      <span key="hT" className={styles.axisTag} style={{ left: right + 8, top: top - 7 }}>
        M ▸
      </span>,
    )
  }
  if (rows.length) {
    const top = rows[0].top
    const bottom = rows[rows.length - 1].bottom
    const left = rows[0].right + 3
    bars.push(
      <div key="v" className={styles.axisBarV} style={{ left, top, height: Math.max(0, bottom - top) }}>
        <span className={styles.axisSweepV} />
      </div>,
      <span key="vT" className={styles.axisTag} style={{ left: left - 6, top: bottom + 6 }}>
        H ▾
      </span>,
    )
  }
  return (
    <div className={styles.axes} aria-hidden>
      {bars}
    </div>
  )
}
