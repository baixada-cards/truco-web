'use client'

import './MatchSetupFields.css'

import type { Dispatch, SetStateAction } from 'react'
import { useTranslations } from 'next-intl'
import type { BotKind, BotProfile, LlmProviderCatalog } from '../../lib/session-api'
import {
  BOT_KIND_OPTIONS,
  BOT_PROFILE_OPTIONS,
  NEW_MATCH_DEALER_OPTIONS,
  findLlmProviderCatalog,
  isLlmBotKind,
  resolvePreferredLlmModel,
  type DealerChoice,
} from '../../lib/live-bot-selection'
import { OverlaySelectField, type OverlayMenuId } from './OverlaySelectField'

// ---------------------------------------------------------------------------
// MatchSetupFields — bot + (optionally) dealer selection form
// ---------------------------------------------------------------------------

/**
 * Renders the bot / model / profile / dealer selector fields used in the
 * launcher overlay (scope="launcher"), the replace-match confirmation
 * (scope="replace"), and the settings drawer (scope="settings").
 *
 * The launcher and replace scopes show a dealer picker and a subordinate
 * bot-config block (profile / model / provider note).  The settings scope
 * renders profile and model fields directly without the wrapping container.
 */
export function MatchSetupFields({
  scope,
  // Bot selection state
  selectedBotKind,
  selectedBotProfile,
  selectedBotModel,
  llmProviders,
  solverAvailable,
  isLoadingProviders,
  selectedProvider,
  // Provider status (used in launcher/replace scopes only)
  showBotProviderStatus,
  providerStatusCopy,
  matchStartBlocked,
  providerLoadIssue,
  // Bot callbacks
  onBotKindChange,
  onBotProfileChange,
  onBotModelChange,
  // Bring-your-own-key (LLM kinds only)
  apiKeyValue,
  onApiKeyChange,
  // Dealer (launcher/replace scopes only)
  dealerChoice,
  onDealerChoiceChange,
  // Panel layout plumbing
  overlayMenuOpen,
  setOverlayMenuOpen,
  setOverlayMenuRef,
}: {
  scope: 'launcher' | 'replace' | 'settings'
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
  onBotKindChange: (kind: BotKind) => void
  onBotProfileChange: (profile: BotProfile) => void
  onBotModelChange: (modelId: string) => void
  apiKeyValue: string
  onApiKeyChange: (value: string) => void
  dealerChoice?: DealerChoice
  onDealerChoiceChange?: (choice: DealerChoice) => void
  overlayMenuOpen: OverlayMenuId | null
  setOverlayMenuOpen: Dispatch<SetStateAction<OverlayMenuId | null>>
  setOverlayMenuRef: (menuId: OverlayMenuId, node: HTMLDivElement | null) => void
}) {
  const tBot = useTranslations('Bot')
  const tCommon = useTranslations('Common')
  const tSetup = useTranslations('Live.matchSetup')
  const isSettings = scope === 'settings'
  const prefix = scope === 'launcher' ? 'live-game-launcher' : scope === 'replace' ? 'new-match-confirm' : null
  const botMenuId: OverlayMenuId = scope === 'launcher' ? 'launcher-bot' : scope === 'replace' ? 'replace-bot' : 'settings-bot'
  const profileMenuId: OverlayMenuId = scope === 'launcher' ? 'launcher-profile' : scope === 'replace' ? 'replace-profile' : 'settings-profile'
  const modelMenuId: OverlayMenuId = scope === 'launcher' ? 'launcher-model' : scope === 'replace' ? 'replace-model' : 'settings-model'

  const modelItems = (selectedProvider?.models ?? []).map((model) => ({
    value: model.id,
    label: model.id,
  }))
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
        if (!provider || !provider.enabled) {
          return tBot('model.unavailable')
        }

        return resolvePreferredLlmModel(
          provider,
          kind === selectedBotKind ? selectedBotModel : '',
        ) || tBot('model.choose')
      }
    }
  }
  const botKindTriggerMetaText = (kind: BotKind) => (
    kind === 'heuristic' ? null : botKindSummaryText(kind)
  )

  // The solved-strategy opponent is only offered when the service reports
  // policy artifacts; LLM kinds still hinge on their provider being enabled.
  const availableBotKinds = BOT_KIND_OPTIONS.filter((kind) => {
    if (kind === 'solver') return solverAvailable
    return true
  })

  const botField = (
    <OverlaySelectField
      menuId={botMenuId}
      label={tSetup('bot')}
      valueLabel={botKindText(selectedBotKind)}
      valueMeta={botKindTriggerMetaText(selectedBotKind)}
      triggerTestId={prefix ? `${prefix}-bot-trigger` : 'live-game-bot-picker-trigger'}
      menuTestId={prefix ? `${prefix}-bot-menu` : 'live-game-bot-picker-menu'}
      optionTestIdPrefix={prefix ? `${prefix}-bot-option` : 'live-game-bot-option'}
      items={availableBotKinds.map((kind) => ({
        value: kind,
        label: botKindText(kind),
      }))}
      optionDescriptions={Object.fromEntries(
        availableBotKinds.map((kind) => [kind, botKindSummaryText(kind)]),
      ) as Partial<Record<BotKind, string | null>>}
      selectedValue={selectedBotKind}
      onSelect={(kind) => {
        onBotKindChange(kind as BotKind)
      }}
      overlayMenuOpen={overlayMenuOpen}
      setOverlayMenuOpen={setOverlayMenuOpen}
      setOverlayMenuRef={setOverlayMenuRef}
    />
  )

  const profileField = selectedBotKind === 'heuristic' && (
    <OverlaySelectField
      menuId={profileMenuId}
      label={isSettings ? tSetup('heuristicProfileSettings') : tSetup('heuristicProfile')}
      valueLabel={botProfileText(selectedBotProfile)}
      triggerTestId={prefix ? `${prefix}-bot-profile-trigger` : 'live-game-bot-profile-trigger'}
      menuTestId={prefix ? `${prefix}-bot-profile-menu` : 'live-game-bot-profile-menu'}
      optionTestIdPrefix={prefix ? `${prefix}-bot-profile-option` : 'live-game-bot-profile-option'}
      fieldClassName="match-setup-field--subordinate"
      labelClassName="match-setup-field__label--subordinate"
      selectClassName="match-setup-select--subordinate"
      items={BOT_PROFILE_OPTIONS.map((profile) => ({
        value: profile,
        label: botProfileText(profile),
      }))}
      optionDescriptions={Object.fromEntries(
        BOT_PROFILE_OPTIONS.map((profile) => [profile, botProfileDescriptionText(profile)]),
      ) as Partial<Record<BotProfile, string | null>>}
      selectedValue={selectedBotProfile}
      onSelect={(profile) => {
        onBotProfileChange(profile as BotProfile)
      }}
      overlayMenuOpen={overlayMenuOpen}
      setOverlayMenuOpen={setOverlayMenuOpen}
      setOverlayMenuRef={setOverlayMenuRef}
    />
  )

  const modelField = isLlmBotKind(selectedBotKind) && (
    <OverlaySelectField
      menuId={modelMenuId}
      label={tSetup(isSettings ? 'modelSettings' : 'model', { provider: botKindText(selectedBotKind) })}
      valueLabel={selectedBotModel || tBot('model.select')}
      triggerTestId={prefix ? `${prefix}-bot-model-trigger` : 'live-game-bot-model-trigger'}
      menuTestId={prefix ? `${prefix}-bot-model-menu` : 'live-game-bot-model-menu'}
      optionTestIdPrefix={prefix ? `${prefix}-bot-model-option` : 'live-game-bot-model-option'}
      fieldClassName="match-setup-field--subordinate"
      labelClassName="match-setup-field__label--subordinate"
      selectClassName="match-setup-select--subordinate"
      items={modelItems}
      selectedValue={selectedBotModel}
      disabled={isLoadingProviders || !selectedProvider?.enabled || modelItems.length === 0}
      onSelect={(modelId) => {
        onBotModelChange(modelId)
      }}
      overlayMenuOpen={overlayMenuOpen}
      setOverlayMenuOpen={setOverlayMenuOpen}
      setOverlayMenuRef={setOverlayMenuRef}
    />
  )

  // Bring-your-own-key: optional, LLM kinds only. Sent only on match creation;
  // never persisted client-side (see LiveGame — this is unmanaged input state).
  const apiKeyField = isLlmBotKind(selectedBotKind) && (
    <label
      className={`match-setup-byok ${isSettings ? '' : 'match-setup-byok--subordinate'}`}
      data-testid={prefix ? `${prefix}-byok-field` : 'live-game-byok-field'}
    >
      <span className="match-setup-byok__label">
        {tSetup('byokLabel', { provider: botKindText(selectedBotKind) })}
      </span>
      <input
        type="password"
        className="match-setup-byok__input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={tSetup('byokPlaceholder')}
        value={apiKeyValue}
        onChange={(event) => onApiKeyChange(event.target.value)}
        data-testid={prefix ? `${prefix}-byok-input` : 'live-game-byok-input'}
      />
      <span className="match-setup-byok__hint">{tSetup('byokHint')}</span>
    </label>
  )

  // Settings scope: flat list, no bot-config wrapper, no dealer picker
  if (isSettings) {
    return (
      <div className="live-settings-panel__stack" data-testid="live-game-settings-bot-panel">
        {botField}
        {profileField}
        {modelField}
        {apiKeyField}
      </div>
    )
  }

  // Launcher / replace scopes: wrapped sub-fields + dealer picker
  const dealerMenuId: OverlayMenuId = scope === 'launcher' ? 'launcher-dealer' : 'replace-dealer'
  const resolvedDealerChoice = dealerChoice ?? 'random'
  const showSubFields = selectedBotKind === 'heuristic' || isLlmBotKind(selectedBotKind) || (showBotProviderStatus && Boolean(providerStatusCopy))

  return (
    <div className="match-setup-form">
      {botField}
      {showSubFields && (
        <div className="match-setup-bot-config" data-testid={`${prefix}-bot-config`}>
          {profileField}
          {modelField}
          {apiKeyField}
          {showBotProviderStatus && providerStatusCopy && (
            <div
              className={`match-setup-note match-setup-note--subordinate ${matchStartBlocked || providerLoadIssue ? 'is-warning' : ''}`}
              role={matchStartBlocked || providerLoadIssue ? 'alert' : undefined}
            >
              {providerStatusCopy}
            </div>
          )}
        </div>
      )}
      <OverlaySelectField
        menuId={dealerMenuId}
        label={tSetup('firstDealer')}
        valueLabel={dealerChoiceText(resolvedDealerChoice)}
        triggerTestId={`${prefix}-dealer-trigger`}
        menuTestId={`${prefix}-dealer-menu`}
        optionTestIdPrefix={`${prefix}-dealer-option`}
        items={NEW_MATCH_DEALER_OPTIONS.map((option) => ({
          value: String(option.value),
          label: dealerChoiceText(option.value),
        }))}
        selectedValue={String(resolvedDealerChoice)}
        onSelect={(value) => {
          onDealerChoiceChange?.(value === 'random' ? 'random' : value === '0' ? 0 : 1)
        }}
        overlayMenuOpen={overlayMenuOpen}
        setOverlayMenuOpen={setOverlayMenuOpen}
        setOverlayMenuRef={setOverlayMenuRef}
      />
    </div>
  )
}
