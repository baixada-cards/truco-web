'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { DeckSystem } from '../../lib/deck-system'
import { DeckSpread } from '../farol/DeckSettings'

import './FirstRunDeckPicker.css'

export function FirstRunDeckPicker({
  onPick,
  onSkip,
}: {
  onPick: (system: DeckSystem) => void
  onSkip: () => void
}) {
  const t = useTranslations('Live.firstRunDeck')
  const tDeck = useTranslations('Live.deck')

  useEffect(() => {
    const scrollY = window.scrollY
    const bodyStyle = document.body.style
    const rootStyle = document.documentElement.style
    const previousBodyStyles = {
      left: bodyStyle.left,
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      right: bodyStyle.right,
      top: bodyStyle.top,
      width: bodyStyle.width,
    }
    const previousRootOverflow = rootStyle.overflow

    rootStyle.overflow = 'hidden'
    bodyStyle.position = 'fixed'
    bodyStyle.top = `-${scrollY}px`
    bodyStyle.left = '0'
    bodyStyle.right = '0'
    bodyStyle.width = '100%'
    bodyStyle.overflow = 'hidden'

    return () => {
      rootStyle.overflow = previousRootOverflow
      bodyStyle.position = previousBodyStyles.position
      bodyStyle.top = previousBodyStyles.top
      bodyStyle.left = previousBodyStyles.left
      bodyStyle.right = previousBodyStyles.right
      bodyStyle.width = previousBodyStyles.width
      bodyStyle.overflow = previousBodyStyles.overflow
      window.scrollTo(0, scrollY)
    }
  }, [])

  return (
    <div className="frp-overlay" data-testid="first-run-deck-picker">
      <div className="frp-card" role="dialog" aria-modal="true" aria-labelledby="first-run-deck-title">
        <div className="frp-eyebrow">{t('eyebrow')}</div>
        <h1 className="frp-title" id="first-run-deck-title">{t('title')}</h1>
        <p className="frp-sub">
          {t('subtitle')}
        </p>

        <div className="frp-grid">
          <button
            type="button"
            className="frp-pick is-recommended"
            data-testid="deck-picker-french"
            onClick={() => { onPick('french') }}
          >
            <div className="frp-pick-stage">
              <DeckSpread system="french" size="md" />
            </div>
            <div className="frp-pick-foot">
              <span className="frp-pick-name">{tDeck('french.name')}</span>
              <span className="frp-pick-tag">{tDeck('french.tag')}</span>
            </div>
          </button>

          <button
            type="button"
            className="frp-pick"
            data-testid="deck-picker-spanish"
            onClick={() => { onPick('spanish') }}
          >
            <div className="frp-pick-stage">
              <DeckSpread system="spanish" size="md" />
            </div>
            <div className="frp-pick-foot">
              <span className="frp-pick-name">{tDeck('spanish.name')}</span>
              <span className="frp-pick-tag">{tDeck('spanish.tag')}</span>
            </div>
          </button>
        </div>

        <button type="button" className="frp-skip" onClick={onSkip}>{t('decideLater')}</button>
      </div>
    </div>
  )
}
