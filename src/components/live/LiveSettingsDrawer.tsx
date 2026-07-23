'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { BotKind, BotProfile, LlmProviderCatalog } from '../../lib/session-api'
import type { DealerChoice } from '../../lib/live-bot-selection'
import type { LiveGamePreferences } from '../../lib/live-game-preferences'
import type { LiveSoundSettings } from '../../lib/live-sound-settings'
import type { SettingsDrawerSection } from '../../lib/use-live-panel-layout'
import type { OverlayMenuId } from '../../lib/use-live-panel-layout'
import type { DeckSystem } from '../../lib/deck-system'
import {
  setHintsEnabled,
  type GameplayHintsState,
} from '../../lib/live-gameplay-hints'
import {
  buildDefaultLiveSettingsSectionOpenState,
  persistLiveSettingsSectionOpenState,
  readLiveSettingsSectionOpenState,
  sanitizeLiveSettingsSectionOpenState,
  type LiveSettingsSectionId,
  type LiveSettingsSectionOpenState,
} from '../../lib/live-settings-ui'
import type { AppLocale } from '../../i18n/locales'

import './LiveSettingsDrawer.css'
import {
  LIVE_SHORTCUT_ACTIONS,
  buildDefaultLiveShortcutMap,
  type LiveShortcutAction,
} from '../../lib/live-keyboard-shortcuts'
import { MatchSetupFields } from './MatchSetupFields'
import { DeckSettings } from '../farol/DeckSettings'
import { LanguagePicker } from './LanguagePicker'

