import type { BotKind, BotProfile, LlmBotKind, LlmProviderCatalog } from './session-api'

// ---------------------------------------------------------------------------
// Shared UI types (also used by LiveGame.tsx constants)
// ---------------------------------------------------------------------------

export type Seat = 0 | 1
export type DealerChoice = Seat | 'random'

// ---------------------------------------------------------------------------
// Option lists used by match-setup and settings panels
// ---------------------------------------------------------------------------

export const BOT_PROFILE_OPTIONS: BotProfile[] = ['conservative', 'balanced', 'aggressive', 'tricky']

const BOT_KIND_IDS = new Set<BotKind>([
  'random',
  'simple',
  'heuristic',
  'solver',
  'openai',
  'anthropic',
  'openrouter',
])
const BOT_PROFILE_IDS = new Set<BotProfile>(BOT_PROFILE_OPTIONS)

export const heuristicBotKinds: Extract<BotKind, 'random' | 'heuristic'>[] = [
  'random',
  'heuristic',
]

// OpenRouter leads: it is the shared-key path that reaches every model
// (incl. Grok and the Chinese labs) and supports bring-your-own-key.
export const llmBotKinds: LlmBotKind[] = ['openrouter', 'openai', 'anthropic']

// The solver opponent is listed between the local bots and the LLM providers;
// UIs filter it out when the engine service reports no policy artifacts.
export const BOT_KIND_OPTIONS: BotKind[] = [...heuristicBotKinds, 'solver', ...llmBotKinds]

export const NEW_MATCH_DEALER_OPTIONS: Array<{ value: DealerChoice; label: string }> = [
  { value: 'random', label: 'Random' },
  { value: 0, label: 'You' },
  { value: 1, label: 'Them' },
]

export function isBotKind(value: unknown): value is BotKind {
  return typeof value === 'string' && BOT_KIND_IDS.has(value as BotKind)
}

export function isBotProfile(value: unknown): value is BotProfile {
  return typeof value === 'string' && BOT_PROFILE_IDS.has(value as BotProfile)
}

export function isDealerChoice(value: unknown): value is DealerChoice {
  return value === 'random' || value === 0 || value === 1
}

// ---------------------------------------------------------------------------
// Label / description helpers for UI
// ---------------------------------------------------------------------------

export function seatLabel(seat: number) {
  return seat === 0 ? 'You' : 'Them'
}

export function dealerChoiceLabel(choice: DealerChoice) {
  return choice === 'random' ? 'Random' : seatLabel(choice)
}

export function botKindLabel(botKind: BotKind | null | undefined) {
  switch (botKind) {
    case 'random': return 'Random'
    case 'simple': return 'Simple'
    case 'heuristic': return 'Heuristic'
    case 'solver': return 'Solver'
    case 'openai': return 'OpenAI'
    case 'anthropic': return 'Anthropic'
    case 'openrouter': return 'OpenRouter'
    default: return 'Unknown'
  }
}

export function botProfileLabel(botProfile: BotProfile | null | undefined) {
  switch (botProfile) {
    case 'conservative': return 'Conservative'
    case 'balanced': return 'Balanced'
    case 'aggressive': return 'Aggressive'
    case 'tricky': return 'Tricky'
    default: return 'Balanced'
  }
}

export function botKindDescription(botKind: BotKind) {
  switch (botKind) {
    case 'random':
      return 'Useful for noisy tests: it can find the right move, invent nonsense, or fold oddly.'
    case 'simple':
      return 'A predictable opponent for flow checks, with no bluffing or subtle table reading.'
    case 'heuristic':
      return 'The closest table-style opponent: contests, raises, or backs off based on context.'
    case 'solver':
      return 'Plays the exact solved strategy. The match starts at 10 × 10, the earliest score whose every continuation is solved.'
    case 'openai':
      return 'Play against an OpenAI-backed bot with the configured model catalog.'
    case 'anthropic':
      return 'Play against an Anthropic-backed bot with the configured model catalog.'
    case 'openrouter':
      return 'Play against any OpenRouter model — bring your own key to reach them all.'
    default:
      return 'Choose how they should play the next match.'
  }
}

export function botProfileDescription(botProfile: BotProfile) {
  switch (botProfile) {
    case 'conservative':
      return 'Plays smaller edges and protects the score.'
    case 'balanced':
      return 'Mixes pressure and discipline for the default read.'
    case 'aggressive':
      return 'Pushes spots harder and leans into raises.'
    case 'tricky':
      return 'Adds more deception and weird tempo shifts.'
    default:
      return 'Balanced by default.'
  }
}

