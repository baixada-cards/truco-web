import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BOT_KIND_OPTIONS,
  getLlmSelectionIssue,
  isBotKind,
  isBotProfile,
  isDealerChoice,
  isLlmBotKind,
  resolvePreferredLlmModel,
  validateLlmBotSelection,
} from './live-bot-selection.ts'
import {
  persistLiveMatchSetupPreferences,
  readLiveMatchSetupPreferences,
  sanitizeLiveMatchSetupPreferences,
} from './live-match-setup-preferences.ts'

type StorageStub = {
  length: number
  key: (index: number) => string | null
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

function createLocalStorageStub() {
  const values = new Map<string, string>()

  const storage: StorageStub = {
    get length() {
      return values.size
    },
    key: (index) => Array.from(values.keys())[index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    clear: () => {
      values.clear()
    },
  }

  return { storage }
}

function withWindow<T>(storage: StorageStub, run: () => T): T {
  const runtime = globalThis as unknown as {
    window?: {
      localStorage: StorageStub
    }
  }
  const previousWindow = runtime.window
  runtime.window = { localStorage: storage }

  try {
    return run()
  } finally {
    if (previousWindow === undefined) {
      runtime.window = undefined
    } else {
      runtime.window = previousWindow
    }
  }
}

test('openrouter is a recognized LLM bot kind and appears in the picker options', () => {
  assert.equal(isBotKind('openrouter'), true)
  assert.equal(isLlmBotKind('openrouter'), true)
  assert.equal(isLlmBotKind('heuristic'), false)
  assert.ok(BOT_KIND_OPTIONS.includes('openrouter'))
  // OpenRouter leads the LLM options as the shared-key + BYOK path.
  const llmOptions = BOT_KIND_OPTIONS.filter((k) => isLlmBotKind(k))
  assert.equal(llmOptions[0], 'openrouter')
})

test('solver is a recognized non-LLM bot kind listed before the LLM options', () => {
  assert.equal(isBotKind('solver'), true)
  assert.equal(isLlmBotKind('solver'), false)
  assert.ok(BOT_KIND_OPTIONS.includes('solver'))
  // The solver sits between the local heuristic bots and the LLM providers.
  const solverIndex = BOT_KIND_OPTIONS.indexOf('solver')
  const firstLlmIndex = BOT_KIND_OPTIONS.findIndex((k) => isLlmBotKind(k))
  assert.ok(solverIndex >= 0 && solverIndex < firstLlmIndex)
  assert.ok(solverIndex > BOT_KIND_OPTIONS.indexOf('heuristic'))
})

test('server-side validation runs for an openrouter selection', () => {
  const issue = validateLlmBotSelection({
    botKind: 'openrouter',
    botModel: undefined,
    providers: [
      { provider: 'openrouter', enabled: true, models: [{ id: 'x-ai/grok-2' }] },
    ],
  })
  // no model chosen against an enabled provider -> must be asked to pick one
  assert.ok(issue)
  assert.equal(issue?.code, 'BOT_MODEL_REQUIRED')
})

test('heuristic play is not blocked when the provider catalog is unavailable', () => {
  const selectionIssue = getLlmSelectionIssue({
    selectedBotKind: 'heuristic',
    selectedBotModel: '',
    providers: [],
    isLoadingProviders: false,
    providerLoadIssue: 'The app could not load the LLM provider catalog.',
  })

  assert.equal(selectionIssue, null)
})

test('LLM play requires a selected model when the provider is available', () => {
  const selectionIssue = getLlmSelectionIssue({
    selectedBotKind: 'openai',
    selectedBotModel: '',
    providers: [
      {
        provider: 'openai',
        enabled: true,
        default_model: null,
        models: [{ id: 'gpt-4.1-mini' }],
        note: 'OpenAI is available.',
      },
    ],
    isLoadingProviders: false,
    providerLoadIssue: null,
  })

  assert.equal(selectionIssue, 'Choose an OpenAI model before starting a new match.')
})

test('preferred model keeps valid selections and falls back to the provider default', () => {
  const provider = {
    provider: 'anthropic' as const,
    enabled: true,
    default_model: 'claude-3-5-haiku-latest',
    models: [
      { id: 'claude-3-5-haiku-latest' },
      { id: 'claude-3-7-sonnet-latest' },
    ],
    note: null,
  }

  assert.equal(
    resolvePreferredLlmModel(provider, 'claude-3-7-sonnet-latest'),
    'claude-3-7-sonnet-latest',
  )
  assert.equal(
    resolvePreferredLlmModel(provider, ''),
    'claude-3-5-haiku-latest',
  )
})

test('server-side validation rejects unavailable providers before creating a match', () => {
  const validationIssue = validateLlmBotSelection({
    botKind: 'anthropic',
    botModel: 'claude-3-5-haiku-latest',
    providers: [
      {
        provider: 'anthropic',
        enabled: false,
        default_model: null,
        models: [],
        note: 'Anthropic credentials are not configured on this service.',
      },
    ],
  })

  assert.deepEqual(validationIssue, {
    status: 409,
    code: 'BOT_PROVIDER_UNAVAILABLE',
    message: 'Anthropic credentials are not configured on this service.',
  })
})

test('bot setup validators accept known persisted choices only', () => {
  assert.equal(isBotKind('heuristic'), true)
  assert.equal(isBotKind('botnet'), false)
  assert.equal(isBotProfile('tricky'), true)
  assert.equal(isBotProfile('reckless'), false)
  assert.equal(isDealerChoice(1), true)
  assert.equal(isDealerChoice('1'), false)
})

test('match setup preferences sanitize invalid storage values', () => {
  assert.deepEqual(
    sanitizeLiveMatchSetupPreferences({
      selectedBotKind: 'botnet',
      selectedBotProfile: 'reckless',
      selectedBotModel: 42,
      newMatchDealerChoice: '1',
    }),
    {
      selectedBotKind: 'heuristic',
      selectedBotProfile: 'balanced',
      selectedBotModel: '',
      newMatchDealerChoice: 'random',
    },
  )
})

test('match setup preferences persist selected bot and dealer values', () => {
  const { storage } = createLocalStorageStub()

  withWindow(storage, () => {
    persistLiveMatchSetupPreferences({
      selectedBotKind: 'openai',
      selectedBotProfile: 'tricky',
      selectedBotModel: 'gpt-4.1-mini',
      newMatchDealerChoice: 1,
    })

    assert.deepEqual(readLiveMatchSetupPreferences(), {
      selectedBotKind: 'openai',
      selectedBotProfile: 'tricky',
      selectedBotModel: 'gpt-4.1-mini',
      newMatchDealerChoice: 1,
    })
  })
})