function SettingsSection({
  marker,
  title,
  summary,
  testId,
  isOpen,
  onToggle,
  children,
}: {
  marker: string
  title: string
  summary: string
  testId?: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className={`live-settings-drawer__section sp-section ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className="live-settings-drawer__section-toggle sp-section-head"
        data-testid={testId}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span className="sp-section-marker">{marker}</span>
        <span className="live-settings-drawer__section-title sp-section-title">{title}</span>
        <span className="live-settings-drawer__section-summary sp-section-summary">
          {isOpen ? '' : summary}
        </span>
        <span className="live-settings-drawer__section-icon sp-section-chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="live-settings-drawer__section-body sp-section-body">
          {children}
        </div>
      )}
    </section>
  )
}

function SettingsToggle({
  pressed,
  ariaLabel,
  testId,
  onClick,
}: {
  pressed: boolean
  ariaLabel: string
  testId?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`live-settings-drawer__toggle sp-toggle ${pressed ? 'is-on is-active' : ''}`}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="sp-toggle-bead" aria-hidden="true" />
    </button>
  )
}

function shortcutDisplayValue(value: string | null | undefined) {
  return value && value.trim() ? value : '—'
}

// ---------------------------------------------------------------------------
// LiveSettingsDrawer
// ---------------------------------------------------------------------------

export function LiveSettingsDrawer({
  // Close / nav
  closeUtilitySurface,
  openSettingsDrawer,
  // Match actions
  requestStartNewGame,
  newMatchDealerChoice,
  showBotProviderStatus,
  matchStartBlocked,
  providerLoadIssue,
  providerStatusCopy,
  // Section accordion
  expandedSettingsSection,
  toggleSettingsSection,
  // Playback toggles
  fastModeEnabled,
  gamePreferences,
  updateGamePreferences,
  compactViewportActive,
  // Sound
  soundSettings,
  updateSoundSettings,
  beginSoundSliderGesture,
  endSoundSliderGesture,
  soundSliderStartVolumeRef,
  primeSound,
  // Bot setup
  selectedBotKind,
  selectedBotProfile,
  selectedBotModel,
  llmProviders,
  solverAvailable,
  isLoadingProviders,
  selectedProvider,
  onBotKindChange,
  onBotProfileChange,
  onBotModelChange,
  apiKeyValue,
  onApiKeyChange,
  overlayMenuOpen,
  setOverlayMenuOpen,
  setOverlayMenuRef,
  refreshProviderCatalogs,
  isPending,
  isAutoStartingHand,
  switchBackToHeuristic,
  // Gameplay hints
  gameplayHints,
  updateGameplayHints,
  // Shortcuts
  shortcutCaptureAction,
  setShortcutCaptureAction,
  // Study lab link (null when the lab is disabled or the spot has no solve)
  studySpotText,
}: {
  closeUtilitySurface: () => void
  openSettingsDrawer: (section?: SettingsDrawerSection) => void
  requestStartNewGame: (dealerChoice: DealerChoice) => void
  newMatchDealerChoice: DealerChoice
  showBotProviderStatus: boolean
  matchStartBlocked: boolean
  providerLoadIssue: string | null
  providerStatusCopy: string | null
  expandedSettingsSection: SettingsDrawerSection | null
  toggleSettingsSection: (section: SettingsDrawerSection) => void
  fastModeEnabled: boolean
  gamePreferences: LiveGamePreferences
  updateGamePreferences: (updater: (previous: LiveGamePreferences) => LiveGamePreferences) => void
  compactViewportActive: boolean
  soundSettings: LiveSoundSettings
  updateSoundSettings: (updater: (previous: LiveSoundSettings) => LiveSoundSettings) => void
  beginSoundSliderGesture: () => void
  endSoundSliderGesture: () => void
  soundSliderStartVolumeRef: MutableRefObject<number | null>
  primeSound: () => void
  selectedBotKind: BotKind
  selectedBotProfile: BotProfile
  selectedBotModel: string
  llmProviders: LlmProviderCatalog[]
  solverAvailable: boolean
  isLoadingProviders: boolean
  selectedProvider: LlmProviderCatalog | null
  onBotKindChange: (kind: BotKind) => void
  onBotProfileChange: (profile: BotProfile) => void
  onBotModelChange: (modelId: string) => void
  apiKeyValue: string
  onApiKeyChange: (value: string) => void
  overlayMenuOpen: OverlayMenuId | null
  setOverlayMenuOpen: Dispatch<SetStateAction<OverlayMenuId | null>>
  setOverlayMenuRef: (menuId: OverlayMenuId, node: HTMLDivElement | null) => void
  refreshProviderCatalogs: () => Promise<void>
  isPending: boolean
  isAutoStartingHand: boolean
  switchBackToHeuristic: () => void
  shortcutCaptureAction: LiveShortcutAction | null
  setShortcutCaptureAction: Dispatch<SetStateAction<LiveShortcutAction | null>>
  gameplayHints: GameplayHintsState
  updateGameplayHints: (updater: (previous: GameplayHintsState) => GameplayHintsState) => void
  studySpotText: string | null
}) {
  const locale = useLocale() as AppLocale
  const tCommon = useTranslations('Common')
  const tLanguage = useTranslations('Language')
  const tSettings = useTranslations('Live.settings')
  const tBot = useTranslations('Bot')
  const tDeck = useTranslations('Live.deck')
  const [drawerPhase, setDrawerPhase] = useState<'opening' | 'open' | 'closing'>('opening')
  const closeTimerRef = useRef<number | null>(null)
  const openTimerRef = useRef<number | null>(null)
  const [openSections, setOpenSectionsState] = useState<LiveSettingsSectionOpenState>(
    () => buildDefaultLiveSettingsSectionOpenState(),
  )

  const setOpenSections = useCallback<Dispatch<SetStateAction<LiveSettingsSectionOpenState>>>((value) => {
    setOpenSectionsState((previousState) => {
      const nextState = sanitizeLiveSettingsSectionOpenState(
        typeof value === 'function' ? value(previousState) : value,
      )
      persistLiveSettingsSectionOpenState(nextState)
      return nextState
    })
  }, [])

  useEffect(() => {
    openTimerRef.current = window.setTimeout(() => {
      setDrawerPhase('open')
      openTimerRef.current = null
    }, 220)

    return () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current)
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setOpenSectionsState(readLiveSettingsSectionOpenState())
  }, [])

  useEffect(() => {
    if (!expandedSettingsSection) return
    setOpenSections((previous) => ({
      ...previous,
      [expandedSettingsSection]: true,
    }))
  }, [expandedSettingsSection, setOpenSections])

  useEffect(() => {
    if (!compactViewportActive || !shortcutCaptureAction) return
    setShortcutCaptureAction(null)
  }, [compactViewportActive, shortcutCaptureAction, setShortcutCaptureAction])

  const beginClose = (afterClose?: () => void) => {
    if (drawerPhase === 'closing') return
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    setDrawerPhase('closing')
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      closeUtilitySurface()
      afterClose?.()
    }, 180)
  }

  const toggleLocalSection = (section: LiveSettingsSectionId) => {
    const nextIsOpen = !openSections[section]

    setOpenSections((previous) => ({
      ...previous,
      [section]: !previous[section],
    }))

    if (section !== 'deck' && section !== 'language') {
      if (nextIsOpen && expandedSettingsSection !== section) {
        toggleSettingsSection(section)
      } else if (!nextIsOpen && expandedSettingsSection === section) {
        toggleSettingsSection(section)
      }
    }
  }

  const botKindText = (kind: BotKind | null | undefined) => {
    switch (kind) {
      case 'random':
      case 'simple':
      case 'heuristic':
      case 'openai':
      case 'anthropic':
      case 'openrouter':
        return tBot(`kind.${kind}.label`)
      default:
        return tBot('kind.unknown.label')
    }
  }
  const botProfileText = (profile: BotProfile | null | undefined) => {
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
  const botKindDescriptionText = (kind: BotKind) => {
    switch (kind) {
      case 'random':
      case 'simple':
      case 'heuristic':
      case 'openai':
      case 'anthropic':
      case 'openrouter':
        return tBot(`kind.${kind}.description`)
      default:
        return tBot('kind.unknown.description')
    }
  }
  const currentBotSummary = selectedBotKind === 'heuristic'
    ? `${botKindText(selectedBotKind)} · ${botProfileText(selectedBotProfile)}`
    : selectedBotModel
      ? `${botKindText(selectedBotKind)} · ${selectedBotModel}`
      : botKindText(selectedBotKind)
  const playbackSummary = tSettings('playbackSummary', {
    speed: tSettings(`speed.${fastModeEnabled ? 'fast' : 'normal'}`),
    volume: Math.round(soundSettings.soundVolume * 100),
  })
  const shortcutsSummary = gamePreferences.shortcutsEnabled
    ? tSettings('shortcuts.enabled')
    : tSettings('shortcuts.disabled')
  const deckSummary = tDeck(`summary.${gamePreferences.deckSystem}`)
  const languageSummary = tLanguage(locale)
  const soundPercent = Math.round(soundSettings.soundVolume * 100)
  const showShortcutsSection = !compactViewportActive
  const changeDeckSystem = (deckSystem: DeckSystem) => {
    updateGamePreferences((previous) => ({
      ...previous,
      deckPickerCompleted: true,
      deckSystem,
    }))
  }
  const drawerClassName = [
    'live-settings-drawer',
    'sp-folio',
    drawerPhase === 'opening' ? 'is-opening' : '',
    drawerPhase === 'closing' ? 'is-closing' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div
        className="live-settings-drawer-scrim sp-folio-overlay"
        aria-hidden="true"
        onClick={() => { beginClose() }}
      />
      <aside
        className={drawerClassName}
        role="dialog"
        aria-modal="true"
        aria-label={tSettings('ariaLabel')}
        data-testid="live-settings-drawer"
      >
        <div className="sp-folio-pin" aria-hidden="true" />
        <header className="live-settings-drawer__header sp-folio-head">
          <div>
            <div className="live-settings-drawer__kicker sp-folio-eyebrow">{tSettings('kicker')}</div>
            <h2 className="live-settings-drawer__title sp-folio-title">{tSettings('title')}</h2>
          </div>
          <button
            type="button"
            className="live-settings-drawer__close sp-folio-close"
            aria-label={tSettings('closeAria')}
            onClick={() => { beginClose() }}
          >
            <span className="sp-folio-close-x" aria-hidden="true">×</span>
            <span>{tCommon('close')}</span>
          </button>
        </header>

        <div className="live-settings-drawer__body">
          <div className="sp-group">
            <div className="sp-group-label">{tSettings('matchGroup')}</div>

            <div className="sp-match-strip">
              <button
                type="button"
                className="live-settings-drawer__new-match sp-match-strip-button"
                data-testid="live-game-new-match-button"
                onClick={() => {
                  beginClose(() => {
                    requestStartNewGame(newMatchDealerChoice)
                  })
                }}
              >
                {tCommon('newMatch')}
              </button>
            </div>

            {studySpotText && (
              <div className="live-settings-drawer__action-row live-settings-drawer__study-spot-row">
                <a
                  className="sp-stamp"
                  data-testid="live-game-study-spot-link"
                  href={`/${locale}/lab/study?s=${encodeURIComponent(studySpotText)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {tSettings('studySpot')}
                </a>
              </div>
            )}

            {showBotProviderStatus && (matchStartBlocked || providerLoadIssue) && providerStatusCopy && (
              <button
                type="button"
                className="live-settings-drawer__alert"
                data-testid="live-game-provider-alert"
                onClick={() => { openSettingsDrawer('match') }}
              >
                <span className="live-settings-drawer__alert-title">{tSettings('settingsNeeded')}</span>
                <span className="live-settings-drawer__alert-copy">{providerStatusCopy}</span>
              </button>
            )}

            <SettingsSection
              marker="i."
              title={tSettings('section.bot')}
              summary={currentBotSummary.toLowerCase()}
              testId="live-settings-section-match-toggle"
              isOpen={openSections.match}
              onToggle={() => { toggleLocalSection('match') }}
            >
              <div className="sp-current">
                <div className="sp-current-eyebrow">{tSettings('currentlyPlaying')}</div>
                <div className="sp-current-name">
                  {selectedBotKind === 'heuristic'
                    ? `${botKindText(selectedBotKind)} · ${botProfileText(selectedBotProfile)}`
                    : currentBotSummary}
                </div>
                <div className="sp-current-meta">{botKindDescriptionText(selectedBotKind)}</div>
              </div>

              <MatchSetupFields
                scope="settings"
                selectedBotKind={selectedBotKind}
                selectedBotProfile={selectedBotProfile}
                selectedBotModel={selectedBotModel}
                llmProviders={llmProviders}
                solverAvailable={solverAvailable}
                isLoadingProviders={isLoadingProviders}
                selectedProvider={selectedProvider}
                showBotProviderStatus={showBotProviderStatus}
                providerStatusCopy={providerStatusCopy}
                matchStartBlocked={matchStartBlocked}
                providerLoadIssue={providerLoadIssue}
                onBotKindChange={onBotKindChange}
                onBotProfileChange={onBotProfileChange}
                onBotModelChange={onBotModelChange}
                apiKeyValue={apiKeyValue}
                onApiKeyChange={onApiKeyChange}
                overlayMenuOpen={overlayMenuOpen}
                setOverlayMenuOpen={setOverlayMenuOpen}
                setOverlayMenuRef={setOverlayMenuRef}
              />

              {(selectedBotKind === 'random' || selectedBotKind === 'simple') && (
                <div className="live-settings-drawer__note">
                  {tSettings('simpleBotNote')}
                </div>
              )}

              {showBotProviderStatus && providerStatusCopy && (
                <div
                  className={`live-settings-drawer__note ${matchStartBlocked || providerLoadIssue ? 'is-warning' : ''}`}
                  role={matchStartBlocked || providerLoadIssue ? 'alert' : undefined}
                >
                  {providerStatusCopy}
                </div>
              )}

              {showBotProviderStatus && (
                <div className="live-settings-drawer__action-row">
                  <button
                    type="button"
                    className="sp-stamp"
                    disabled={isLoadingProviders || isPending || isAutoStartingHand}
                    onClick={() => { void refreshProviderCatalogs() }}
                  >
                    {tSettings('reloadLlm')}
                  </button>
                  {selectedBotKind !== 'heuristic' && (
                    <button
                      type="button"
                      className="sp-stamp"
                      disabled={isPending || isAutoStartingHand}
                      onClick={switchBackToHeuristic}
                    >
                      {tSettings('useHeuristic')}
                    </button>
                  )}
                </div>
              )}
            </SettingsSection>
          </div>

          <div className="sp-group">
            <div className="sp-group-label">{tSettings('preferencesGroup')}</div>

            <SettingsSection
              marker="ii."
              title={tLanguage('title')}
              summary={languageSummary}
              testId="live-settings-section-language-toggle"
              isOpen={openSections.language}
              onToggle={() => { toggleLocalSection('language') }}
            >
              <div className="settings-panel" data-testid="live-game-settings-language-panel">
                <LanguagePicker variant="settings" />
              </div>
            </SettingsSection>

            <SettingsSection
              marker="iii."
              title={tSettings('section.playback')}
              summary={playbackSummary}
              testId="live-settings-section-experience-toggle"
              isOpen={openSections.experience}
              onToggle={() => { toggleLocalSection('experience') }}
            >
              <div className="settings-panel" data-testid="live-game-settings-playback-panel">
                <div className="sp-field settings-panel__toggle-row">
                  <span className="sp-field-label settings-panel__toggle-label">{tSettings('fastMode')}</span>
                  <SettingsToggle
                    pressed={fastModeEnabled}
                    ariaLabel={fastModeEnabled ? tSettings('fastModeAriaOn') : tSettings('fastModeAriaOff')}
                    onClick={() => {
                      updateGamePreferences((previous) => ({
                        ...previous,
                        fastMode: !previous.fastMode,
                      }))
                    }}
                  />
                </div>

                <div className="sp-field settings-panel__toggle-row">
                  <div>
                    <div className="sp-field-label settings-panel__toggle-label">{tSettings('playOnHide')}</div>
                    <span className="sp-field-hint">{tSettings('playOnHideHint')}</span>
                  </div>
                  <SettingsToggle
                    pressed={gamePreferences.hideCardPlaysImmediately}
                    testId="live-hide-card-plays-immediately-toggle"
                    ariaLabel={gamePreferences.hideCardPlaysImmediately ? tSettings('playOnHideAriaOn') : tSettings('playOnHideAriaOff')}
                    onClick={() => {
                      updateGamePreferences((previous) => ({
                        ...previous,
                        hideCardPlaysImmediately: !previous.hideCardPlaysImmediately,
                      }))
                    }}
                  />
                </div>

                <div className="sp-field settings-panel__toggle-row">
                  <div>
                    <div className="sp-field-label settings-panel__toggle-label">{tSettings('gameplayHints')}</div>
                    <span className="sp-field-hint">{tSettings('gameplayHintsHint')}</span>
                  </div>
                  <SettingsToggle
                    pressed={gameplayHints.hintsEnabled}
                    testId="live-gameplay-hints-toggle"
                    ariaLabel={gameplayHints.hintsEnabled ? tSettings('gameplayHintsAriaOn') : tSettings('gameplayHintsAriaOff')}
                    onClick={() => {
                      updateGameplayHints((previous) => setHintsEnabled(previous, !previous.hintsEnabled))
                    }}
                  />
                </div>

                <div className="sp-field live-settings-drawer__volume-row">
                  <span className="sp-field-label settings-panel__toggle-label">{tSettings('soundFx')}</span>
                  <div
                    className={`live-settings-drawer__volume sp-slider-row ${!soundSettings.soundEnabled ? 'is-muted' : ''}`}
                    style={{ ['--volume-pct' as string]: `${soundPercent}%` }}
                  >
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={soundPercent}
                      onPointerDown={beginSoundSliderGesture}
                      onPointerUp={endSoundSliderGesture}
                      onPointerCancel={endSoundSliderGesture}
                      onBlur={endSoundSliderGesture}
                      onChange={(event) => {
                        const nextVolume = Number(event.target.value) / 100
                        const preservedSoundVolume = soundSliderStartVolumeRef.current
                        updateSoundSettings((previous) => ({
                          ...previous,
                          soundEnabled: nextVolume > 0,
                          soundVolume: nextVolume,
                          soundLastAudibleVolume:
                            nextVolume > 0
                              ? nextVolume
                              : preservedSoundVolume && preservedSoundVolume > 0
                                ? preservedSoundVolume
                                : previous.soundLastAudibleVolume,
                        }))
                      }}
                      aria-label={tSettings('soundVolumeAria')}
                    />
                    <button
                      type="button"
                      className={`live-settings-drawer__mute sp-slider-value ${!soundSettings.soundEnabled ? 'is-muted' : ''}`}
                      aria-label={soundSettings.soundEnabled ? tSettings('muteSoundAria') : tSettings('unmuteSoundAria')}
                      aria-pressed={!soundSettings.soundEnabled}
                      onClick={() => {
                        if (!soundSettings.soundEnabled) {
                          primeSound()
                        }

                        updateSoundSettings((previous) => ({
                          ...previous,
                          soundEnabled: !previous.soundEnabled,
                          soundVolume: previous.soundEnabled
                            ? 0
                            : previous.soundLastAudibleVolume,
                          soundLastAudibleVolume:
                            previous.soundEnabled && previous.soundVolume > 0
                              ? previous.soundVolume
                              : previous.soundLastAudibleVolume,
                        }))
                      }}
                    >
                      {soundPercent}%
                    </button>
                  </div>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              marker="iv."
              title={tSettings('section.deck')}
              summary={deckSummary}
              testId="live-settings-section-deck-toggle"
              isOpen={openSections.deck}
              onToggle={() => { toggleLocalSection('deck') }}
            >
              <DeckSettings
                value={gamePreferences.deckSystem}
                onChange={changeDeckSystem}
              />
            </SettingsSection>

            {showShortcutsSection && (
              <SettingsSection
                marker="v."
                title={tSettings('section.shortcuts')}
                summary={shortcutsSummary}
                testId="live-settings-section-shortcuts-toggle"
                isOpen={openSections.shortcuts}
                onToggle={() => { toggleLocalSection('shortcuts') }}
              >
                <div className="settings-panel" data-testid="live-game-shortcuts-panel">
                  <div className="sp-field settings-panel__toggle-row">
                    <span className="sp-field-label settings-panel__toggle-label">{tSettings('shortcuts.enable')}</span>
                    <SettingsToggle
                      pressed={gamePreferences.shortcutsEnabled}
                      testId="live-shortcuts-enabled-toggle"
                      ariaLabel={gamePreferences.shortcutsEnabled ? tSettings('shortcuts.ariaOn') : tSettings('shortcuts.ariaOff')}
                      onClick={() => {
                        updateGamePreferences((previous) => ({
                          ...previous,
                          shortcutsEnabled: !previous.shortcutsEnabled,
                        }))
                      }}
                    />
                  </div>

                  {gamePreferences.shortcutsEnabled && (
                    <div className="sp-shortcuts">
                      {LIVE_SHORTCUT_ACTIONS.map((action) => (
                        <div className="sp-shortcut-row" key={action}>
                          <span className="sp-shortcut-label">{tSettings(`shortcuts.action.${action}`)}</span>
                          <button
                            type="button"
                            className={`sp-keycap shortcut-key ${shortcutCaptureAction === action ? 'is-listening' : ''}`}
                            data-testid={`live-shortcut-${action}`}
                            onClick={() => {
                              setShortcutCaptureAction((current) => (current === action ? null : action))
                            }}
                          >
                            {shortcutCaptureAction === action
                              ? tSettings('shortcuts.pressKey')
                              : shortcutDisplayValue(gamePreferences.shortcuts[action])}
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="sp-stamp sp-shortcuts-reset"
                        onClick={() => {
                          setShortcutCaptureAction(null)
                          updateGamePreferences((previous) => ({
                            ...previous,
                            shortcutsEnabled: true,
                            shortcuts: buildDefaultLiveShortcutMap(),
                          }))
                        }}
                      >
                        {tSettings('shortcuts.reset')}
                      </button>
                    </div>
                  )}
                </div>
              </SettingsSection>
            )}

          </div>
        </div>

        <div className="sp-folio-corner" aria-hidden="true" />
      </aside>
    </>
  )
}