export function botKindSummary(options: {
  botKind: BotKind
  selectedBotKind: BotKind
  selectedBotProfile: BotProfile
  selectedBotModel: string
  providers: LlmProviderCatalog[]
  isLoadingProviders: boolean
}) {
  const {
    botKind,
    selectedBotKind,
    selectedBotModel,
    providers,
    isLoadingProviders,
  } = options

  switch (botKind) {
    case 'random':
      return 'Chooses each move without a plan.'
    case 'simple':
      return 'Follows basic rules and plays straight.'
    case 'heuristic':
      return 'Reads hand strength, score, and risk.'
    case 'solver':
      return 'The exact equilibrium, from 10 × 10.'
    default: {
      if (isLoadingProviders) return 'Loading model defaults...'

      const provider = findLlmProviderCatalog(providers, botKind)
      if (!provider || !provider.enabled) {
        return 'Unavailable'
      }

      const nextModel = resolvePreferredLlmModel(
        provider,
        botKind === selectedBotKind ? selectedBotModel : '',
      )

      return nextModel || 'Choose a model'
    }
  }
}

export function botKindTriggerMeta(options: {
  botKind: BotKind
  selectedBotKind: BotKind
  selectedBotProfile: BotProfile
  selectedBotModel: string
  providers: LlmProviderCatalog[]
  isLoadingProviders: boolean
}) {
  if (options.botKind === 'heuristic') return null
  return botKindSummary(options)
}

export type LlmSelectionValidationResult = {
  status: number
  code: 'BOT_PROVIDER_UNAVAILABLE' | 'BOT_MODEL_REQUIRED' | 'BOT_MODEL_UNAVAILABLE'
  message: string
}

export function isLlmBotKind(botKind: BotKind | null | undefined): botKind is LlmBotKind {
  return botKind === 'openai' || botKind === 'anthropic' || botKind === 'openrouter'
}

const LLM_DISPLAY_NAMES: Record<LlmBotKind, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
}

export function botKindDisplayName(botKind: LlmBotKind) {
  return LLM_DISPLAY_NAMES[botKind]
}

function botKindWithArticle(botKind: LlmBotKind) {
  return `an ${botKindDisplayName(botKind)}`
}

export function findLlmProviderCatalog(
  providers: LlmProviderCatalog[],
  botKind: BotKind | null | undefined,
) {
  if (!isLlmBotKind(botKind)) return null
  return providers.find((provider) => provider.provider === botKind) ?? null
}

export function resolvePreferredLlmModel(
  provider: LlmProviderCatalog | null,
  selectedBotModel: string | null | undefined,
) {
  if (!provider?.enabled) return ''
  if (selectedBotModel && provider.models.some((model) => model.id === selectedBotModel)) {
    return selectedBotModel
  }

  return provider.default_model ?? provider.models[0]?.id ?? ''
}

export function getLlmSelectionIssue(options: {
  selectedBotKind: BotKind
  selectedBotModel: string | null | undefined
  providers: LlmProviderCatalog[]
  isLoadingProviders: boolean
  providerLoadIssue: string | null
}) {
  const {
    selectedBotKind,
    selectedBotModel,
    providers,
    isLoadingProviders,
    providerLoadIssue,
  } = options

  if (!isLlmBotKind(selectedBotKind)) return null
  if (isLoadingProviders) {
    return 'Available LLM models are still loading. Try again in a moment.'
  }

  if (providerLoadIssue) return providerLoadIssue

  const provider = findLlmProviderCatalog(providers, selectedBotKind)
  const providerName = botKindDisplayName(selectedBotKind)

  if (!provider || !provider.enabled) {
    return provider?.note ?? `${providerName} is not configured for this service yet.`
  }

  if (provider.models.length === 0) {
    return provider.note ?? `No ${providerName} models are currently available.`
  }

  if (!selectedBotModel) {
    return `Choose ${botKindWithArticle(selectedBotKind)} model before starting a new match.`
  }

  if (!provider.models.some((model) => model.id === selectedBotModel)) {
    return `${selectedBotModel} is no longer available for ${providerName}. Choose another model before starting a new match.`
  }

  return null
}

export function validateLlmBotSelection(options: {
  botKind?: BotKind
  botModel?: string | null
  providers: LlmProviderCatalog[]
}): LlmSelectionValidationResult | null {
  const { botKind, botModel, providers } = options
  if (!isLlmBotKind(botKind)) return null

  const provider = findLlmProviderCatalog(providers, botKind)
  const providerName = botKindDisplayName(botKind)

  if (!provider || !provider.enabled) {
    return {
      status: 409,
      code: 'BOT_PROVIDER_UNAVAILABLE',
      message: provider?.note ?? `${providerName} is not configured for this service yet.`,
    }
  }

  if (provider.models.length === 0) {
    return {
      status: 409,
      code: 'BOT_PROVIDER_UNAVAILABLE',
      message: provider.note ?? `No ${providerName} models are currently available.`,
    }
  }

  if (!botModel) {
    return {
      status: 400,
      code: 'BOT_MODEL_REQUIRED',
      message: `Choose ${botKindWithArticle(botKind)} model before starting a new match.`,
    }
  }

  if (!provider.models.some((model) => model.id === botModel)) {
    return {
      status: 409,
      code: 'BOT_MODEL_UNAVAILABLE',
      message: `${botModel} is no longer available for ${providerName}. Choose another model before starting a new match.`,
    }
  }

  return null
}
