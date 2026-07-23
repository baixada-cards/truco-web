'use client'

// Plate — anatomy of a study string (migrated from guide v2).
// One legal, representative line; each token teaches its rule on hover/tap.
// 10x10 on purpose: it is a solved band with no mão de onze, so the raise in
// the history is legal and the "open in the lab" link lands on real charts.

import { useLocale, useTranslations } from 'next-intl'
import { useLayoutEffect, useRef, useState } from 'react'

import styles from '../guide.module.css'
import { rich } from '../rich'

const AN_STRING = '10x10 v4 pe![5d 3 ?] : 3 j / r a'
const AN_TOKENS: Array<{ text: string; key: string }> = [
  { text: '10x10', key: 'score' },
  { text: 'v4', key: 'vira' },
  { text: 'pe!', key: 'role' },
  { text: '[5d 3 ?]', key: 'hand' },
  { text: ':', key: 'colon' },
  { text: '3', key: 'play' },
  { text: 'j', key: 'play2' },
  { text: '/', key: 'round' },
  { text: 'r', key: 'raise' },
  { text: 'a', key: 'answer' },
]

export function StringAnatomy() {
  const t = useTranslations('Study.guide')
  const locale = useLocale()
  const labHref = `/${locale}/lab/study`
  const [sel, setSel] = useState<string | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [readoutHeight, setReadoutHeight] = useState(0)
  const [readoutBox, setReadoutBox] = useState<{ left: number; width: number } | null>(null)

  // Give the hidden measurement frame the exact box of the visible readout.
  // Its text then wraps at precisely the same points as the live description.
  useLayoutEffect(() => {
    const syncBox = () => {
      const frame = frameRef.current?.getBoundingClientRect()
      const readout = readoutRef.current?.getBoundingClientRect()
      if (!frame || !readout) return
      const next = { left: readout.left - frame.left, width: readout.width }
      setReadoutBox((current) =>
        current?.left === next.left && current.width === next.width ? current : next,
      )
    }
    syncBox()
    const observer = new ResizeObserver(syncBox)
    if (readoutRef.current) observer.observe(readoutRef.current)
    return () => observer.disconnect()
  }, [locale])

  // The descriptions vary by token, locale, and wrapping width. Measure the
  // actual localized alternatives so switching tokens never makes the plate
  // jump, without reserving a line that cannot appear in the visible frame.
  useLayoutEffect(() => {
    const rows = measureRef.current?.children
    if (!rows?.length || !readoutBox) return
    setReadoutHeight(Math.ceil(Math.max(...Array.from(rows, (row) => row.getBoundingClientRect().height))))
  }, [locale, readoutBox])

  return (
    <figure className={styles.plate}>
      <div ref={frameRef} className={styles.an}>
        <div
          ref={measureRef}
          className={styles.anMeasure}
          style={readoutBox ? { left: `${readoutBox.left}px`, width: `${readoutBox.width}px` } : undefined}
          aria-hidden="true"
        >
          {AN_TOKENS.map(({ key }) => (
            <div key={key}>
              <div className={styles.anTerm}>{t(`an.tok.${key}.term`)}</div>
              <p>{t.rich(`an.tok.${key}.desc`, rich)}</p>
            </div>
          ))}
        </div>
        <div className={styles.anString} role="group" aria-label={t('an.aria')}>
          {AN_TOKENS.map(({ text, key }) => (
            <button
              key={key}
              type="button"
              className={sel === key ? styles.anTokOn : styles.anTok}
              aria-pressed={sel === key}
              onMouseEnter={() => setSel(key)}
              onFocus={() => setSel(key)}
              onClick={() => setSel(key)}
            >
              {text}
            </button>
          ))}
        </div>

        <div
          ref={readoutRef}
          className={styles.anReadout}
          style={readoutHeight ? { minHeight: `${readoutHeight}px` } : undefined}
          role="status"
          aria-live="polite"
        >
          {sel === null ? (
            <p className={styles.anHint}>{t('an.hint')}</p>
          ) : (
            <>
              <div className={styles.anTerm}>{t(`an.tok.${sel}.term`)}</div>
              <p>{t.rich(`an.tok.${sel}.desc`, rich)}</p>
            </>
          )}
        </div>

        <ul className={styles.anRef}>
          <li>{t.rich('an.refManilha', rich)}</li>
          <li>{t.rich('an.refHide', rich)}</li>
          <li>{t.rich('an.refRaise', rich)}</li>
          <li>{t.rich('an.refAce', rich)}</li>
        </ul>

        <a className={styles.anTry} href={`${labHref}?s=${encodeURIComponent(AN_STRING)}`}>
          {t('an.try')} →
        </a>
      </div>
      <figcaption className={styles.plateCaption}>
        <span className={styles.plateNo}>{t('plate', { no: 'III' })}</span> {t('an.caption')}
      </figcaption>
    </figure>
  )
}
