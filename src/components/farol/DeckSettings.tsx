import { useTranslations } from 'next-intl'
import type { DeckSystem } from '../../lib/deck-system'
import { DeckCard } from './DeckCard'
import type { CardSize, Suit } from './SpanishCard'

import './DeckSettings.css'

type SpreadCard = {
  rank: number
  suit: Suit
}

const SPREAD_CARDS: readonly SpreadCard[] = [
  { rank: 1, suit: 'espadas' },
  { rank: 7, suit: 'oros' },
  { rank: 12, suit: 'copas' },
  { rank: 2, suit: 'bastos' },
]

export function DeckSpread({
  system,
  size = 'sm',
}: {
  system: DeckSystem
  size?: Extract<CardSize, 'sm' | 'md'>
}) {
  const rotations = [-6, -2, 2, 6]
  const offsets = [0, -8, -16, -24]

  return (
    <div className={`sd-spread is-${size}`}>
      {SPREAD_CARDS.map((card, index) => (
        <div
          className="sd-spread-card"
          key={`${system}-${card.rank}-${card.suit}`}
          style={{
            transform: `translateY(${offsets[index]}px) rotate(${rotations[index]}deg)`,
            zIndex: index + 1,
          }}
        >
          <DeckCard
            system={system}
            rank={card.rank}
            suit={card.suit}
            size={size}
          />
        </div>
      ))}
    </div>
  )
}

export function DeckSettings({
  value,
  onChange,
}: {
  value: DeckSystem
  onChange: (system: DeckSystem) => void
}) {
  const t = useTranslations('Live.deck')

  return (
    <section className="settings-deck" data-testid="live-game-settings-deck-panel">
      <header className="sd-head">
        <div className="sd-eyebrow">{t('eyebrow')}</div>
        <h2 className="sd-title">{t('title')}</h2>
        <p className="sd-help">
          {t('help')}
        </p>
      </header>

      <div className="sd-options">
        {(['french', 'spanish'] as const).map((system) => (
          <button
            type="button"
            className={`sd-option ${value === system ? 'is-selected' : ''}`}
            data-testid={`deck-settings-${system}`}
            key={system}
            aria-pressed={value === system}
            onClick={() => { onChange(system) }}
          >
            <div className="sd-option-preview">
              <DeckSpread system={system} />
            </div>
            <div className="sd-option-meta">
              <div className="sd-option-row">
                <span className={`sd-radio ${value === system ? 'is-on' : ''}`} aria-hidden="true" />
                <span className="sd-option-name">{t(`${system}.name`)}</span>
                <span className="sd-option-tag">
                  {t(`${system}.tag`)}
                </span>
              </div>
              <p className="sd-option-desc">
                {t(`${system}.description`)}
              </p>
            </div>
          </button>
        ))}
      </div>

      <footer className="sd-foot">
        {t('tip')}
      </footer>
    </section>
  )
}
