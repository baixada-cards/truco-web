'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SessionAction } from '../../lib/session-api'
import type { StakeFx } from '../../lib/live-stake-fx'
import { FarolSettingsButton } from './FarolSettingsButton'
import { FarolStudyButton, type FarolStudyButtonState } from './FarolStudyButton'
import { Peg } from './Peg'
import './FarolActionRail.css'

const LADDER = [
  { val: 3,  name: 'three' },
  { val: 6,  name: 'six' },
  { val: 9,  name: 'nine' },
  { val: 12, name: 'twelve' },
] as const

const COMPACT_TABLE_ACCEPT_QUERY = '(max-width: 520px)'

type RailPegState = 'legal' | 'past' | 'future'

function nextRaiseForStake(stake: number) {
  if (stake <= 1) return 3
  return stake < 12 ? stake + 3 : null
}

function useCompactTableAccept() {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(COMPACT_TABLE_ACCEPT_QUERY)
    const update = () => { setMatches(media.matches) }
    update()

    media.addEventListener('change', update)
    return () => { media.removeEventListener('change', update) }
  }, [])

  return matches
}

export function FarolActionRail({
  heroIsResponder,
  humanElevenDecisionPending,
  displayedStake,
  raiseDisabled,
  normalTurnFoldDisabled,
  concedeHandAction,
  isPending,
  isAutoStartingHand,
  isDealingCards,
  onAct,
  onRaiseOrReraise,
  stakeFx,
  decisionSummary,
  decisionFxLabel,
  settingsButton,
  studyButton,
  hint,
}: {
  heroIsResponder: boolean
  humanElevenDecisionPending: boolean
  displayedStake: number
  raiseDisabled: boolean
  normalTurnFoldDisabled: boolean
  concedeHandAction: SessionAction | undefined
  isPending: boolean
  isAutoStartingHand: boolean
  isDealingCards: boolean
  onAct: (action: SessionAction) => void
  onRaiseOrReraise: () => void
  stakeFx: StakeFx | null
  decisionSummary: string
  decisionFxLabel: string | null
  settingsButton?: {
    isOpen: boolean
    hasAlert: boolean
    onClick: () => void
  } | null
  studyButton?: FarolStudyButtonState | null
  hint?: {
    text: string
    dismissLabel: string
    onDismiss: () => void
    dismissAllLabel?: string
    onDismissAll?: () => void
  } | null
}) {
  const t = useTranslations('Live.actions')
  const actionsDisabled = isPending || isAutoStartingHand || isDealingCards
  const awaitingDecision = heroIsResponder || humanElevenDecisionPending
  const maoDeOnze = humanElevenDecisionPending
  const nextRaise = nextRaiseForStake(displayedStake)
  const compactTableAccept = useCompactTableAccept()
  const acceptOnTablePegOnly = compactTableAccept && awaitingDecision
  const showStandaloneAccept = awaitingDecision && !acceptOnTablePegOnly

  const handleAccept = () => {
    if (actionsDisabled) return
    if (heroIsResponder) onAct({ type: 'accept_raise' })
    else if (humanElevenDecisionPending) onAct({ type: 'accept_eleven' })
  }

  const handleLegalRaise = () => {
    if (actionsDisabled || raiseDisabled) return
    onRaiseOrReraise()
  }

  const handleFold = () => {
    if (actionsDisabled) return
    if (heroIsResponder) onAct({ type: 'fold' })
    else if (humanElevenDecisionPending) onAct({ type: 'fold_eleven' })
    else if (!normalTurnFoldDisabled && concedeHandAction) onAct(concedeHandAction)
  }

  const foldDisabled = actionsDisabled || (
    !heroIsResponder && !humanElevenDecisionPending && normalTurnFoldDisabled
  )

  return (
    <div
      className={[
        'td-rail',
        acceptOnTablePegOnly ? 'td-rail-uses-table-accept' : '',
      ].filter(Boolean).join(' ')}
      data-testid="live-decision-panel"
      data-stake-fx-action={stakeFx?.action ?? ''}
      data-stake-fx-actor={stakeFx?.actor ?? ''}
      aria-label={t('decision')}
    >
      {hint && (
        <div className="td-rail-hint" role="status">
          <span className="td-rail-hint-text">{hint.text}</span>
          <div className="td-rail-hint-actions">
            <button
              type="button"
              className="td-rail-hint-dismiss"
              onClick={hint.onDismiss}
            >
              {hint.dismissLabel}
            </button>
            {hint.onDismissAll && (
              <button
                type="button"
                className="td-rail-hint-dismiss-all"
                onClick={hint.onDismissAll}
              >
                {hint.dismissAllLabel}
              </button>
            )}
          </div>
        </div>
      )}
      <span className="td-rail-status">{decisionSummary}</span>
      {decisionFxLabel && (
        <span className="td-rail-fx-ribbon" data-testid="live-decision-fx-ribbon">
          {decisionFxLabel}
        </span>
      )}
      <div className="td-rail-inner">
        <div className="td-rail-section td-rail-section-left">
          {showStandaloneAccept && (
            <button
              type="button"
              className="td-rail-slot td-rail-slot-accept td-rail-slot-accept-standalone"
              title={humanElevenDecisionPending ? t('playFor3') : `${t('accept')} ${displayedStake}`}
              aria-label={humanElevenDecisionPending ? t('playFor3') : `${t('accept')} ${displayedStake}`}
              onClick={handleAccept}
              disabled={actionsDisabled}
              style={{ cursor: actionsDisabled ? 'default' : 'pointer' }}
            >
              <Peg value={displayedStake} state="accept" size={44} />
              <span className="td-rail-slot-label">
                {humanElevenDecisionPending ? t('play') : t('accept')}
              </span>
            </button>
          )}
          {showStandaloneAccept && <div className="td-rail-sep td-rail-accept-sep" />}
          {LADDER.map((rung) => {
            const isLegalRaise = !maoDeOnze && rung.val === nextRaise && !raiseDisabled
            const isPast = rung.val <= displayedStake
            const state: RailPegState = isLegalRaise ? 'legal' : isPast ? 'past' : 'future'
            const raiseLabel = rung.val === 3 && displayedStake <= 1
              ? t('truco')
              : t('raiseTo', { stake: rung.val })
            const actionLabel = isLegalRaise ? raiseLabel : t(rung.name)
            return (
              <button
                type="button"
                key={rung.val}
                className={[
                  'td-rail-slot',
                  `td-rail-slot-${state}`,
                ].filter(Boolean).join(' ')}
                title={actionLabel}
                aria-label={actionLabel}
                onClick={isLegalRaise ? handleLegalRaise : undefined}
                disabled={actionsDisabled || !isLegalRaise}
              >
                <Peg value={rung.val} state={state} size={40} />
                <span className="td-rail-slot-label">{t(rung.name)}</span>
              </button>
            )
          })}
        </div>

        <div className="td-rail-section td-rail-section-right">
          <button
            type="button"
            className="td-rail-fold"
            title={t('foldTitle')}
            aria-label={t('foldTitle')}
            onClick={foldDisabled ? undefined : handleFold}
            disabled={foldDisabled}
            style={{ opacity: foldDisabled ? 0.35 : 1, cursor: foldDisabled ? 'default' : 'pointer' }}
          >
            <span className="td-rail-fold-icon">✕</span>
            <span className="td-rail-slot-label">{t('fold')}</span>
          </button>
          {(settingsButton || studyButton) && (
            <>
              <div className="td-rail-sep td-rail-settings-sep" />
              {studyButton && (
                <FarolStudyButton
                  className="td-rail-study"
                  label={studyButton.label}
                  href={studyButton.href}
                  disabledReason={studyButton.disabledReason}
                />
              )}
              {settingsButton && (
                <FarolSettingsButton
                  className="td-rail-settings"
                  isOpen={settingsButton.isOpen}
                  hasAlert={settingsButton.hasAlert}
                  onClick={settingsButton.onClick}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
