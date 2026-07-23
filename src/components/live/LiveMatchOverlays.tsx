'use client'

import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { BotKind, BotProfile, LlmProviderCatalog } from '../../lib/session-api'
import type { DealerChoice, Seat } from '../../lib/live-bot-selection'
import type { OverlayMenuId } from '../../lib/use-live-panel-layout'
import {
  BOT_KIND_OPTIONS,
  BOT_PROFILE_OPTIONS,
  NEW_MATCH_DEALER_OPTIONS,
  findLlmProviderCatalog,
  isLlmBotKind,
  resolvePreferredLlmModel,
} from '../../lib/live-bot-selection'
import { LanguagePicker } from './LanguagePicker'

import './LiveMatchOverlays.css'

// ---------------------------------------------------------------------------
// Helpers (moved from LiveGame.tsx)
// ---------------------------------------------------------------------------

function loserDealsChoice(winner: Seat): DealerChoice {
  return winner === 0 ? 1 : 0
}

function fallbackHistoryFromScore(youScore: number, themScore: number): MatchHistoryResult[] {
  const totalScore = youScore + themScore
  if (totalScore <= 0) return []

  const pipCount = Math.max(1, Math.min(12, Math.round(totalScore / 2)))
  const winPips = Math.max(0, Math.min(pipCount, Math.round((pipCount * youScore) / totalScore)))
  const losePips = pipCount - winPips
  const history: MatchHistoryResult[] = []

  for (let index = 0; index < pipCount; index += 1) {
    const winsSoFar = history.filter((result) => result === 'W').length
    const lossesSoFar = history.length - winsSoFar
    const shouldAddWin = winPips === 0
      ? false
      : losePips === 0
        ? true
        : (winsSoFar + 1) / winPips <= (lossesSoFar + 1) / losePips

    history.push(shouldAddWin ? 'W' : 'L')
  }

  return history
}

export type MatchHistoryResult = 'W' | 'L'

// ---------------------------------------------------------------------------
// Shared bot / setup prop group
// ---------------------------------------------------------------------------

interface MatchSetupSharedProps {
  selectedBotKind: BotKind
  selectedBotProfile: BotProfile
  selectedBotModel: string
  llmProviders: LlmProviderCatalog[]
  solverAvailable: boolean
  isLoadingProviders: boolean
  selectedProvider: LlmProviderCatalog | null
  showBotProviderStatus: boolean
  providerStatusCopy: string | null
  matchStartBlocked: boolean
  providerLoadIssue: string | null
  handleBotKindChange: (kind: BotKind) => void
  setSelectedBotProfile: (profile: BotProfile) => void
  setSelectedBotModel: (modelId: string) => void
  dealerChoice: DealerChoice
  selectNewMatchDealerChoice: (choice: DealerChoice) => void
  overlayMenuOpen: OverlayMenuId | null
  setOverlayMenuOpen: Dispatch<SetStateAction<OverlayMenuId | null>>
  setOverlayMenuRef: (menuId: OverlayMenuId, node: HTMLDivElement | null) => void
}

type LiveReplaceMatchStatus = {
  youScore: number
  themScore: number
  botKind: BotKind | null
  botProfile: BotProfile | null
  botModel: string | null
}

// ---------------------------------------------------------------------------
// Carved launcher fields
// ---------------------------------------------------------------------------

