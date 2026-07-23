export type LiveShortcutAction =
  | 'play_card_1'
  | 'play_card_2'
  | 'play_card_3'
  | 'hide_card_1'
  | 'hide_card_2'
  | 'hide_card_3'
  | 'raise_stake'
  | 'accept_raise'
  | 'decline_raise'
  | 'toggle_strength_guide'

export type LiveShortcutMap = Record<LiveShortcutAction, string>

export const DEFAULT_LIVE_SHORTCUTS: LiveShortcutMap = {
  play_card_1: '1',
  play_card_2: '2',
  play_card_3: '3',
  hide_card_1: 'A',
  hide_card_2: 'S',
  hide_card_3: 'D',
  raise_stake: 'Q',
  accept_raise: 'W',
  decline_raise: 'E',
  toggle_strength_guide: 'Tab',
}

const PREVIOUS_SOUND_POLISH_DEFAULTS: Omit<LiveShortcutMap, 'toggle_strength_guide'> = {
  play_card_1: '1',
  play_card_2: '2',
  play_card_3: '3',
  hide_card_1: 'Shift+1',
  hide_card_2: 'Shift+2',
  hide_card_3: 'Shift+3',
  raise_stake: 'Q',
  accept_raise: 'W',
  decline_raise: 'E',
}
const PREVIOUS_SOUND_POLISH_ACTIONS = Object.keys(PREVIOUS_SOUND_POLISH_DEFAULTS) as Array<keyof typeof PREVIOUS_SOUND_POLISH_DEFAULTS>

const LEGACY_DEFAULT_SHORTCUTS: Pick<
  LiveShortcutMap,
  'raise_stake' | 'accept_raise' | 'decline_raise'
> = {
  raise_stake: 'T',
  accept_raise: 'A',
  decline_raise: 'D',
}

export const LIVE_SHORTCUT_ACTIONS: LiveShortcutAction[] = [
  'play_card_1',
  'play_card_2',
  'play_card_3',
  'hide_card_1',
  'hide_card_2',
  'hide_card_3',
  'raise_stake',
  'accept_raise',
  'decline_raise',
  'toggle_strength_guide',
]

export const LIVE_SHORTCUT_LABELS: Record<LiveShortcutAction, string> = {
  play_card_1: 'Play Your Card 1',
  play_card_2: 'Play Your Card 2',
  play_card_3: 'Play Your Card 3',
  hide_card_1: 'Hide Your Card 1',
  hide_card_2: 'Hide Your Card 2',
  hide_card_3: 'Hide Your Card 3',
  raise_stake: 'Raise Stake',
  accept_raise: 'Accept',
  decline_raise: 'Fold / Decline',
  toggle_strength_guide: 'Toggle Manilhas Guide',
}

function canonicalizeShortcutToken(token: string) {
  if (token === ' ') return 'Space'
  if (token.length === 1) return token.toUpperCase()
  return token
}

export function buildDefaultLiveShortcutMap(): LiveShortcutMap {
  return { ...DEFAULT_LIVE_SHORTCUTS }
}

export function normalizeLiveShortcutKey(key: string) {
  return key
    .split('+')
    .map((token) => canonicalizeShortcutToken(token.trim()))
    .filter(Boolean)
    .join('+')
}

function getShortcutBaseKey(key: string, code?: string) {
  if (key === ' ') return 'Space'
  if (code?.startsWith('Digit')) return code.slice(5)
  if (code?.startsWith('Key')) return code.slice(3).toUpperCase()
  if (key.length === 1) return key.toUpperCase()
  return key
}

export function getLiveShortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>,
) {
  const baseKey = getShortcutBaseKey(event.key, event.code)
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(baseKey)) return null

  const modifiers: string[] = []
  if (event.shiftKey) modifiers.push('Shift')

  return normalizeLiveShortcutKey([...modifiers, baseKey].join('+'))
}

export function sanitizeLiveShortcutMap(value: unknown): LiveShortcutMap {
  const defaults = buildDefaultLiveShortcutMap()
  const shortcutSource = value && typeof value === 'object' ? (value as Partial<LiveShortcutMap>) : {}
  const hasStoredStrengthGuideShortcut = typeof shortcutSource.toggle_strength_guide === 'string'

  const looksLikeLegacyShortcutDefaults =
    shortcutSource.raise_stake === LEGACY_DEFAULT_SHORTCUTS.raise_stake &&
    shortcutSource.accept_raise === LEGACY_DEFAULT_SHORTCUTS.accept_raise &&
    shortcutSource.decline_raise === LEGACY_DEFAULT_SHORTCUTS.decline_raise &&
    typeof shortcutSource.hide_card_1 !== 'string' &&
    typeof shortcutSource.hide_card_2 !== 'string' &&
    typeof shortcutSource.hide_card_3 !== 'string'

  const nextShortcuts = {
    ...defaults,
    ...Object.fromEntries(
      LIVE_SHORTCUT_ACTIONS.map((action) => {
        const rawValue = shortcutSource[action]
        return [
          action,
          typeof rawValue === 'string' ? normalizeLiveShortcutKey(rawValue) : defaults[action],
        ]
      }),
    ),
  } as LiveShortcutMap

  const looksLikePreviousSoundPolishDefaults = PREVIOUS_SOUND_POLISH_ACTIONS.every((action) => {
    const rawValue = shortcutSource[action]
    return typeof rawValue === 'string' && normalizeLiveShortcutKey(rawValue) === PREVIOUS_SOUND_POLISH_DEFAULTS[action]
  })

  if (!hasStoredStrengthGuideShortcut) {
    const tabIsAlreadyAssigned = LIVE_SHORTCUT_ACTIONS.some((action) => (
      action !== 'toggle_strength_guide' &&
      nextShortcuts[action] === defaults.toggle_strength_guide
    ))

    if (tabIsAlreadyAssigned) {
      nextShortcuts.toggle_strength_guide = ''
    }
  }

  if (looksLikeLegacyShortcutDefaults) {
    nextShortcuts.raise_stake = defaults.raise_stake
    nextShortcuts.accept_raise = defaults.accept_raise
    nextShortcuts.decline_raise = defaults.decline_raise
  }

  if (looksLikePreviousSoundPolishDefaults) {
    nextShortcuts.hide_card_1 = defaults.hide_card_1
    nextShortcuts.hide_card_2 = defaults.hide_card_2
    nextShortcuts.hide_card_3 = defaults.hide_card_3
  }

  return nextShortcuts
}

export function assignLiveShortcut(
  shortcuts: LiveShortcutMap,
  action: LiveShortcutAction,
  key: string | null,
) {
  const nextShortcuts = { ...shortcuts }

  if (!key) {
    nextShortcuts[action] = ''
    return nextShortcuts
  }

  const normalizedKey = normalizeLiveShortcutKey(key)

  for (const shortcutAction of LIVE_SHORTCUT_ACTIONS) {
    if (shortcutAction !== action && nextShortcuts[shortcutAction] === normalizedKey) {
      nextShortcuts[shortcutAction] = ''
    }
  }

  nextShortcuts[action] = normalizedKey
  return nextShortcuts
}

export function getLiveShortcutAction(shortcuts: LiveShortcutMap, key: string) {
  const normalizedKey = normalizeLiveShortcutKey(key)
  return LIVE_SHORTCUT_ACTIONS.find((action) => shortcuts[action] === normalizedKey) ?? null
}