function CarvedMenuOption({
  children,
  selected,
  testId,
  onClick,
}: {
  children: ReactNode
  selected?: boolean
  testId: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`mmc-menu-option ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function titleScreenBotOptions(llmProviders: LlmProviderCatalog[], solverAvailable: boolean) {
  return BOT_KIND_OPTIONS.filter((kind) => {
    if (kind === 'solver') return solverAvailable
    return !isLlmBotKind(kind) || Boolean(findLlmProviderCatalog(llmProviders, kind)?.enabled)
  })
}

function CarvedLauncherSetupFields({
  selectedBotKind,
  selectedBotProfile,
  selectedBotModel,
  llmProviders,
  solverAvailable,
  isLoadingProviders,
  selectedProvider,
  showBotProviderStatus,
  providerStatusCopy,
  matchStartBlocked,
  providerLoadIssue,
  handleBotKindChange,
  setSelectedBotProfile,
  setSelectedBotModel,
  dealerChoice,
  selectNewMatchDealerChoice,
  overlayMenuOpen,
  setOverlayMenuOpen,
  setOverlayMenuRef,
}: MatchSetupSharedProps) {
  const tCommon = useTranslations('Common')
  const tLauncher = useTranslations('Live.launcher')
  const tBot = useTranslations('Bot')
  const isOpponentMenuOpen = overlayMenuOpen === 'launcher-bot'
  const isProfileMenuOpen = overlayMenuOpen === 'launcher-profile'
  const isModelMenuOpen = overlayMenuOpen === 'launcher-model'
  const isDealerMenuOpen = overlayMenuOpen === 'launcher-dealer'
  const modelItems = selectedProvider?.models ?? []
  const showProfilePicker = selectedBotKind === 'heuristic'
  const showModelPicker = isLlmBotKind(selectedBotKind) && Boolean(selectedProvider?.enabled)
  const modelPickerDisabled = isLoadingProviders || !selectedProvider?.enabled || modelItems.length === 0
  const botKindOptions = titleScreenBotOptions(llmProviders, solverAvailable)
  const botKindText = (kind: BotKind) => tBot(`kind.${kind}.label`)
  const botProfileText = (profile: BotProfile) => tBot(`profile.${profile}.label`)
  const botProfileDescriptionText = (profile: BotProfile) => tBot(`profile.${profile}.description`)
  const dealerChoiceText = (choice: DealerChoice) => (
    choice === 'random' ? tCommon('random') : choice === 0 ? tCommon('you') : tCommon('them')
  )
  const botKindSummaryText = (kind: BotKind) => {
    switch (kind) {
      case 'random':
      case 'simple':
        return tBot(`kind.${kind}.summary`)
      case 'heuristic':
        return tBot('kind.heuristic.summary')
      case 'solver':
        return tBot('kind.solver.summary')
      default: {
        if (isLoadingProviders) return tBot('model.loading')
        const provider = findLlmProviderCatalog(llmProviders, kind)
        if (!provider || !provider.enabled) return tBot('model.unavailable')

        return resolvePreferredLlmModel(
          provider,
          kind === selectedBotKind ? selectedBotModel : '',
        ) || tBot('model.choose')
      }
    }
  }

  return (
    <div className="mmc-lines" data-testid="live-game-launcher-carved-fields">
      <div
        className={`mmc-line mmc-line--menu mmc-line--opponent ${isOpponentMenuOpen ? 'has-open-menu' : ''}`}
        ref={(node) => {
          setOverlayMenuRef('launcher-bot', node)
        }}
      >
        <span className="mmc-line-label">{tLauncher('opponent')}</span>
        <button
          className="mmc-line-value"
          type="button"
          aria-expanded={isOpponentMenuOpen}
          aria-haspopup="listbox"
          data-testid="live-game-launcher-bot-trigger"
          onClick={() => {
            setOverlayMenuOpen((current) => current === 'launcher-bot' ? null : 'launcher-bot')
          }}
        >
          {botKindText(selectedBotKind)}
        </button>

        {isOpponentMenuOpen && (
          <div
            className="mmc-menu"
            role="listbox"
            aria-label={tLauncher('opponent')}
            data-testid="live-game-launcher-bot-menu"
          >
            <div className="mmc-menu-grid">
              {botKindOptions.map((kind) => (
                <CarvedMenuOption
                  key={kind}
                  selected={selectedBotKind === kind}
                  testId={`live-game-launcher-bot-option-${kind}`}
                  onClick={() => {
                    handleBotKindChange(kind)
                    setOverlayMenuOpen(null)
                  }}
                >
                  <span className="mmc-menu-option-label">{botKindText(kind)}</span>
                  <span className="mmc-menu-option-copy">{botKindSummaryText(kind)}</span>
                </CarvedMenuOption>
              ))}
            </div>
          </div>
        )}
      </div>

      {showProfilePicker && (
        <div
          className={`mmc-line mmc-line--menu mmc-line--sub ${isProfileMenuOpen ? 'has-open-menu' : ''}`}
          data-testid="live-game-launcher-bot-config"
          ref={(node) => {
            setOverlayMenuRef('launcher-profile', node)
          }}
        >
          <span className="mmc-line-label">{tLauncher('style')}</span>
          <button
            className="mmc-line-value"
            type="button"
            aria-expanded={isProfileMenuOpen}
            aria-haspopup="listbox"
            data-testid="live-game-launcher-bot-profile-trigger"
            onClick={() => {
              setOverlayMenuOpen((current) => current === 'launcher-profile' ? null : 'launcher-profile')
            }}
          >
            {botProfileText(selectedBotProfile)}
          </button>

          {isProfileMenuOpen && (
            <div
              className="mmc-menu"
              role="listbox"
              aria-label={tLauncher('style')}
              data-testid="live-game-launcher-bot-profile-menu"
            >
              <div className="mmc-menu-grid mmc-menu-grid--profiles">
                {BOT_PROFILE_OPTIONS.map((profile) => (
                  <CarvedMenuOption
                    key={profile}
                    selected={selectedBotProfile === profile}
                    testId={`live-game-launcher-bot-profile-option-${profile}`}
                    onClick={() => {
                      setSelectedBotProfile(profile)
                      setOverlayMenuOpen(null)
                    }}
                  >
                    <span className="mmc-menu-option-label">{botProfileText(profile)}</span>
                    <span className="mmc-menu-option-copy">{botProfileDescriptionText(profile)}</span>
                  </CarvedMenuOption>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showModelPicker && (
        <div
          className={`mmc-line mmc-line--menu mmc-line--sub ${isModelMenuOpen ? 'has-open-menu' : ''}`}
          data-testid="live-game-launcher-bot-config"
          ref={(node) => {
            setOverlayMenuRef('launcher-model', node)
          }}
        >
          <span className="mmc-line-label">{tLauncher('model')}</span>
          <button
            className="mmc-line-value"
            type="button"
            aria-expanded={isModelMenuOpen}
            aria-haspopup="listbox"
            data-testid="live-game-launcher-bot-model-trigger"
            disabled={modelPickerDisabled}
            onClick={() => {
              if (modelPickerDisabled) return
              setOverlayMenuOpen((current) => current === 'launcher-model' ? null : 'launcher-model')
            }}
          >
            {selectedBotModel || tBot('model.select')}
          </button>

          {isModelMenuOpen && (
            <div
              className="mmc-menu mmc-menu--compact"
              role="listbox"
              aria-label={tLauncher('model')}
              data-testid="live-game-launcher-bot-model-menu"
            >
              <div className="mmc-menu-grid mmc-menu-grid--models">
                {modelItems.map((model) => (
                  <CarvedMenuOption
                    key={model.id}
                    selected={selectedBotModel === model.id}
                    testId={`live-game-launcher-bot-model-option-${model.id}`}
                    onClick={() => {
                      setSelectedBotModel(model.id)
                      setOverlayMenuOpen(null)
                    }}
                  >
                    <span className="mmc-menu-option-label">{model.id}</span>
                  </CarvedMenuOption>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div
        className={`mmc-line mmc-line--menu mmc-line--last ${isDealerMenuOpen ? 'has-open-menu' : ''}`}
        ref={(node) => {
          setOverlayMenuRef('launcher-dealer', node)
        }}
      >
        <span className="mmc-line-label">{tLauncher('firstDealer')}</span>
        <button
          className="mmc-line-value"
          type="button"
          aria-expanded={isDealerMenuOpen}
          aria-haspopup="listbox"
          data-testid="live-game-launcher-dealer-trigger"
          onClick={() => {
            setOverlayMenuOpen((current) => current === 'launcher-dealer' ? null : 'launcher-dealer')
          }}
        >
          {dealerChoiceText(dealerChoice)}
        </button>

        {isDealerMenuOpen && (
          <div
            className="mmc-menu mmc-menu--compact"
            role="listbox"
            aria-label={tLauncher('firstDealer')}
            data-testid="live-game-launcher-dealer-menu"
          >
            {NEW_MATCH_DEALER_OPTIONS.map((option) => (
              <CarvedMenuOption
                key={String(option.value)}
                selected={dealerChoice === option.value}
                testId={`live-game-launcher-dealer-option-${option.value}`}
                onClick={() => {
                  selectNewMatchDealerChoice(option.value)
                  setOverlayMenuOpen(null)
                }}
              >
                <span className="mmc-menu-option-label">{dealerChoiceText(option.value)}</span>
              </CarvedMenuOption>
            ))}
          </div>
        )}
      </div>

      {showBotProviderStatus && providerStatusCopy && (
        <div
          className={`mmc-status ${matchStartBlocked || providerLoadIssue ? 'is-warning' : ''}`}
          role={matchStartBlocked || providerLoadIssue ? 'alert' : undefined}
        >
          {providerStatusCopy}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LiveLauncherOverlay
// ---------------------------------------------------------------------------

export function LiveLauncherOverlay({
  matchStartDisabled,
  startLauncherMatch,
  showStudyLabLink,
  ...setup
}: MatchSetupSharedProps & {
  matchStartDisabled: boolean
  startLauncherMatch: () => void | Promise<void>
  showStudyLabLink: boolean
}) {
  const t = useTranslations('Live.launcher')
  const locale = useLocale()

  return (
    <div
      className="win-overlay is-neutral live-launcher-screen match-setup-overlay match-carved-overlay ts-chestnut"
      role="dialog"
      aria-modal="true"
      aria-label={t('ariaLabel')}
      data-testid="live-game-launcher-screen"
    >
      <div className="mmc-slab ts-atlas-paper match-setup-card--launcher">
        <div className="mmc-eyebrow">{t('eyebrow')}</div>
        <h1 className="mmc-title">{t('title')}</h1>
        <div className="ts-atlas-rule mmc-section-rule" aria-hidden="true" />

        <LanguagePicker variant="launcher" />

        <CarvedLauncherSetupFields {...setup} />

        <div className="mmc-cta-row">
          <button
            className="mmc-cta"
            type="button"
            aria-label={t('startAria')}
            data-testid="live-game-launcher-start-button"
            disabled={matchStartDisabled}
            onClick={() => { void startLauncherMatch() }}
          >
            {t('start')}
          </button>
        </div>

        {showStudyLabLink && (
          <a
            className="mmc-lab-link"
            href={`/${locale}/lab/study`}
            data-testid="live-game-launcher-lab-link"
          >
            {t('studyLab')}
          </a>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LiveMatchCompleteOverlay
// ---------------------------------------------------------------------------

export function LiveMatchCompleteOverlay({
  showStudyLabLink,
  studySpotHref,
  visibleMatchWinner,
  humanPlayer,
  heroScore,
  villainScore,
  handHistory,
  matchEndActionsDisabled,
  matchStartBlocked,
  requestStartNewGame,
  requestChangeOpponent,
  dismissMatchCompleteOverlay,
}: {
  showStudyLabLink: boolean
  studySpotHref?: string | null
  visibleMatchWinner: Seat
  humanPlayer: Seat
  heroScore: number
  villainScore: number
  handHistory: MatchHistoryResult[]
  matchEndActionsDisabled: boolean
  matchStartBlocked: boolean
  requestStartNewGame: (dealerChoice: DealerChoice, options?: { confirm?: boolean }) => void
  requestChangeOpponent: (dealerChoice: DealerChoice) => void
  dismissMatchCompleteOverlay: () => void
}) {
  const t = useTranslations('Live.result')
  const tCommon = useTranslations('Common')
  const locale = useLocale()
  const isVictory = visibleMatchWinner === humanPlayer
  // heroScore/villainScore are already mapped from the human's perspective.
  const youScore = heroScore
  const themScore = villainScore
  const visibleHistory = handHistory.length > 0
    ? handHistory
    : fallbackHistoryFromScore(youScore, themScore)
  const nextDealerChoice = loserDealsChoice(visibleMatchWinner)

  return (
    <div
      className={`win-overlay match-carved-overlay match-result-overlay ts-chestnut ${isVictory ? 'is-victory' : 'is-defeat'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-complete-title"
      data-testid="match-complete-overlay"
      onClick={dismissMatchCompleteOverlay}
    >
      <div
        className="mmc-slab ts-atlas-paper match-result-slab"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mmc-eyebrow">{t('complete')}</div>
        <div
          className={`mmc-verdict ${isVictory ? 'is-win' : 'is-loss'}`}
          id="match-complete-title"
        >
          {isVictory ? t('won') : t('lost')}
        </div>
        <div className="ts-atlas-rule mmc-section-rule" aria-hidden="true" />

        <div
          className="mmc-tally"
          aria-label={t('finalScoreAria', { youScore, themScore })}
        >
          <div className="mmc-tally-side">
            <div className="mmc-tally-name">{tCommon('you').toLowerCase()}</div>
            <div className={`mmc-tally-num ${isVictory ? 'is-winner' : 'is-loser'}`}>
              {youScore}
            </div>
          </div>
          <div className="mmc-tally-rule" aria-hidden="true" />
          <div className="mmc-tally-side">
            <div className="mmc-tally-name">{tCommon('them').toLowerCase()}</div>
            <div className={`mmc-tally-num ${isVictory ? 'is-loser' : 'is-winner'}`}>
              {themScore}
            </div>
          </div>
        </div>

        {visibleHistory.length > 0 && (
          <div className="mmc-history" aria-label={t('handsAria')}>
            <span className="mmc-history-label">{t('handsLabel')}</span>
            {visibleHistory.map((result, index) => (
              <span
                key={`${result}-${index}`}
                className={`mmc-history-pip ${result === 'W' ? 'is-win' : 'is-loss'}`}
                aria-label={result === 'W' ? t('handWon') : t('handLost')}
              />
            ))}
          </div>
        )}

        <div className="mmc-cta-row">
          <button
            className="mmc-cta"
            type="button"
            aria-label={t('rematchAria')}
            disabled={matchEndActionsDisabled || matchStartBlocked}
            onClick={() => { requestStartNewGame(nextDealerChoice, { confirm: false }) }}
          >
            {t('rematch')}
          </button>

          <button
            className="mmc-cta-secondary"
            type="button"
            aria-label={t('changeOpponentAria')}
            disabled={matchEndActionsDisabled}
            onClick={() => { requestChangeOpponent(nextDealerChoice) }}
          >
            {t('changeOpponent')}
          </button>
        </div>

        {showStudyLabLink && (
          <a
            className="mmc-lab-link"
            href={studySpotHref ?? `/${locale}/lab/study`}
            data-testid="match-complete-lab-link"
            onClick={(event) => { event.stopPropagation() }}
          >
            {studySpotHref ? t('studyLastHand') : t('studyLab')}
          </a>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LiveNewMatchConfirmDialog
// ---------------------------------------------------------------------------

export function LiveNewMatchConfirmDialog({
  pendingNewMatchSubtitle,
  pendingNewMatchTitle,
  pendingNewMatchCopy,
  pendingNewMatchCancelLabel,
  pendingNewMatchConfirmLabel,
  liveMatchStatus,
  matchStartDisabled,
  cancelPendingNewMatch,
  confirmPendingNewMatch,
  ...setup
}: MatchSetupSharedProps & {
  pendingNewMatchSubtitle: string
  pendingNewMatchTitle: string
  pendingNewMatchCopy: string | null
  pendingNewMatchCancelLabel: string
  pendingNewMatchConfirmLabel: string
  liveMatchStatus: LiveReplaceMatchStatus | null
  matchStartDisabled: boolean
  cancelPendingNewMatch: () => void
  confirmPendingNewMatch: () => void
}) {
  const t = useTranslations('Live.newMatch')

  return (
    <div
      className="win-overlay is-neutral match-setup-overlay match-carved-overlay rm-overlay ts-chestnut"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="new-match-confirm-title"
      data-testid="live-game-new-match-confirmation"
      onClick={cancelPendingNewMatch}
    >
      <div className="rm-lamp" aria-hidden="true" />
      <div
        className="mmc-slab ts-atlas-paper rm-slab match-setup-card--replace"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rm-eyebrow">{pendingNewMatchSubtitle}</div>
        <h2 className="rm-verdict" id="new-match-confirm-title">
          {pendingNewMatchTitle}
        </h2>
        {pendingNewMatchCopy && (
          <p className="rm-sub">
            {pendingNewMatchCopy}
          </p>
        )}
        <div className="ts-atlas-rule rm-section-rule" aria-hidden="true" />

        {liveMatchStatus && <ReplaceLiveMatchStatus status={liveMatchStatus} />}

        <div className="rm-divider"><span>{t('divider')}</span></div>

        <ReplaceMatchSetupFields {...setup} />

        <div className="rm-cta-row">
          <button
            type="button"
            className="rm-cta-secondary"
            onClick={cancelPendingNewMatch}
          >
            {pendingNewMatchCancelLabel}
          </button>
          <button
            type="button"
            className="rm-cta"
            onClick={confirmPendingNewMatch}
            disabled={matchStartDisabled}
          >
            {pendingNewMatchConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReplaceLiveMatchStatus({ status }: { status: LiveReplaceMatchStatus }) {
  const t = useTranslations('Live.newMatch')
  const tCommon = useTranslations('Common')
  const tBot = useTranslations('Bot')
  const botKindText = (kind: BotKind | null) => {
    switch (kind) {
      case 'random':
      case 'simple':
      case 'heuristic':
      case 'solver':
      case 'openai':
      case 'anthropic':
      case 'openrouter':
        return tBot(`kind.${kind}.label`)
      default:
        return tBot('kind.unknown.label')
    }
  }
  const botProfileText = (profile: BotProfile | null) => {
    switch (profile) {
      case 'conservative':
      case 'balanced':
      case 'aggressive':
      case 'tricky':
        return tBot(`profile.${profile}.label`)
      default:
        return tBot('profile.balanced.label')
    }
  }
  const kindLabel = botKindText(status.botKind)
  const opponent = status.botKind === 'heuristic'
    ? `${kindLabel} · ${botProfileText(status.botProfile)}`
    : isLlmBotKind(status.botKind)
      ? status.botModel ? `${kindLabel} · ${status.botModel}` : kindLabel
      : kindLabel

  return (
    <div
      className="rm-live"
      aria-label={t('currentAria', {
        youScore: status.youScore,
        themScore: status.themScore,
        opponent,
      })}
    >
      <div className="rm-live-bar">
        <div className="rm-live-eyebrow">{t('inProgress')}</div>
        <div className="rm-live-against">{t('against')} <em>{opponent}</em></div>
      </div>
      <div className="rm-live-score">
        <div className="rm-live-side">
          <div className="rm-live-name">{tCommon('you').toLowerCase()}</div>
          <div className={`rm-live-num ${status.youScore > status.themScore ? 'is-ahead' : ''}`}>{status.youScore}</div>
        </div>
        <div className="rm-live-rule" aria-hidden="true" />
        <div className="rm-live-side">
          <div className="rm-live-name">{tCommon('them').toLowerCase()}</div>
          <div className={`rm-live-num ${status.themScore > status.youScore ? 'is-ahead' : ''}`}>{status.themScore}</div>
        </div>
      </div>
    </div>
  )
}

function ReplaceMatchSetupFields({
  selectedBotKind,
  selectedBotProfile,
  selectedBotModel,
  llmProviders,
  solverAvailable,
  isLoadingProviders,
  selectedProvider,
  showBotProviderStatus,
  providerStatusCopy,
  matchStartBlocked,
  providerLoadIssue,
  handleBotKindChange,
  setSelectedBotProfile,
  setSelectedBotModel,
  dealerChoice,
  selectNewMatchDealerChoice,
  overlayMenuOpen,
  setOverlayMenuOpen,
  setOverlayMenuRef,
}: MatchSetupSharedProps) {
  const tCommon = useTranslations('Common')
  const tLauncher = useTranslations('Live.launcher')
  const tBot = useTranslations('Bot')
  const isBotMenuOpen = overlayMenuOpen === 'replace-bot'
  const isProfileMenuOpen = overlayMenuOpen === 'replace-profile'
  const isModelMenuOpen = overlayMenuOpen === 'replace-model'
  const isDealerMenuOpen = overlayMenuOpen === 'replace-dealer'
  const modelItems = selectedProvider?.models ?? []
  const showModelPicker = isLlmBotKind(selectedBotKind)
  const botKindOptions = titleScreenBotOptions(llmProviders, solverAvailable)
  const botKindText = (kind: BotKind) => tBot(`kind.${kind}.label`)
  const botProfileText = (profile: BotProfile) => tBot(`profile.${profile}.label`)
  const botProfileDescriptionText = (profile: BotProfile) => tBot(`profile.${profile}.description`)
  const dealerChoiceText = (choice: DealerChoice) => (
    choice === 'random' ? tCommon('random') : choice === 0 ? tCommon('you') : tCommon('them')
  )
  const botKindSummaryText = (kind: BotKind) => {
    switch (kind) {
      case 'random':
      case 'simple':
        return tBot(`kind.${kind}.summary`)
      case 'heuristic':
        return tBot('kind.heuristic.summary')
      case 'solver':
        return tBot('kind.solver.summary')
      default: {
        if (isLoadingProviders) return tBot('model.loading')
        const provider = findLlmProviderCatalog(llmProviders, kind)
        if (!provider || !provider.enabled) return tBot('model.unavailable')

        return resolvePreferredLlmModel(
          provider,
          kind === selectedBotKind ? selectedBotModel : '',
        ) || tBot('model.choose')
      }
    }
  }

  return (
    <div className="rm-fields">
      <ReplaceField
        label={tLauncher('opponent')}
        menuId="replace-bot"
        isOpen={isBotMenuOpen}
        value={botKindText(selectedBotKind)}
        testId="new-match-confirm-bot-trigger"
        menuTestId="new-match-confirm-bot-menu"
        setOverlayMenuOpen={setOverlayMenuOpen}
        setOverlayMenuRef={setOverlayMenuRef}
      >
        <div className="rm-menu-grid">
          {botKindOptions.map((kind) => (
            <ReplaceMenuOption
              key={kind}
              selected={selectedBotKind === kind}
              testId={`new-match-confirm-bot-option-${kind}`}
              onClick={() => {
                handleBotKindChange(kind)
                setOverlayMenuOpen(null)
              }}
            >
              <span className="rm-menu-option-label">{botKindText(kind)}</span>
              <span className="rm-menu-option-copy">{botKindSummaryText(kind)}</span>
            </ReplaceMenuOption>
          ))}
        </div>
      </ReplaceField>

      {selectedBotKind === 'heuristic' && (
        <div className="rm-field-group" data-testid="new-match-confirm-bot-config">
          <ReplaceField
            label={tLauncher('style')}
            menuId="replace-profile"
            isOpen={isProfileMenuOpen}
            value={botProfileText(selectedBotProfile)}
            testId="new-match-confirm-bot-profile-trigger"
            menuTestId="new-match-confirm-bot-profile-menu"
            setOverlayMenuOpen={setOverlayMenuOpen}
            setOverlayMenuRef={setOverlayMenuRef}
            subField
          >
            <div className="rm-menu-grid rm-menu-grid--profiles">
              {BOT_PROFILE_OPTIONS.map((profile) => (
                <ReplaceMenuOption
                  key={profile}
                  selected={selectedBotProfile === profile}
                  testId={`new-match-confirm-bot-profile-option-${profile}`}
                  onClick={() => {
                    setSelectedBotProfile(profile)
                    setOverlayMenuOpen(null)
                  }}
                >
                  <span className="rm-menu-option-label">{botProfileText(profile)}</span>
                  <span className="rm-menu-option-copy">{botProfileDescriptionText(profile)}</span>
                </ReplaceMenuOption>
              ))}
            </div>
          </ReplaceField>
        </div>
      )}

      {showModelPicker && (
        <div className="rm-field-group" data-testid="new-match-confirm-bot-config">
          <ReplaceField
            label={tLauncher('model')}
            menuId="replace-model"
            isOpen={isModelMenuOpen}
            value={selectedBotModel || tBot('model.select')}
            testId="new-match-confirm-bot-model-trigger"
            menuTestId="new-match-confirm-bot-model-menu"
            disabled={isLoadingProviders || !selectedProvider?.enabled || modelItems.length === 0}
            setOverlayMenuOpen={setOverlayMenuOpen}
            setOverlayMenuRef={setOverlayMenuRef}
            subField
          >
            <div className="rm-menu-grid rm-menu-grid--models">
              {modelItems.map((model) => (
                <ReplaceMenuOption
                  key={model.id}
                  selected={selectedBotModel === model.id}
                  testId={`new-match-confirm-bot-model-option-${model.id}`}
                  onClick={() => {
                    setSelectedBotModel(model.id)
                    setOverlayMenuOpen(null)
                  }}
                >
                  <span className="rm-menu-option-label">{model.id}</span>
                </ReplaceMenuOption>
              ))}
            </div>
          </ReplaceField>
        </div>
      )}

      {showBotProviderStatus && providerStatusCopy && (
        <div
          className={`rm-note ${matchStartBlocked || providerLoadIssue ? 'is-warning' : ''}`}
          role={matchStartBlocked || providerLoadIssue ? 'alert' : undefined}
        >
          {providerStatusCopy}
        </div>
      )}

      <ReplaceField
        label={tLauncher('firstDealer')}
        menuId="replace-dealer"
        isOpen={isDealerMenuOpen}
        value={dealerChoiceText(dealerChoice)}
        testId="new-match-confirm-dealer-trigger"
        menuTestId="new-match-confirm-dealer-menu"
        setOverlayMenuOpen={setOverlayMenuOpen}
        setOverlayMenuRef={setOverlayMenuRef}
      >
        <div className="rm-menu-grid rm-menu-grid--compact">
          {NEW_MATCH_DEALER_OPTIONS.map((option) => (
            <ReplaceMenuOption
              key={String(option.value)}
              selected={dealerChoice === option.value}
              testId={`new-match-confirm-dealer-option-${option.value}`}
              onClick={() => {
                selectNewMatchDealerChoice(option.value)
                setOverlayMenuOpen(null)
              }}
            >
              <span className="rm-menu-option-label">{dealerChoiceText(option.value)}</span>
            </ReplaceMenuOption>
          ))}
        </div>
      </ReplaceField>
    </div>
  )
}

function ReplaceField({
  label,
  menuId,
  isOpen,
  value,
  testId,
  menuTestId,
  disabled,
  subField,
  setOverlayMenuOpen,
  setOverlayMenuRef,
  children,
}: {
  label: string
  menuId: OverlayMenuId
  isOpen: boolean
  value: string
  testId: string
  menuTestId: string
  disabled?: boolean
  subField?: boolean
  setOverlayMenuOpen: Dispatch<SetStateAction<OverlayMenuId | null>>
  setOverlayMenuRef: (menuId: OverlayMenuId, node: HTMLDivElement | null) => void
  children: ReactNode
}) {
  return (
    <div
      className={`rm-field rm-field--menu ${subField ? 'rm-field-sub' : ''} ${isOpen ? 'has-open-menu' : ''}`}
      ref={(node) => {
        setOverlayMenuRef(menuId, node)
      }}
    >
      <span className="rm-field-label">{label}</span>
      <div className="rm-field-control">
        <button
          type="button"
          className="rm-field-select"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          data-testid={testId}
          disabled={disabled}
          onClick={() => {
            setOverlayMenuOpen((current) => current === menuId ? null : menuId)
          }}
        >
          <span>{value}</span>
          <span className="rm-field-caret" aria-hidden="true">⌄</span>
        </button>
      </div>

      {isOpen && (
        <div className="rm-menu" role="listbox" aria-label={label} data-testid={menuTestId}>
          {children}
        </div>
      )}
    </div>
  )
}

function ReplaceMenuOption({
  children,
  selected,
  testId,
  onClick,
}: {
  children: ReactNode
  selected?: boolean
  testId: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`rm-menu-option ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
