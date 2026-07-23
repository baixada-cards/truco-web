import { useCallback, useEffect, useRef } from 'react'

import { SCORE_TALLY_STROKE_GAP_MS } from './live-score-sound.ts'

const STAKE_LEVELS = [1, 3, 6, 9, 12] as const

export const SOUND_CUES = [
  'ui_click',
  'deal',
  'card_play',
  'card_hide',
  'raise',
  'accept',
  'decline',
  'soft_fold',
  'score',
  'eleven_entry',
  'eleven_focus',
  'eleven_duel',
  'hand_transition',
  'match_win',
  'match_lose',
] as const

export type SoundCue = (typeof SOUND_CUES)[number]

const SOUND_CUE_IDS = new Set<string>(SOUND_CUES)

export function isSoundCue(value: unknown): value is SoundCue {
  return typeof value === 'string' && SOUND_CUE_IDS.has(value)
}

export const TABLE_SOUND_THEME_DEFINITION = {
  summary: 'System-wide ruleset for shaping table cues into a shared audio identity.',
  dimensions: [
    'instrument family',
    'envelope shape',
    'harmonic color',
    'motion contour',
    'win-loss cadence',
  ],
} as const

type ThemeRenderStyle =
  | 'tablao'
  | 'haze'
  | 'neon'
  | 'salon'
  | 'ghost'
  | 'rail'
  | 'velvet'
  | 'arena'
  | 'signal'
  | 'dusty'
  | 'sample-a'
  | 'sample-b'

type ThemeTone = {
  id: string
  label: string
  tagline: string
  instrument: string
  motion: string
  renderStyle: ThemeRenderStyle
  pitchOffset: number
  brightness: number
  gainScale: number
}

const TABLE_SOUND_THEME_CATALOG = [
  {
    id: 'farol-felt-a',
    label: 'Farol',
    tagline: 'Legacy card slides, paid hide-card flip, table-slap raises, and a quieter hand-bell accept.',
    instrument: 'Freesound card slide and wood clicks with Pro Sound Effects hide/raise/decline foley.',
    motion: 'Short, close-mic foley with a clean tabletop snap.',
    renderStyle: 'sample-a',
    pitchOffset: 0,
    brightness: 1,
    gainScale: 0.82,
  },
] as const satisfies readonly ThemeTone[]

export type SoundThemeId = (typeof TABLE_SOUND_THEME_CATALOG)[number]['id']
export type TableSoundTheme = (typeof TABLE_SOUND_THEME_CATALOG)[number]

export const TABLE_SOUND_THEMES: readonly TableSoundTheme[] = TABLE_SOUND_THEME_CATALOG
export const DEFAULT_SOUND_THEME_ID: SoundThemeId = 'farol-felt-a'

export const SOUND_THEME_REEL: ReadonlyArray<{ cue: SoundCue; stake?: number; delayMs: number }> = [
  { cue: 'ui_click', delayMs: 0 },
  { cue: 'deal', delayMs: 180 },
  { cue: 'card_play', delayMs: 420 },
  { cue: 'card_hide', delayMs: 660 },
  { cue: 'raise', stake: 3, delayMs: 920 },
  { cue: 'raise', stake: 6, delayMs: 1280 },
  { cue: 'raise', stake: 9, delayMs: 2380 },
  { cue: 'raise', stake: 12, delayMs: 3620 },
  { cue: 'accept', stake: 6, delayMs: 5000 },
  { cue: 'decline', stake: 3, delayMs: 5540 },
  { cue: 'soft_fold', delayMs: 5900 },
  { cue: 'score', delayMs: 6280 },
  { cue: 'eleven_entry', delayMs: 6660 },
  { cue: 'eleven_focus', delayMs: 7440 },
  { cue: 'eleven_duel', delayMs: 8080 },
  { cue: 'hand_transition', delayMs: 8920 },
  { cue: 'match_win', delayMs: 9260 },
  { cue: 'match_lose', delayMs: 10080 },
] as const

type SoundPlaybackOptions = {
  stake?: number
  themeId?: SoundThemeId
  scorePoints?: number
}

type TableSoundFxOptions = {
  enabled: boolean
  volume: number
  themeId?: SoundThemeId
  fastMode?: boolean
}

type VoiceOptions = {
  duration?: number
  detune?: number
  brightness?: number
}

type NoiseBurstOptions = {
  duration?: number
  attack?: number
  filterType?: BiquadFilterType
  filterFrequency?: number
  endFilterFrequency?: number
  q?: number
}

type SampleRenderStyle = Extract<ThemeRenderStyle, 'sample-a' | 'sample-b'>

type SampleLayerVariation = {
  delay?: number
  filterFrequency?: number
  gain?: number
  offset?: number
  playbackRate?: number
}

type SampleLayer = {
  src: string
  gain: number
  delay?: number
  minStake?: number
  maxStake?: number
  normalize?: boolean
  offset?: number
  duration?: number
  playbackRate?: number
  filterType?: BiquadFilterType
  filterFrequency?: number
  q?: number
  skipInFastMode?: boolean
  variation?: SampleLayerVariation
}

type TallyStrokeSegment = {
  name: string
  offset: number
  duration: number
}

type TallyStrokeConfig = {
  source: string
  sourcePage: string
  license: string
  sourceTrim: readonly [number, number]
  sequenceGapMs: number
  gain: number
  segments: readonly TallyStrokeSegment[]
  sequences: {
    plus3: readonly number[]
  }
}

type TallyStrokePlanItem = {
  segmentIndex: number
  delaySeconds: number
  gain: number
  playbackRate: number
}

type WarbleOptions = VoiceOptions & {
  rateHz?: number
  depth?: number
}

type VoicePlayer = (
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) => void

function clampVolume(volume: number) {
  return Math.max(0, Math.min(1, volume))
}

function semitoneFrom(frequency: number, semitones: number) {
  return frequency * Math.pow(2, semitones / 12)
}

function scheduleTone(
  context: AudioContext,
  startAt: number,
  options: {
    frequency: number
    endFrequency?: number
    type?: OscillatorType
    duration?: number
    gain?: number
    detune?: number
    attack?: number
  },
) {
  const {
    frequency,
    endFrequency,
    type = 'triangle',
    duration = 0.08,
    gain = 0.035,
    detune = 0,
    attack = 0.01,
  } = options

  const oscillator = context.createOscillator()
  const envelope = context.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startAt)
  if (typeof endFrequency === 'number') {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(endFrequency, 1), startAt + duration)
  }
  oscillator.detune.setValueAtTime(detune, startAt)

  envelope.gain.setValueAtTime(0.0001, startAt)
  envelope.gain.linearRampToValueAtTime(gain, startAt + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  oscillator.connect(envelope)
  envelope.connect(context.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration + 0.02)
}

function schedulePianoStrike(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.16, brightness = 1, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 0.985,
    duration,
    gain: gain * 0.84,
    type: 'triangle',
    detune,
    attack: 0.004,
  })
  scheduleTone(context, startAt + 0.004, {
    frequency: frequency * 2,
    endFrequency: frequency * (1.4 + brightness * 0.12),
    duration: Math.max(0.04, duration * 0.42),
    gain: gain * 0.36 * brightness,
    type: 'sine',
    detune,
    attack: 0.003,
  })
  scheduleTone(context, startAt, {
    frequency: frequency * (2.8 + brightness * 0.35),
    endFrequency: frequency * (2 + brightness * 0.14),
    duration: Math.max(0.024, duration * 0.22),
    gain: gain * 0.18 * brightness,
    type: 'square',
    detune,
    attack: 0.003,
  })
}

function scheduleBrassVoice(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.22, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 1.01,
    duration,
    gain: gain * 0.7,
    type: 'sawtooth',
    detune,
  })
  scheduleTone(context, startAt + 0.006, {
    frequency,
    endFrequency: frequency * 0.995,
    duration: duration * 0.9,
    gain: gain * 0.34,
    type: 'triangle',
    detune: detune - 5,
    attack: 0.008,
  })
  scheduleTone(context, startAt + 0.01, {
    frequency: frequency * 2,
    endFrequency: frequency * 1.9,
    duration: duration * 0.64,
    gain: gain * 0.14,
    type: 'triangle',
    detune: detune + 4,
    attack: 0.008,
  })
}

function scheduleBellStrike(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.2, brightness = 1, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 0.998,
    duration,
    gain: gain * 0.62,
    type: 'sine',
    detune,
    attack: 0.003,
  })
  scheduleTone(context, startAt + 0.005, {
    frequency: frequency * 2.02,
    endFrequency: frequency * (1.96 + brightness * 0.04),
    duration: duration * 0.8,
    gain: gain * 0.18 * brightness,
    type: 'sine',
    detune,
    attack: 0.002,
  })
  scheduleTone(context, startAt, {
    frequency: frequency * (4.2 + brightness * 0.45),
    endFrequency: frequency * (3.3 + brightness * 0.22),
    duration: duration * 0.58,
    gain: gain * 0.12 * brightness,
    type: 'triangle',
    detune,
    attack: 0.002,
  })
}

function scheduleGlassStrike(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.18, brightness = 1, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 1.008,
    duration,
    gain: gain * 0.52,
    type: 'sine',
    detune,
    attack: 0.003,
  })
  scheduleTone(context, startAt + 0.003, {
    frequency: frequency * 2.7,
    endFrequency: frequency * (2.45 + brightness * 0.06),
    duration: duration * 0.74,
    gain: gain * 0.16 * brightness,
    type: 'sine',
    detune,
    attack: 0.002,
  })
  scheduleTone(context, startAt, {
    frequency: frequency * (5.3 + brightness * 0.4),
    endFrequency: frequency * (4.2 + brightness * 0.24),
    duration: duration * 0.48,
    gain: gain * 0.1 * brightness,
    type: 'triangle',
    detune,
    attack: 0.002,
  })
}

function scheduleChipPulse(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.1, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 1.01,
    duration,
    gain: gain * 0.8,
    type: 'square',
    detune,
    attack: 0.002,
  })
  scheduleTone(context, startAt + 0.003, {
    frequency: frequency * 2,
    endFrequency: frequency * 1.94,
    duration: duration * 0.46,
    gain: gain * 0.18,
    type: 'triangle',
    detune,
    attack: 0.002,
  })
}

function scheduleOrganPad(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.28, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency,
    duration,
    gain: gain * 0.54,
    type: 'sine',
    detune,
    attack: 0.018,
  })
  scheduleTone(context, startAt, {
    frequency: frequency * 0.5,
    endFrequency: frequency * 0.5,
    duration: duration * 1.1,
    gain: gain * 0.14,
    type: 'sawtooth',
    detune: detune - 3,
    attack: 0.02,
  })
  scheduleTone(context, startAt + 0.004, {
    frequency: frequency * 2,
    endFrequency: frequency * 1.98,
    duration: duration * 0.84,
    gain: gain * 0.14,
    type: 'triangle',
    detune,
    attack: 0.016,
  })
}

function scheduleReedStab(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.16, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 0.996,
    duration,
    gain: gain * 0.58,
    type: 'square',
    detune,
    attack: 0.007,
  })
  scheduleTone(context, startAt + 0.002, {
    frequency: frequency * 1.01,
    endFrequency: frequency * 1.002,
    duration: duration * 0.88,
    gain: gain * 0.24,
    type: 'triangle',
    detune: detune + 3,
    attack: 0.006,
  })
}

function schedulePluckStrike(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.14, brightness = 1, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 0.98,
    duration,
    gain: gain * 0.7,
    type: 'triangle',
    detune,
    attack: 0.003,
  })
  scheduleTone(context, startAt + 0.003, {
    frequency: frequency * 1.5,
    endFrequency: frequency * (1.38 + brightness * 0.05),
    duration: duration * 0.52,
    gain: gain * 0.18,
    type: 'sine',
    detune,
    attack: 0.002,
  })
}

function scheduleSubDrop(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.2, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 0.78,
    duration,
    gain: gain * 0.82,
    type: 'sine',
    detune,
    attack: 0.004,
  })
  scheduleTone(context, startAt + 0.004, {
    frequency: frequency * 0.5,
    endFrequency: frequency * 0.46,
    duration: duration * 0.88,
    gain: gain * 0.14,
    type: 'triangle',
    detune,
    attack: 0.004,
  })
}

function scheduleCalliopeStrike(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: VoiceOptions,
) {
  const { duration = 0.14, brightness = 1, detune = 0 } = options ?? {}

  scheduleTone(context, startAt, {
    frequency,
    endFrequency: frequency * 1.012,
    duration,
    gain: gain * 0.54,
    type: 'triangle',
    detune,
    attack: 0.003,
  })
  scheduleTone(context, startAt + 0.004, {
    frequency: frequency * 2,
    endFrequency: frequency * (1.9 + brightness * 0.08),
    duration: duration * 0.56,
    gain: gain * 0.18 * brightness,
    type: 'square',
    detune,
    attack: 0.002,
  })
}

function scheduleNoiseBurst(
  context: AudioContext,
  startAt: number,
  gain: number,
  options?: NoiseBurstOptions,
) {
  const {
    duration = 0.08,
    attack = 0.002,
    filterType = 'bandpass',
    filterFrequency = 1800,
    endFilterFrequency,
    q = 0.8,
  } = options ?? {}

  const frameCount = Math.max(1, Math.ceil(context.sampleRate * Math.max(duration + 0.02, 0.02)))
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / frameCount)
  }

  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const envelope = context.createGain()

  source.buffer = buffer
  filter.type = filterType
  filter.frequency.setValueAtTime(filterFrequency, startAt)
  if (typeof endFilterFrequency === 'number') {
    filter.frequency.exponentialRampToValueAtTime(Math.max(endFilterFrequency, 40), startAt + duration)
  }
  filter.Q.setValueAtTime(q, startAt)

  envelope.gain.setValueAtTime(0.0001, startAt)
  envelope.gain.linearRampToValueAtTime(gain, startAt + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(context.destination)
  source.start(startAt)
  source.stop(startAt + duration + 0.02)
}

function scheduleWarbleLead(
  context: AudioContext,
  startAt: number,
  frequency: number,
  gain: number,
  options?: WarbleOptions,
) {
  const {
    duration = 0.2,
    detune = 0,
    brightness = 1,
    rateHz = 5,
    depth = 14,
  } = options ?? {}

  const oscillator = context.createOscillator()
  const shimmer = context.createOscillator()
  const envelope = context.createGain()
  const wobble = context.createOscillator()
  const wobbleGain = context.createGain()

  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(frequency, startAt)
  oscillator.detune.setValueAtTime(detune, startAt)

  shimmer.type = 'sine'
  shimmer.frequency.setValueAtTime(frequency * (1.98 + brightness * 0.08), startAt)
  shimmer.detune.setValueAtTime(detune + 4, startAt)

  wobble.type = 'sine'
  wobble.frequency.setValueAtTime(rateHz, startAt)
  wobbleGain.gain.setValueAtTime(depth, startAt)
  wobble.connect(wobbleGain)
  wobbleGain.connect(oscillator.frequency)
  wobbleGain.connect(shimmer.frequency)

  envelope.gain.setValueAtTime(0.0001, startAt)
  envelope.gain.linearRampToValueAtTime(gain * 0.82, startAt + 0.014)
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  oscillator.connect(envelope)
  shimmer.connect(envelope)
  envelope.connect(context.destination)
  oscillator.start(startAt)
  shimmer.start(startAt + 0.002)
  wobble.start(startAt)
  oscillator.stop(startAt + duration + 0.02)
  shimmer.stop(startAt + duration * 0.82 + 0.02)
  wobble.stop(startAt + duration + 0.02)
}

function scheduleVoicedChord(
  context: AudioContext,
  startAt: number,
  frequencies: number[],
  gain: number,
  voice: VoicePlayer,
  options?: VoiceOptions & { detuneSpread?: number; stride?: number },
) {
  const {
    duration = 0.18,
    brightness = 1,
    detuneSpread = 0,
    stride = 0.004,
  } = options ?? {}

  const voiceGain = gain / Math.max(Math.sqrt(frequencies.length), 1)
  frequencies.forEach((frequency, index) => {
    voice(context, startAt + index * stride, frequency, voiceGain, {
      duration,
      brightness,
      detune:
        detuneSpread === 0
          ? 0
          : index % 2 === 0
            ? -detuneSpread
            : detuneSpread,
    })
  })
}

function isSoundThemeCandidate(value: unknown): value is SoundThemeId {
  return TABLE_SOUND_THEMES.some((theme) => theme.id === value)
}

export function isSoundThemeId(value: unknown): value is SoundThemeId {
  return isSoundThemeCandidate(value)
}

export function getTableSoundTheme(themeId: SoundThemeId | null | undefined) {
  return TABLE_SOUND_THEMES.find((theme) => theme.id === themeId) ?? TABLE_SOUND_THEMES[0]
}

function stakeTier(stake?: number) {
  return Math.max(0, STAKE_LEVELS.indexOf((stake ?? 1) as (typeof STAKE_LEVELS)[number]))
}

function themedFrequency(theme: ThemeTone, frequency: number) {
  return semitoneFrom(frequency, theme.pitchOffset)
}

function themedGain(theme: ThemeTone, volume: number, gain: number) {
  return gain * volume * theme.gainScale
}

function themedBrightness(theme: ThemeTone, brightness: number) {
  return Math.max(0.55, brightness * theme.brightness)
}

function isSampleRenderStyle(renderStyle: ThemeRenderStyle): renderStyle is SampleRenderStyle {
  return renderStyle === 'sample-a' || renderStyle === 'sample-b'
}

const FAROL_SAMPLE_AUDIO_BASE = '/audio/farol/'
const TALLY_STROKE_CONFIG_PATH = samplePath('tally-strokes-ani-music-632478.json')
const TALLY_STROKE_SEGMENT_COUNT = 3
const TALLY_STROKE_PLUS_THREE_SEQUENCE = [0, 1, 2] as const
const FALLBACK_TALLY_STROKE_CONFIG: TallyStrokeConfig = {
  source: 'tally-strokes-ani-music-632478.wav',
  sourcePage: 'https://freesound.org/people/ani_music/sounds/632478/',
  license: 'CC0',
  sourceTrim: [0.03, 0.748],
  sequenceGapMs: SCORE_TALLY_STROKE_GAP_MS,
  gain: 0.72,
  segments: [
    { name: 'tally-scratch-1', offset: 0.03, duration: 0.2424 },
    { name: 'tally-scratch-2', offset: 0.2724, duration: 0.2424 },
    { name: 'tally-scratch-3', offset: 0.5148, duration: 0.2332 },
  ],
  sequences: {
    plus3: TALLY_STROKE_PLUS_THREE_SEQUENCE,
  },
}
const TALLY_STROKE_LAYER_GAIN = 0.17
let tallyStrokeConfigPromise: Promise<TallyStrokeConfig> | null = null
const TALLY_STROKE_VARIATIONS = [
  { playbackRate: 0.98, gain: 1 },
  { playbackRate: 1.02, gain: 1.02 },
  { playbackRate: 1, gain: 1.1 },
  { playbackRate: 1.036, gain: 0.98 },
  { playbackRate: 0.965, gain: 1.04 },
] as const

function samplePath(fileName: string) {
  return `${FAROL_SAMPLE_AUDIO_BASE}${fileName}`
}

function sampleConfigPath(fileName: string) {
  return fileName.startsWith('/') ? fileName : samplePath(fileName)
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function safeInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : fallback
}

function sanitizeTallyStrokeSequence(value: unknown, fallback: readonly number[]) {
  if (!Array.isArray(value)) return fallback

  const sequence = value
    .slice(0, 12)
    .map((item) => safeInteger(item, -1))
    .filter((item) => item >= 0 && item < TALLY_STROKE_SEGMENT_COUNT)

  return sequence.length > 0 ? sequence : fallback
}

function sanitizeTallyStrokeConfig(candidate: unknown): TallyStrokeConfig {
  const source = typeof (candidate as TallyStrokeConfig | null)?.source === 'string'
    ? (candidate as TallyStrokeConfig).source
    : FALLBACK_TALLY_STROKE_CONFIG.source
  const rawSegments = Array.isArray((candidate as TallyStrokeConfig | null)?.segments)
    ? (candidate as TallyStrokeConfig).segments
    : FALLBACK_TALLY_STROKE_CONFIG.segments
  const segments = rawSegments
    .slice(0, 3)
    .map((rawSegment, index) => {
      const segment = rawSegment && typeof rawSegment === 'object'
        ? rawSegment as Partial<TallyStrokeSegment>
        : {}

      return {
        name: typeof segment.name === 'string'
          ? segment.name
        : `tally-scratch-${index + 1}`,
        offset: clampNumber(segment.offset, FALLBACK_TALLY_STROKE_CONFIG.segments[index]?.offset ?? 0, 0, 10),
        duration: clampNumber(segment.duration, FALLBACK_TALLY_STROKE_CONFIG.segments[index]?.duration ?? 0.18, 0.018, 2),
      }
    })

  const rawSequences = (candidate as Partial<TallyStrokeConfig> | null)?.sequences

  return {
    source,
    sourcePage: FALLBACK_TALLY_STROKE_CONFIG.sourcePage,
    license: FALLBACK_TALLY_STROKE_CONFIG.license,
    sourceTrim: FALLBACK_TALLY_STROKE_CONFIG.sourceTrim,
    sequenceGapMs: clampNumber(
      (candidate as TallyStrokeConfig | null)?.sequenceGapMs,
      FALLBACK_TALLY_STROKE_CONFIG.sequenceGapMs,
      40,
      240,
    ),
    gain: clampNumber(
      (candidate as TallyStrokeConfig | null)?.gain,
      FALLBACK_TALLY_STROKE_CONFIG.gain,
      0,
      1,
    ),
    segments: segments.length === 3 ? segments : FALLBACK_TALLY_STROKE_CONFIG.segments,
    sequences: {
      plus3: sanitizeTallyStrokeSequence(
        rawSequences?.plus3,
        FALLBACK_TALLY_STROKE_CONFIG.sequences.plus3,
      ),
    },
  }
}

async function loadTallyStrokeConfig() {
  try {
    const response = await fetch(TALLY_STROKE_CONFIG_PATH, { cache: 'no-store' })
    if (!response.ok) return FALLBACK_TALLY_STROKE_CONFIG
    return sanitizeTallyStrokeConfig(await response.json())
  } catch {
    return FALLBACK_TALLY_STROKE_CONFIG
  }
}

function getTallyStrokeConfig() {
  tallyStrokeConfigPromise ??= loadTallyStrokeConfig()
  return tallyStrokeConfigPromise
}

export function resolveTallyStrokePlan(
  scorePoints = 1,
  sequenceGapMs = FALLBACK_TALLY_STROKE_CONFIG.sequenceGapMs,
  sequence: readonly number[] = FALLBACK_TALLY_STROKE_CONFIG.sequences.plus3,
): readonly TallyStrokePlanItem[] {
  const strokeCount = Math.min(12, Math.max(1, safeInteger(scorePoints, 1)))
  const gapSeconds = clampNumber(sequenceGapMs, FALLBACK_TALLY_STROKE_CONFIG.sequenceGapMs, 40, 240) / 1000
  const segmentSequence = sequence.length > 0 ? sequence : FALLBACK_TALLY_STROKE_CONFIG.sequences.plus3

  return Array.from({ length: strokeCount }, (_, index) => {
    const variation = TALLY_STROKE_VARIATIONS[index % TALLY_STROKE_VARIATIONS.length]
    return {
      segmentIndex: segmentSequence[index % segmentSequence.length] ?? (index % TALLY_STROKE_SEGMENT_COUNT),
      delaySeconds: index * gapSeconds,
      gain: variation.gain,
      playbackRate: variation.playbackRate,
    }
  })
}

const SAMPLE_CUE_TARGET_RMS: Record<SoundCue, number> = {
  ui_click: 0.045,
  deal: 0.06,
  card_play: 0.065,
  card_hide: 0.055,
  raise: 0.13,
  accept: 0.045,
  decline: 0.06,
  soft_fold: 0.038,
  score: 0.055,
  eleven_entry: 0.048,
  eleven_focus: 0.034,
  eleven_duel: 0.05,
  hand_transition: 0.06,
  match_win: 0.07,
  match_lose: 0.055,
}

const SAMPLE_NORMALIZE_MIN_SCALE = 0.55
const SAMPLE_NORMALIZE_MAX_SCALE = 3.6
const CARD_SLIDE_SAMPLE_VARIATION = {
  filterFrequency: 320,
  gain: 0.045,
  offset: 0.009,
  playbackRate: 0.026,
} as const satisfies SampleLayerVariation
const CARD_WOOD_CLICK_SAMPLE_VARIATION = {
  delay: 0.011,
  gain: 0.06,
  offset: 0.003,
  playbackRate: 0.032,
} as const satisfies SampleLayerVariation
const HAND_TRANSITION_SHUFFLE_SAMPLE_VARIATION = {
  gain: 0.035,
  offset: 0.004,
  playbackRate: 0.018,
} as const satisfies SampleLayerVariation

const RERAISE_LAMP_CREAK_SAMPLE = samplePath('reraise-lamp-creak-pse-gen-ys39g.m4a')
const RERAISE_LAMP_CREAK_LAYERS: ReadonlyArray<Pick<
  SampleLayer,
  'delay' | 'duration' | 'gain' | 'minStake' | 'playbackRate'
>> = [
  { delay: 0.12, gain: 0.044, duration: 0.42, minStake: 12, playbackRate: 0.94 },
]

function reraiseLampCreakLayers(gainScale = 1): readonly SampleLayer[] {
  return RERAISE_LAMP_CREAK_LAYERS.map((layer) => ({
    ...layer,
    src: RERAISE_LAMP_CREAK_SAMPLE,
    gain: layer.gain * gainScale,
    minStake: layer.minStake ?? 12,
    filterType: 'lowpass',
    filterFrequency: 2800,
    q: 0.62,
    skipInFastMode: true,
  }))
}

const FAROL_SAMPLE_CUES: Record<SampleRenderStyle, Record<SoundCue, readonly SampleLayer[]>> = {
  'sample-a': {
    ui_click: [
      { src: samplePath('wood-click-benjaminnelan-321083.mp3'), gain: 0.18, offset: 0.005, duration: 0.065 },
    ],
    deal: [
      { src: samplePath('card-slide-el-boss-571581.mp3'), gain: 0.34, offset: 0.01, duration: 0.16, filterType: 'lowpass', filterFrequency: 4100, variation: CARD_SLIDE_SAMPLE_VARIATION },
    ],
    card_play: [
      { src: samplePath('card-slide-el-boss-571581.mp3'), gain: 0.34, offset: 0.01, duration: 0.16, filterType: 'lowpass', filterFrequency: 4100, variation: CARD_SLIDE_SAMPLE_VARIATION },
      { src: samplePath('wood-click-benjaminnelan-321083.mp3'), gain: 0.07, delay: 0.105, offset: 0.005, duration: 0.055, variation: CARD_WOOD_CLICK_SAMPLE_VARIATION },
    ],
    card_hide: [
      { src: samplePath('card-hide-flip-pse-bw-bd3-ucotv.m4a'), gain: 0.24, duration: 0.42, filterType: 'lowpass', filterFrequency: 4000 },
    ],
    raise: [
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.3, maxStake: 3, duration: 0.32, filterType: 'lowpass', filterFrequency: 3400 },
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.34, minStake: 6, maxStake: 6, duration: 0.32, filterType: 'lowpass', filterFrequency: 3400 },
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.38, minStake: 9, maxStake: 9, duration: 0.32, filterType: 'lowpass', filterFrequency: 3400 },
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.44, minStake: 12, duration: 0.32, filterType: 'lowpass', filterFrequency: 3400 },
      ...reraiseLampCreakLayers(),
    ],
    accept: [
      { src: samplePath('accept-hand-bell-inspectorj-339812.m4a'), gain: 0.065, duration: 1.08, normalize: false, filterType: 'lowpass', filterFrequency: 3400, q: 0.7 },
      { src: samplePath('card-slide-el-boss-571581.mp3'), gain: 0.045, delay: 0.24, offset: 0.01, duration: 0.12, normalize: false, filterType: 'lowpass', filterFrequency: 2800 },
    ],
    decline: [
      { src: samplePath('raise-decline-card-stack-pse-bw-bd3hl-dgbny.m4a'), gain: 0.12, duration: 0.32, filterType: 'lowpass', filterFrequency: 2600 },
    ],
    soft_fold: [
      { src: samplePath('raise-decline-card-stack-pse-bw-bd3hl-dgbny.m4a'), gain: 0.072, duration: 0.44, playbackRate: 0.82, filterType: 'lowpass', filterFrequency: 1900, q: 0.68 },
    ],
    score: [
      { src: samplePath('wood-click-benjaminnelan-321083.mp3'), gain: 0.13, offset: 0.005, duration: 0.055, filterType: 'lowpass', filterFrequency: 3800 },
      { src: samplePath('wood-click-benjaminnelan-321083.mp3'), gain: 0.1, delay: 0.12, offset: 0.005, duration: 0.055, playbackRate: 1.08, filterType: 'lowpass', filterFrequency: 3600 },
    ],
    eleven_entry: [],
    eleven_focus: [],
    eleven_duel: [],
    hand_transition: [
      { src: samplePath('hand-transition-shuffle-2create-668835.wav'), gain: 0.1, duration: 0.66, filterType: 'lowpass', filterFrequency: 4200, variation: HAND_TRANSITION_SHUFFLE_SAMPLE_VARIATION },
    ],
    match_win: [
      { src: samplePath('small-bell-steffcaffrey-452371.mp3'), gain: 0.12, duration: 0.5, filterType: 'lowpass', filterFrequency: 4400 },
      { src: samplePath('small-bell-steffcaffrey-452371.mp3'), gain: 0.09, delay: 0.28, duration: 0.5, filterType: 'lowpass', filterFrequency: 4200 },
    ],
    match_lose: [
      { src: samplePath('raise-wood-table-hard-pse-kcv3-sjun9.m4a'), gain: 0.09, duration: 0.38, playbackRate: 0.78, filterType: 'lowpass', filterFrequency: 2000, q: 0.62 },
    ],
  },
  'sample-b': {
    ui_click: [
      { src: samplePath('wood-click-gameaudio-220200.mp3'), gain: 0.14, offset: 0.02, duration: 0.14, filterType: 'lowpass', filterFrequency: 4200 },
    ],
    deal: [
      { src: samplePath('card-slide-el-boss-571581.mp3'), gain: 0.34, offset: 0.01, duration: 0.16, filterType: 'lowpass', filterFrequency: 4100, variation: CARD_SLIDE_SAMPLE_VARIATION },
    ],
    card_play: [
      { src: samplePath('card-slide-el-boss-571581.mp3'), gain: 0.34, offset: 0.01, duration: 0.16, filterType: 'lowpass', filterFrequency: 4100, variation: CARD_SLIDE_SAMPLE_VARIATION },
      { src: samplePath('wood-click-benjaminnelan-321083.mp3'), gain: 0.07, delay: 0.105, offset: 0.005, duration: 0.055, variation: CARD_WOOD_CLICK_SAMPLE_VARIATION },
    ],
    card_hide: [
      { src: samplePath('paper-rustle-spaghetto87-731484.mp3'), gain: 0.13, offset: 0.38, duration: 0.58, filterType: 'lowpass', filterFrequency: 3000 },
    ],
    raise: [
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.28, maxStake: 3, duration: 0.34, playbackRate: 0.96, filterType: 'lowpass', filterFrequency: 3200 },
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.31, minStake: 6, maxStake: 6, duration: 0.34, playbackRate: 0.96, filterType: 'lowpass', filterFrequency: 3200 },
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.35, minStake: 9, maxStake: 9, duration: 0.34, playbackRate: 0.96, filterType: 'lowpass', filterFrequency: 3200 },
      { src: samplePath('raise-table-slap-firm-pse-of-g9loz.m4a'), gain: 0.4, minStake: 12, duration: 0.34, playbackRate: 0.96, filterType: 'lowpass', filterFrequency: 3200 },
      ...reraiseLampCreakLayers(0.93),
    ],
    accept: [
      { src: samplePath('accept-hand-bell-inspectorj-339812.m4a'), gain: 0.055, duration: 1.18, playbackRate: 0.96, normalize: false, filterType: 'lowpass', filterFrequency: 3200, q: 0.7 },
      { src: samplePath('card-slide-el-boss-571581.mp3'), gain: 0.045, delay: 0.24, offset: 0.01, duration: 0.12, normalize: false, filterType: 'lowpass', filterFrequency: 2800 },
    ],
    decline: [
      { src: samplePath('raise-decline-card-stack-pse-bw-bd3hl-dgbny.m4a'), gain: 0.11, duration: 0.34, playbackRate: 0.96, filterType: 'lowpass', filterFrequency: 2400 },
    ],
    soft_fold: [
      { src: samplePath('raise-decline-card-stack-pse-bw-bd3hl-dgbny.m4a'), gain: 0.066, duration: 0.46, playbackRate: 0.78, filterType: 'lowpass', filterFrequency: 1750, q: 0.66 },
    ],
    score: [
      { src: samplePath('wood-click-gameaudio-220200.mp3'), gain: 0.11, offset: 0.02, duration: 0.14, playbackRate: 0.92, filterType: 'lowpass', filterFrequency: 3200 },
      { src: samplePath('wood-click-benjaminnelan-321083.mp3'), gain: 0.07, delay: 0.12, offset: 0.005, duration: 0.055, playbackRate: 1.04 },
    ],
    eleven_entry: [],
    eleven_focus: [],
    eleven_duel: [],
    hand_transition: [
      { src: samplePath('hand-transition-shuffle-2create-668835.wav'), gain: 0.095, duration: 0.66, playbackRate: 0.98, filterType: 'lowpass', filterFrequency: 3600, variation: HAND_TRANSITION_SHUFFLE_SAMPLE_VARIATION },
    ],
    match_win: [
      { src: samplePath('accept-hand-bell-inspectorj-339812.m4a'), gain: 0.07, duration: 1.22, playbackRate: 0.94, normalize: false, filterType: 'lowpass', filterFrequency: 3400, q: 0.7 },
      { src: samplePath('wood-click-gameaudio-220200.mp3'), gain: 0.07, delay: 0.22, offset: 0.02, duration: 0.14, playbackRate: 1.04 },
    ],
    match_lose: [
      { src: samplePath('raise-decline-card-stack-pse-bw-bd3hl-dgbny.m4a'), gain: 0.09, duration: 0.36, playbackRate: 0.86, filterType: 'lowpass', filterFrequency: 2100 },
      { src: samplePath('wood-click-gameaudio-220200.mp3'), gain: 0.06, delay: 0.17, offset: 0.04, duration: 0.16, playbackRate: 0.74, filterType: 'lowpass', filterFrequency: 2000 },
    ],
  },
}

export function resolveConfiguredSampleCueSources(
  cue: SoundCue,
  options: { fastMode?: boolean; stake?: number; themeId?: SoundThemeId | null } = {},
): readonly string[] {
  const theme = getTableSoundTheme(options.themeId)
  if (!isSampleRenderStyle(theme.renderStyle)) return []

  return FAROL_SAMPLE_CUES[theme.renderStyle][cue]
    .filter((layer) => sampleLayerMatchesStake(layer, options.stake))
    .filter((layer) => sampleLayerAllowedInMode(layer, options.fastMode))
    .map((layer) => layer.src)
}

function sampleCueGain(theme: ThemeTone, volume: number, cue: SoundCue, stake: number | undefined, layerGain: number) {
  const tierScale = cue === 'raise' || cue === 'accept' || cue === 'decline'
    ? 1 + stakeTier(stake) * 0.055
    : 1
  return themedGain(theme, volume, layerGain * tierScale)
}

function sampleLayerMatchesStake(layer: SampleLayer, stake?: number) {
  const effectiveStake = stake ?? 1
  return (layer.minStake == null || effectiveStake >= layer.minStake) &&
    (layer.maxStake == null || effectiveStake <= layer.maxStake)
}

function sampleLayerAllowedInMode(layer: SampleLayer, fastMode?: boolean) {
  return !fastMode || layer.skipInFastMode !== true
}

function sampleLayerStats(buffer: AudioBuffer, layer: SampleLayer) {
  const offset = Math.min(
    Math.max(layer.offset ?? 0, 0),
    Math.max(buffer.duration - 0.01, 0),
  )
  const availableDuration = Math.max(buffer.duration - offset, 0.01)
  const duration = Math.min(
    Math.max(layer.duration ?? availableDuration, 0.018),
    availableDuration,
  )
  const startFrame = Math.max(0, Math.floor(offset * buffer.sampleRate))
  const endFrame = Math.min(buffer.length, Math.ceil((offset + duration) * buffer.sampleRate))
  let sumSquares = 0
  let peak = 0
  let count = 0

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const value = Math.abs(data[frame] ?? 0)
      peak = Math.max(peak, value)
      sumSquares += value * value
      count += 1
    }
  }

  return {
    peak,
    rms: count > 0 ? Math.sqrt(sumSquares / count) : 0,
  }
}

function normalizedSampleGain(buffer: AudioBuffer, layer: SampleLayer, cue: SoundCue, gain: number) {
  if (layer.normalize === false) return gain

  const { peak, rms } = sampleLayerStats(buffer, layer)
  if (!Number.isFinite(rms) || rms < 0.0001) return gain

  const targetRms = SAMPLE_CUE_TARGET_RMS[cue]
  const rmsScale = targetRms / rms
  const peakScale = peak > 0
    ? 0.94 / Math.max(peak * gain, 0.0001)
    : SAMPLE_NORMALIZE_MAX_SCALE
  const scale = Math.min(
    Math.max(rmsScale, SAMPLE_NORMALIZE_MIN_SCALE),
    SAMPLE_NORMALIZE_MAX_SCALE,
    peakScale,
  )

  return gain * scale
}

function randomSignedAmount(amount: number | undefined) {
  if (!amount || amount <= 0) return 0
  return (Math.random() * 2 - 1) * amount
}

function resolveSampleLayerVariation(layer: SampleLayer): SampleLayer {
  if (!layer.variation) return layer

  const nextLayer = { ...layer }
  nextLayer.delay = Math.max(0, (layer.delay ?? 0) + randomSignedAmount(layer.variation.delay))
  nextLayer.gain = Math.max(0, layer.gain * (1 + randomSignedAmount(layer.variation.gain)))
  nextLayer.offset = Math.max(0, (layer.offset ?? 0) + randomSignedAmount(layer.variation.offset))
  nextLayer.playbackRate = Math.max(
    0.5,
    (layer.playbackRate ?? 1) * (1 + randomSignedAmount(layer.variation.playbackRate)),
  )

  if (layer.filterFrequency != null && layer.variation.filterFrequency) {
    nextLayer.filterFrequency = Math.max(
      180,
      layer.filterFrequency + randomSignedAmount(layer.variation.filterFrequency),
    )
  }

  return nextLayer
}

function scheduleSampleLayer(
  context: AudioContext,
  startAt: number,
  buffer: AudioBuffer,
  layer: SampleLayer,
  gain: number,
) {
  const offset = Math.min(
    Math.max(layer.offset ?? 0, 0),
    Math.max(buffer.duration - 0.01, 0),
  )
  const availableDuration = Math.max(buffer.duration - offset, 0.01)
  const duration = Math.min(
    Math.max(layer.duration ?? availableDuration, 0.018),
    availableDuration,
  )
  const attack = Math.min(0.014, duration * 0.35)
  const release = Math.min(0.055, duration * 0.48)
  const source = context.createBufferSource()
  const envelope = context.createGain()

  source.buffer = buffer
  source.playbackRate.setValueAtTime(layer.playbackRate ?? 1, startAt)

  envelope.gain.setValueAtTime(0.0001, startAt)
  envelope.gain.linearRampToValueAtTime(gain, startAt + attack)
  envelope.gain.setValueAtTime(gain, Math.max(startAt + attack, startAt + duration - release))
  envelope.gain.linearRampToValueAtTime(0.0001, startAt + duration)

  if (layer.filterType || layer.filterFrequency) {
    const filter = context.createBiquadFilter()
    filter.type = layer.filterType ?? 'lowpass'
    filter.frequency.setValueAtTime(layer.filterFrequency ?? 4200, startAt)
    filter.Q.setValueAtTime(layer.q ?? 0.75, startAt)
    source.connect(filter)
    filter.connect(envelope)
  } else {
    source.connect(envelope)
  }

  envelope.connect(context.destination)
  source.start(startAt, offset, duration)
  source.stop(startAt + duration + 0.04)
}

function loadSampleBuffer(
  context: AudioContext,
  cache: Map<string, Promise<AudioBuffer | null>>,
  src: string,
) {
  const cached = cache.get(src)
  if (cached) return cached

  const promise = fetch(src)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load sound sample ${src}`)
      }
      return response.arrayBuffer()
    })
    .then((buffer) => context.decodeAudioData(buffer))
    .catch(() => null)

  cache.set(src, promise)
  return promise
}

function primeSampleTheme(
  context: AudioContext,
  cache: Map<string, Promise<AudioBuffer | null>>,
  theme: ThemeTone,
) {
  if (!isSampleRenderStyle(theme.renderStyle)) return

  const sources = new Set(
    Object.values(FAROL_SAMPLE_CUES[theme.renderStyle])
      .flat()
      .map((layer) => layer.src),
  )
  for (const src of sources) {
    void loadSampleBuffer(context, cache, src)
  }
  void getTallyStrokeConfig()
  void loadSampleBuffer(context, cache, samplePath(FALLBACK_TALLY_STROKE_CONFIG.source))
}

async function scheduleSampleThemeCue(
  context: AudioContext,
  cache: Map<string, Promise<AudioBuffer | null>>,
  startAt: number,
  cue: SoundCue,
  theme: ThemeTone,
  volume: number,
  options: { stake?: number; scorePoints?: number; fastMode?: boolean } = {},
) {
  if (!isSampleRenderStyle(theme.renderStyle)) return

  if (cue === 'eleven_entry' || cue === 'eleven_focus' || cue === 'eleven_duel') {
    renderElevenTensionCue(context, Math.max(context.currentTime + 0.008, startAt), cue, theme, volume)
    return
  }

  if (cue === 'score') {
    const didSchedule = await scheduleTallyStrokeScoreCue(
      context,
      cache,
      startAt,
      theme,
      volume,
      options.scorePoints,
    )
    if (didSchedule) return

    const didScheduleFallback = await scheduleFallbackScoreClickCue(
      context,
      cache,
      startAt,
      theme,
      volume,
      options.scorePoints,
    )
    if (didScheduleFallback) return
  }

  const layers = FAROL_SAMPLE_CUES[theme.renderStyle][cue]
    .filter((layer) => sampleLayerMatchesStake(layer, options.stake))
    .filter((layer) => sampleLayerAllowedInMode(layer, options.fastMode))
  if (layers.length === 0) return

  const loadedLayers = await Promise.all(
    layers.map(async (layer) => ({
      layer,
      buffer: await loadSampleBuffer(context, cache, layer.src),
    })),
  )
  const baseStartAt = Math.max(context.currentTime + 0.008, startAt)
  if (context.state === 'closed') return

  for (const { layer, buffer } of loadedLayers) {
    if (!buffer) continue

    try {
      const playbackLayer = resolveSampleLayerVariation(layer)
      scheduleSampleLayer(
        context,
        baseStartAt + (playbackLayer.delay ?? 0),
        buffer,
        playbackLayer,
        normalizedSampleGain(
          buffer,
          playbackLayer,
          cue,
          sampleCueGain(theme, volume, cue, options.stake, playbackLayer.gain),
        ),
      )
    } catch {
      return
    }
  }
}

async function scheduleTallyStrokeScoreCue(
  context: AudioContext,
  cache: Map<string, Promise<AudioBuffer | null>>,
  startAt: number,
  theme: ThemeTone,
  volume: number,
  scorePoints = 1,
) {
  const config = await getTallyStrokeConfig()
  const source = sampleConfigPath(config.source)
  const buffer = await loadSampleBuffer(context, cache, source)
  if (!buffer || config.segments.length === 0 || context.state === 'closed') return false

  const baseStartAt = Math.max(context.currentTime + 0.008, startAt)
  const plan = resolveTallyStrokePlan(scorePoints, config.sequenceGapMs, config.sequences.plus3)

  for (const step of plan) {
    const segment = config.segments[step.segmentIndex % config.segments.length]
    const layer: SampleLayer = {
      src: source,
      gain: TALLY_STROKE_LAYER_GAIN * config.gain * step.gain,
      offset: segment.offset,
      duration: segment.duration,
      playbackRate: step.playbackRate,
    }

    scheduleSampleLayer(
      context,
      baseStartAt + step.delaySeconds,
      buffer,
      layer,
      normalizedSampleGain(
        buffer,
        layer,
        'score',
        sampleCueGain(theme, volume, 'score', undefined, layer.gain),
      ),
    )
  }

  return true
}

async function scheduleFallbackScoreClickCue(
  context: AudioContext,
  cache: Map<string, Promise<AudioBuffer | null>>,
  startAt: number,
  theme: ThemeTone,
  volume: number,
  scorePoints = 1,
) {
  if (!isSampleRenderStyle(theme.renderStyle)) return false

  const baseLayer = FAROL_SAMPLE_CUES[theme.renderStyle].score[0]
  if (!baseLayer) return false

  const buffer = await loadSampleBuffer(context, cache, baseLayer.src)
  if (!buffer || context.state === 'closed') return false

  const baseStartAt = Math.max(context.currentTime + 0.008, startAt)
  const plan = resolveTallyStrokePlan(scorePoints)

  for (const step of plan) {
    const layer: SampleLayer = {
      ...baseLayer,
      delay: step.delaySeconds,
      gain: baseLayer.gain * step.gain,
      playbackRate: (baseLayer.playbackRate ?? 1) * step.playbackRate,
    }
    const playbackLayer = resolveSampleLayerVariation(layer)

    scheduleSampleLayer(
      context,
      baseStartAt + (playbackLayer.delay ?? 0),
      buffer,
      playbackLayer,
      normalizedSampleGain(
        buffer,
        playbackLayer,
        'score',
        sampleCueGain(theme, volume, 'score', undefined, playbackLayer.gain),
      ),
    )
  }

  return true
}

function renderSyntheticHandTransition(context: AudioContext, startAt: number, theme: ThemeTone, volume: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  scheduleNoiseBurst(context, startAt, gain(0.012), {
    duration: 0.24,
    filterType: 'bandpass',
    filterFrequency: 920,
    endFilterFrequency: 1850,
    q: 0.8,
  })
  scheduleNoiseBurst(context, startAt + 0.21, gain(0.008), {
    duration: 0.18,
    filterType: 'bandpass',
    filterFrequency: 1250,
    endFilterFrequency: 720,
    q: 0.95,
  })
  schedulePluckStrike(context, startAt + 0.34, freq(146.83), gain(0.012), {
    duration: 0.12,
    brightness: bright(0.72),
  })
}

function renderElevenTensionCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)
  const root = cue === 'eleven_duel' ? semitoneFrom(65.41, 3) : 65.41

  switch (cue) {
    case 'eleven_entry':
    case 'eleven_duel':
      schedulePianoStrike(context, startAt, freq(root), gain(cue === 'eleven_duel' ? 0.036 : 0.032), {
        duration: 1.85,
        brightness: bright(0.38),
      })
      scheduleOrganPad(context, startAt + 0.035, freq(root / 2), gain(0.022), {
        duration: 1.95,
      })
      schedulePluckStrike(context, startAt + 0.02, freq(root * 2), gain(0.006), {
        duration: 0.28,
        brightness: bright(0.44),
      })
      return
    case 'eleven_focus':
      scheduleNoiseBurst(context, startAt, gain(0.007), {
        duration: 0.42,
        attack: 0.025,
        filterType: 'bandpass',
        filterFrequency: 360,
        endFilterFrequency: 520,
        q: 1.8,
      })
      schedulePluckStrike(context, startAt + 0.035, freq(146.83), gain(0.008), {
        duration: 0.26,
        brightness: bright(0.42),
      })
      return
    default:
      return
  }
}

function renderTablaoCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      schedulePianoStrike(context, startAt, freq(659.25), gain(0.018), { duration: 0.08, brightness: bright(1.2) })
      schedulePianoStrike(context, startAt + 0.028, freq(783.99), gain(0.013), { duration: 0.07, brightness: bright(1.16) })
      return
    case 'deal':
      schedulePianoStrike(context, startAt, freq(116.54), gain(0.02), { duration: 0.08, brightness: bright(0.55) })
      schedulePianoStrike(context, startAt + 0.038, freq(98), gain(0.013), { duration: 0.07, brightness: bright(0.48) })
      return
    case 'card_play':
      schedulePianoStrike(context, startAt, freq(220), gain(0.034), { duration: 0.11, brightness: bright(1.18) })
      schedulePianoStrike(context, startAt + 0.012, freq(329.63), gain(0.014), { duration: 0.08, brightness: bright(1.22) })
      return
    case 'card_hide':
      schedulePianoStrike(context, startAt, freq(349.23), gain(0.022), { duration: 0.08, brightness: bright(0.95) })
      schedulePianoStrike(context, startAt + 0.028, freq(277.18), gain(0.016), { duration: 0.08, brightness: bright(0.85) })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(164.81 + tier * 26)
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 7), semitoneFrom(root, 10)], gain(0.04 + tier * 0.003), scheduleBrassVoice, { duration: 0.16, detuneSpread: 4 })
      schedulePianoStrike(context, startAt + 0.045, semitoneFrom(root, 14), gain(0.015), { duration: 0.09, brightness: bright(1.1) })
      scheduleVoicedChord(context, startAt + 0.11, [semitoneFrom(root, 2), semitoneFrom(root, 9), semitoneFrom(root, 14)], gain(0.034 + tier * 0.003), scheduleBrassVoice, { duration: 0.18, detuneSpread: 3 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(220 + tier * 34)
      schedulePianoStrike(context, startAt, root, gain(0.022 + tier * 0.0018), { duration: 0.11, brightness: bright(1.08) })
      schedulePianoStrike(context, startAt + 0.05, semitoneFrom(root, 4), gain(0.021 + tier * 0.0018), { duration: 0.11, brightness: bright(1.12) })
      schedulePianoStrike(context, startAt + 0.1, semitoneFrom(root, 11), gain(0.022 + tier * 0.0018), { duration: 0.12, brightness: bright(1.16) })
      scheduleVoicedChord(context, startAt + 0.15, [root, semitoneFrom(root, 4), semitoneFrom(root, 7), semitoneFrom(root, 11)], gain(0.05 + tier * 0.003), scheduleBrassVoice, { duration: 0.24 + tier * 0.02, detuneSpread: 4 })
      schedulePianoStrike(context, startAt + 0.21, semitoneFrom(root, 16), gain(0.018 + tier * 0.0016), { duration: 0.12, brightness: bright(1.22) })
      return
    }
    case 'decline': {
      const tier = stakeTier(stake)
      const root = freq(233.08 - tier * 12)
      schedulePianoStrike(context, startAt, semitoneFrom(root, 1), gain(0.024 + tier * 0.0016), { duration: 0.1, brightness: bright(0.95) })
      scheduleVoicedChord(context, startAt + 0.04, [root, semitoneFrom(root, 6), semitoneFrom(root, 10)], gain(0.032 + tier * 0.002), scheduleBrassVoice, { duration: 0.18 + tier * 0.015, detuneSpread: 3 })
      schedulePianoStrike(context, startAt + 0.12, semitoneFrom(root, -7), gain(0.018 + tier * 0.0014), { duration: 0.14, brightness: bright(0.72) })
      return
    }
    case 'score':
      schedulePianoStrike(context, startAt, freq(440), gain(0.022), { duration: 0.09, brightness: bright(1.2) })
      scheduleVoicedChord(context, startAt + 0.03, [freq(554.37), freq(659.25)], gain(0.028), scheduleBrassVoice, { duration: 0.14, detuneSpread: 2 })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(261.63), freq(329.63), freq(392), freq(493.88)], gain(0.058), scheduleBrassVoice, { duration: 0.26, detuneSpread: 3 })
      schedulePianoStrike(context, startAt + 0.06, freq(659.25), gain(0.024), { duration: 0.12, brightness: bright(1.2) })
      schedulePianoStrike(context, startAt + 0.12, freq(783.99), gain(0.026), { duration: 0.13, brightness: bright(1.22) })
      scheduleVoicedChord(context, startAt + 0.18, [freq(392), freq(523.25), freq(659.25), freq(783.99)], gain(0.064), scheduleBrassVoice, { duration: 0.34, detuneSpread: 4 })
      return
    case 'match_lose':
      scheduleVoicedChord(context, startAt, [freq(233.08), freq(277.18), freq(311.13)], gain(0.048), scheduleBrassVoice, { duration: 0.22, detuneSpread: 2 })
      schedulePianoStrike(context, startAt + 0.08, freq(220), gain(0.022), { duration: 0.12, brightness: bright(0.9) })
      scheduleVoicedChord(context, startAt + 0.14, [freq(174.61), freq(220), freq(261.63)], gain(0.05), scheduleBrassVoice, { duration: 0.26, detuneSpread: 2 })
      schedulePianoStrike(context, startAt + 0.24, freq(130.81), gain(0.026), { duration: 0.18, brightness: bright(0.68) })
      return
  }
}

function renderHazeCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleBellStrike(context, startAt, freq(698.46), gain(0.02), { duration: 0.12, brightness: bright(1.14) })
      scheduleWarbleLead(context, startAt + 0.042, freq(880), gain(0.012), { duration: 0.16, brightness: bright(1.18), rateHz: 6.5, depth: 18 })
      return
    case 'deal':
      scheduleOrganPad(context, startAt, freq(110), gain(0.022), { duration: 0.16 })
      scheduleNoiseBurst(context, startAt + 0.06, gain(0.009), { duration: 0.12, filterType: 'highpass', filterFrequency: 1200, endFilterFrequency: 3200, q: 0.7 })
      scheduleWarbleLead(context, startAt + 0.09, freq(164.81), gain(0.008), { duration: 0.18, brightness: bright(0.92), rateHz: 4.5, depth: 9 })
      return
    case 'card_play':
      scheduleGlassStrike(context, startAt, freq(246.94), gain(0.026), { duration: 0.12, brightness: bright(1.14) })
      scheduleWarbleLead(context, startAt + 0.035, freq(369.99), gain(0.012), { duration: 0.22, brightness: bright(1.06), rateHz: 5.5, depth: 16 })
      return
    case 'card_hide':
      scheduleBellStrike(context, startAt, freq(392), gain(0.018), { duration: 0.11, brightness: bright(0.88) })
      scheduleWarbleLead(context, startAt + 0.05, freq(293.66), gain(0.009), { duration: 0.16, brightness: bright(0.84), rateHz: 4.2, depth: 10 })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(174.61 + tier * 24)
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 7), semitoneFrom(root, 11)], gain(0.03 + tier * 0.002), scheduleOrganPad, { duration: 0.24, detuneSpread: 2 })
      scheduleGlassStrike(context, startAt + 0.11, semitoneFrom(root, 14), gain(0.014), { duration: 0.16, brightness: bright(1.2) })
      scheduleVoicedChord(context, startAt + 0.2, [semitoneFrom(root, 4), semitoneFrom(root, 9), semitoneFrom(root, 16)], gain(0.026 + tier * 0.002), scheduleBellStrike, { duration: 0.2, brightness: bright(1.08), stride: 0.014 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(220 + tier * 28)
      ;[0, 4, 9].forEach((interval, index) => {
        scheduleBellStrike(context, startAt + index * 0.07, semitoneFrom(root, interval), gain(0.016), { duration: 0.14, brightness: bright(1.06) })
      })
      scheduleVoicedChord(context, startAt + 0.21, [root, semitoneFrom(root, 4), semitoneFrom(root, 7), semitoneFrom(root, 14)], gain(0.036 + tier * 0.002), scheduleOrganPad, { duration: 0.3, detuneSpread: 2 })
      scheduleGlassStrike(context, startAt + 0.28, semitoneFrom(root, 19), gain(0.012), { duration: 0.16, brightness: bright(1.24) })
      return
    }
    case 'decline': {
      const tier = stakeTier(stake)
      const root = freq(233.08 - tier * 10)
      scheduleGlassStrike(context, startAt, semitoneFrom(root, 3), gain(0.018), { duration: 0.12, brightness: bright(0.96) })
      scheduleVoicedChord(context, startAt + 0.06, [root, semitoneFrom(root, 5), semitoneFrom(root, 9)], gain(0.024), scheduleOrganPad, { duration: 0.22 })
      scheduleSubDrop(context, startAt + 0.16, semitoneFrom(root, -7), gain(0.014), { duration: 0.18 })
      return
    }
    case 'score':
      scheduleBellStrike(context, startAt, freq(493.88), gain(0.018), { duration: 0.12, brightness: bright(1.14) })
      scheduleVoicedChord(context, startAt + 0.08, [freq(622.25), freq(739.99)], gain(0.018), scheduleGlassStrike, { duration: 0.18, brightness: bright(1.18) })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(293.66), freq(369.99), freq(440), freq(554.37)], gain(0.034), scheduleOrganPad, { duration: 0.34 })
      scheduleBellStrike(context, startAt + 0.12, freq(739.99), gain(0.016), { duration: 0.18, brightness: bright(1.22) })
      scheduleGlassStrike(context, startAt + 0.22, freq(880), gain(0.014), { duration: 0.2, brightness: bright(1.26) })
      scheduleVoicedChord(context, startAt + 0.3, [freq(440), freq(554.37), freq(739.99)], gain(0.028), scheduleBellStrike, { duration: 0.26, brightness: bright(1.16), stride: 0.012 })
      return
    case 'match_lose':
      scheduleVoicedChord(context, startAt, [freq(220), freq(277.18), freq(329.63)], gain(0.028), scheduleOrganPad, { duration: 0.24 })
      scheduleWarbleLead(context, startAt + 0.08, freq(293.66), gain(0.01), { duration: 0.18, brightness: bright(0.82), rateHz: 3.8, depth: 8 })
      scheduleSubDrop(context, startAt + 0.16, freq(164.81), gain(0.016), { duration: 0.22 })
      return
  }
}

function renderNeonCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleChipPulse(context, startAt, freq(880), gain(0.018), { duration: 0.06 })
      scheduleNoiseBurst(context, startAt + 0.004, gain(0.008), { duration: 0.03, filterType: 'bandpass', filterFrequency: 2400, endFilterFrequency: 3200, q: 1.2 })
      scheduleChipPulse(context, startAt + 0.05, freq(1174.66), gain(0.012), { duration: 0.05 })
      return
    case 'deal':
      scheduleChipPulse(context, startAt, freq(164.81), gain(0.016), { duration: 0.08 })
      scheduleChipPulse(context, startAt + 0.05, freq(146.83), gain(0.012), { duration: 0.07 })
      return
    case 'card_play':
      scheduleChipPulse(context, startAt, freq(261.63), gain(0.024), { duration: 0.08 })
      scheduleNoiseBurst(context, startAt + 0.02, gain(0.006), { duration: 0.025, filterType: 'highpass', filterFrequency: 2800, endFilterFrequency: 4200, q: 0.9 })
      scheduleChipPulse(context, startAt + 0.036, freq(392), gain(0.014), { duration: 0.06 })
      return
    case 'card_hide':
      scheduleChipPulse(context, startAt, freq(415.3), gain(0.016), { duration: 0.06 })
      scheduleChipPulse(context, startAt + 0.04, freq(311.13), gain(0.012), { duration: 0.07 })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(196 + tier * 28)
      ;[0, 4, 7, 12].forEach((interval, index) => {
        scheduleChipPulse(context, startAt + index * 0.032, semitoneFrom(root, interval), gain(0.018 + tier * 0.001), { duration: 0.06 })
      })
      scheduleSubDrop(context, startAt + 0.16, semitoneFrom(root, -12), gain(0.012), { duration: 0.12 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(246.94 + tier * 30)
      ;[0, 4, 7, 11, 14].forEach((interval, index) => {
        scheduleChipPulse(context, startAt + index * 0.028, semitoneFrom(root, interval), gain(0.016 + tier * 0.001), { duration: 0.06 })
      })
      scheduleChipPulse(context, startAt + 0.16, semitoneFrom(root, 19), gain(0.02), { duration: 0.08 })
      return
    }
    case 'decline': {
      const root = freq(392)
      ;[0, -2, -5, -9].forEach((interval, index) => {
        scheduleChipPulse(context, startAt + index * 0.05, semitoneFrom(root, interval), gain(0.016), { duration: 0.07 })
      })
      return
    }
    case 'score':
      ;[0, 4, 7].forEach((interval, index) => {
        scheduleChipPulse(context, startAt + index * 0.04, semitoneFrom(freq(523.25), interval), gain(0.016), { duration: 0.06 })
      })
      return
    case 'match_win':
      ;[0, 4, 7, 12, 16, 19].forEach((interval, index) => {
        scheduleChipPulse(context, startAt + index * 0.04, semitoneFrom(freq(293.66), interval), gain(0.018), { duration: 0.07 })
      })
      scheduleChipPulse(context, startAt + 0.28, freq(1174.66), gain(0.016), { duration: 0.1 })
      return
    case 'match_lose':
      ;[0, -2, -5, -9, -12].forEach((interval, index) => {
        scheduleChipPulse(context, startAt + index * 0.05, semitoneFrom(freq(349.23), interval), gain(0.015), { duration: 0.08 })
      })
      return
  }
}

function renderSalonCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleReedStab(context, startAt, freq(622.25), gain(0.016), { duration: 0.1 })
      schedulePianoStrike(context, startAt + 0.04, freq(739.99), gain(0.01), { duration: 0.08, brightness: bright(0.9) })
      return
    case 'deal':
      schedulePluckStrike(context, startAt, freq(103.83), gain(0.02), { duration: 0.11, brightness: bright(0.82) })
      scheduleOrganPad(context, startAt + 0.05, freq(155.56), gain(0.008), { duration: 0.18 })
      return
    case 'card_play':
      scheduleReedStab(context, startAt, freq(233.08), gain(0.022), { duration: 0.12 })
      schedulePianoStrike(context, startAt + 0.04, freq(349.23), gain(0.01), { duration: 0.09, brightness: bright(0.92) })
      return
    case 'card_hide':
      schedulePianoStrike(context, startAt, freq(329.63), gain(0.016), { duration: 0.09, brightness: bright(0.8) })
      scheduleReedStab(context, startAt + 0.05, freq(261.63), gain(0.012), { duration: 0.1 })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(155.56 + tier * 20)
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 4), semitoneFrom(root, 10)], gain(0.026 + tier * 0.002), scheduleReedStab, { duration: 0.16, detuneSpread: 2 })
      scheduleVoicedChord(context, startAt + 0.12, [semitoneFrom(root, 2), semitoneFrom(root, 7), semitoneFrom(root, 11)], gain(0.02), scheduleOrganPad, { duration: 0.24 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(196 + tier * 24)
      schedulePianoStrike(context, startAt, root, gain(0.016), { duration: 0.1, brightness: bright(0.92) })
      schedulePianoStrike(context, startAt + 0.06, semitoneFrom(root, 4), gain(0.016), { duration: 0.1, brightness: bright(0.94) })
      scheduleVoicedChord(context, startAt + 0.12, [root, semitoneFrom(root, 7), semitoneFrom(root, 10)], gain(0.024), scheduleOrganPad, { duration: 0.26 })
      return
    }
    case 'decline':
      scheduleReedStab(context, startAt, freq(246.94), gain(0.018), { duration: 0.1 })
      scheduleSubDrop(context, startAt + 0.08, freq(164.81), gain(0.012), { duration: 0.18 })
      return
    case 'score':
      schedulePianoStrike(context, startAt, freq(415.3), gain(0.018), { duration: 0.1, brightness: bright(0.96) })
      scheduleReedStab(context, startAt + 0.06, freq(554.37), gain(0.012), { duration: 0.12 })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(261.63), freq(329.63), freq(392)], gain(0.03), scheduleOrganPad, { duration: 0.3 })
      schedulePianoStrike(context, startAt + 0.1, freq(659.25), gain(0.014), { duration: 0.12, brightness: bright(1) })
      scheduleReedStab(context, startAt + 0.18, freq(493.88), gain(0.014), { duration: 0.14 })
      return
    case 'match_lose':
      scheduleVoicedChord(context, startAt, [freq(220), freq(277.18), freq(329.63)], gain(0.022), scheduleReedStab, { duration: 0.16 })
      scheduleSubDrop(context, startAt + 0.12, freq(146.83), gain(0.014), { duration: 0.22 })
      return
  }
}

function renderGhostCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleWarbleLead(context, startAt, freq(739.99), gain(0.014), { duration: 0.18, brightness: bright(1.18), rateHz: 7.5, depth: 22 })
      scheduleBellStrike(context, startAt + 0.07, freq(523.25), gain(0.01), { duration: 0.16, brightness: bright(0.82) })
      return
    case 'deal':
      scheduleNoiseBurst(context, startAt, gain(0.006), { duration: 0.11, filterType: 'bandpass', filterFrequency: 820, endFilterFrequency: 1320, q: 2.2 })
      scheduleGlassStrike(context, startAt + 0.01, freq(164.81), gain(0.014), { duration: 0.14, brightness: bright(0.88) })
      scheduleSubDrop(context, startAt + 0.06, freq(110), gain(0.01), { duration: 0.16 })
      return
    case 'card_play':
      scheduleWarbleLead(context, startAt, freq(261.63), gain(0.014), { duration: 0.2, brightness: bright(1.08), rateHz: 6.8, depth: 16 })
      scheduleBellStrike(context, startAt + 0.08, freq(415.3), gain(0.01), { duration: 0.14, brightness: bright(0.98) })
      return
    case 'card_hide':
      scheduleBellStrike(context, startAt, freq(392), gain(0.014), { duration: 0.12, brightness: bright(0.8) })
      scheduleGlassStrike(context, startAt + 0.06, freq(311.13), gain(0.012), { duration: 0.14, brightness: bright(0.84) })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(164.81 + tier * 18)
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 6), semitoneFrom(root, 11)], gain(0.022), scheduleGlassStrike, { duration: 0.18, brightness: bright(1.12), detuneSpread: 2, stride: 0.01 })
      scheduleBellStrike(context, startAt + 0.12, semitoneFrom(root, 15), gain(0.012), { duration: 0.18, brightness: bright(1.26) })
      scheduleSubDrop(context, startAt + 0.18, semitoneFrom(root, -12), gain(0.01), { duration: 0.2 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(220 + tier * 22)
      ;[0, 3, 7].forEach((interval, index) => {
        scheduleBellStrike(context, startAt + index * 0.08, semitoneFrom(root, interval), gain(0.014), { duration: 0.14, brightness: bright(1.04) })
      })
      scheduleVoicedChord(context, startAt + 0.2, [root, semitoneFrom(root, 7), semitoneFrom(root, 11)], gain(0.022), scheduleGlassStrike, { duration: 0.24, brightness: bright(1.1), stride: 0.01 })
      return
    }
    case 'decline':
      scheduleGlassStrike(context, startAt, freq(349.23), gain(0.014), { duration: 0.14, brightness: bright(0.9) })
      scheduleBellStrike(context, startAt + 0.08, freq(277.18), gain(0.01), { duration: 0.16, brightness: bright(0.74) })
      scheduleSubDrop(context, startAt + 0.14, freq(155.56), gain(0.01), { duration: 0.18 })
      return
    case 'score':
      scheduleWarbleLead(context, startAt, freq(466.16), gain(0.012), { duration: 0.18, brightness: bright(1.14), rateHz: 6.2, depth: 14 })
      scheduleGlassStrike(context, startAt + 0.08, freq(622.25), gain(0.012), { duration: 0.16, brightness: bright(1.16) })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(246.94), freq(311.13), freq(369.99)], gain(0.024), scheduleGlassStrike, { duration: 0.24, brightness: bright(1.16), stride: 0.012 })
      scheduleBellStrike(context, startAt + 0.16, freq(739.99), gain(0.012), { duration: 0.18, brightness: bright(1.24) })
      scheduleVoicedChord(context, startAt + 0.28, [freq(493.88), freq(622.25), freq(739.99)], gain(0.018), scheduleBellStrike, { duration: 0.2, brightness: bright(1.18), stride: 0.014 })
      return
    case 'match_lose':
      scheduleVoicedChord(context, startAt, [freq(220), freq(261.63), freq(311.13)], gain(0.018), scheduleGlassStrike, { duration: 0.18, brightness: bright(0.86), stride: 0.012 })
      scheduleSubDrop(context, startAt + 0.14, freq(146.83), gain(0.012), { duration: 0.2 })
      return
  }
}

function renderRailCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleChipPulse(context, startAt, freq(659.25), gain(0.012), { duration: 0.05 })
      scheduleNoiseBurst(context, startAt + 0.014, gain(0.006), { duration: 0.05, filterType: 'bandpass', filterFrequency: 900, endFilterFrequency: 1400, q: 2.4 })
      scheduleSubDrop(context, startAt + 0.03, freq(110), gain(0.01), { duration: 0.08 })
      return
    case 'deal':
      scheduleSubDrop(context, startAt, freq(98), gain(0.018), { duration: 0.12 })
      scheduleNoiseBurst(context, startAt + 0.02, gain(0.008), { duration: 0.08, filterType: 'bandpass', filterFrequency: 680, endFilterFrequency: 980, q: 2.6 })
      scheduleChipPulse(context, startAt + 0.06, freq(196), gain(0.01), { duration: 0.05 })
      return
    case 'card_play':
      scheduleSubDrop(context, startAt, freq(164.81), gain(0.016), { duration: 0.1 })
      scheduleChipPulse(context, startAt + 0.04, freq(329.63), gain(0.012), { duration: 0.05 })
      return
    case 'card_hide':
      scheduleChipPulse(context, startAt, freq(311.13), gain(0.012), { duration: 0.06 })
      scheduleSubDrop(context, startAt + 0.04, freq(130.81), gain(0.012), { duration: 0.1 })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(146.83 + tier * 18)
      ;[0, 0, 7].forEach((interval, index) => {
        scheduleSubDrop(context, startAt + index * 0.05, semitoneFrom(root, interval), gain(0.014 + tier * 0.001), { duration: 0.1 })
      })
      scheduleChipPulse(context, startAt + 0.18, semitoneFrom(root, 12), gain(0.014), { duration: 0.08 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(174.61 + tier * 20)
      scheduleSubDrop(context, startAt, root, gain(0.016), { duration: 0.1 })
      scheduleChipPulse(context, startAt + 0.06, semitoneFrom(root, 7), gain(0.012), { duration: 0.06 })
      scheduleOrganPad(context, startAt + 0.1, semitoneFrom(root, 12), gain(0.014), { duration: 0.2 })
      return
    }
    case 'decline':
      scheduleChipPulse(context, startAt, freq(277.18), gain(0.012), { duration: 0.06 })
      scheduleSubDrop(context, startAt + 0.05, freq(138.59), gain(0.014), { duration: 0.14 })
      scheduleSubDrop(context, startAt + 0.12, freq(103.83), gain(0.012), { duration: 0.16 })
      return
    case 'score':
      scheduleChipPulse(context, startAt, freq(466.16), gain(0.012), { duration: 0.05 })
      scheduleNoiseBurst(context, startAt + 0.02, gain(0.006), { duration: 0.05, filterType: 'bandpass', filterFrequency: 1200, endFilterFrequency: 1700, q: 2.2 })
      scheduleSubDrop(context, startAt + 0.04, freq(164.81), gain(0.012), { duration: 0.1 })
      return
    case 'match_win':
      scheduleSubDrop(context, startAt, freq(196), gain(0.016), { duration: 0.12 })
      ;[0, 4, 7, 12].forEach((interval, index) => {
        scheduleChipPulse(context, startAt + 0.1 + index * 0.04, semitoneFrom(freq(293.66), interval), gain(0.014), { duration: 0.06 })
      })
      scheduleOrganPad(context, startAt + 0.24, freq(392), gain(0.014), { duration: 0.24 })
      return
    case 'match_lose':
      scheduleSubDrop(context, startAt, freq(155.56), gain(0.016), { duration: 0.16 })
      scheduleSubDrop(context, startAt + 0.08, freq(116.54), gain(0.012), { duration: 0.18 })
      return
  }
}

function renderVelvetCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      schedulePluckStrike(context, startAt, freq(587.33), gain(0.016), { duration: 0.1, brightness: bright(0.94) })
      schedulePluckStrike(context, startAt + 0.04, freq(698.46), gain(0.01), { duration: 0.09, brightness: bright(0.98) })
      return
    case 'deal':
      schedulePluckStrike(context, startAt, freq(110), gain(0.018), { duration: 0.1, brightness: bright(0.76) })
      scheduleSubDrop(context, startAt + 0.05, freq(87.31), gain(0.01), { duration: 0.12 })
      return
    case 'card_play':
      schedulePluckStrike(context, startAt, freq(220), gain(0.022), { duration: 0.11, brightness: bright(1) })
      scheduleReedStab(context, startAt + 0.05, freq(329.63), gain(0.01), { duration: 0.12 })
      return
    case 'card_hide':
      schedulePluckStrike(context, startAt, freq(349.23), gain(0.014), { duration: 0.09, brightness: bright(0.82) })
      schedulePluckStrike(context, startAt + 0.045, freq(277.18), gain(0.01), { duration: 0.1, brightness: bright(0.78) })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(155.56 + tier * 18)
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 7), semitoneFrom(root, 10)], gain(0.022), schedulePluckStrike, { duration: 0.14, brightness: bright(0.94), stride: 0.014 })
      scheduleReedStab(context, startAt + 0.12, semitoneFrom(root, 14), gain(0.012), { duration: 0.12 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(196 + tier * 20)
      ;[0, 4, 7].forEach((interval, index) => {
        schedulePluckStrike(context, startAt + index * 0.06, semitoneFrom(root, interval), gain(0.014), { duration: 0.1, brightness: bright(0.96) })
      })
      scheduleVoicedChord(context, startAt + 0.16, [root, semitoneFrom(root, 7), semitoneFrom(root, 11)], gain(0.02), scheduleOrganPad, { duration: 0.22 })
      return
    }
    case 'decline':
      scheduleReedStab(context, startAt, freq(246.94), gain(0.014), { duration: 0.1 })
      schedulePluckStrike(context, startAt + 0.06, freq(196), gain(0.01), { duration: 0.1, brightness: bright(0.78) })
      return
    case 'score':
      schedulePluckStrike(context, startAt, freq(440), gain(0.016), { duration: 0.1, brightness: bright(1.02) })
      scheduleReedStab(context, startAt + 0.06, freq(554.37), gain(0.01), { duration: 0.1 })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(261.63), freq(329.63), freq(392)], gain(0.024), schedulePluckStrike, { duration: 0.16, brightness: bright(1), stride: 0.012 })
      scheduleReedStab(context, startAt + 0.14, freq(493.88), gain(0.012), { duration: 0.12 })
      scheduleOrganPad(context, startAt + 0.22, freq(392), gain(0.012), { duration: 0.24 })
      return
    case 'match_lose':
      schedulePluckStrike(context, startAt, freq(220), gain(0.014), { duration: 0.12, brightness: bright(0.82) })
      scheduleSubDrop(context, startAt + 0.09, freq(146.83), gain(0.012), { duration: 0.18 })
      return
  }
}

function renderArenaCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleCalliopeStrike(context, startAt, freq(739.99), gain(0.018), { duration: 0.08, brightness: bright(1.24) })
      scheduleCalliopeStrike(context, startAt + 0.04, freq(987.77), gain(0.012), { duration: 0.08, brightness: bright(1.3) })
      return
    case 'deal':
      schedulePianoStrike(context, startAt, freq(130.81), gain(0.02), { duration: 0.08, brightness: bright(0.62) })
      scheduleCalliopeStrike(context, startAt + 0.05, freq(196), gain(0.01), { duration: 0.08, brightness: bright(1.1) })
      return
    case 'card_play':
      scheduleCalliopeStrike(context, startAt, freq(261.63), gain(0.024), { duration: 0.09, brightness: bright(1.16) })
      schedulePianoStrike(context, startAt + 0.04, freq(392), gain(0.014), { duration: 0.08, brightness: bright(1.12) })
      return
    case 'card_hide':
      scheduleCalliopeStrike(context, startAt, freq(415.3), gain(0.016), { duration: 0.07, brightness: bright(1.06) })
      scheduleCalliopeStrike(context, startAt + 0.04, freq(329.63), gain(0.012), { duration: 0.07, brightness: bright(0.98) })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(174.61 + tier * 28)
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 4), semitoneFrom(root, 10)], gain(0.044 + tier * 0.003), scheduleBrassVoice, { duration: 0.18, detuneSpread: 4 })
      scheduleCalliopeStrike(context, startAt + 0.06, semitoneFrom(root, 16), gain(0.018), { duration: 0.1, brightness: bright(1.26) })
      scheduleVoicedChord(context, startAt + 0.14, [semitoneFrom(root, 5), semitoneFrom(root, 9), semitoneFrom(root, 14)], gain(0.036), scheduleCalliopeStrike, { duration: 0.14, brightness: bright(1.2), stride: 0.012 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(233.08 + tier * 34)
      ;[0, 4, 7, 12].forEach((interval, index) => {
        scheduleCalliopeStrike(context, startAt + index * 0.05, semitoneFrom(root, interval), gain(0.016), { duration: 0.08, brightness: bright(1.22) })
      })
      scheduleVoicedChord(context, startAt + 0.18, [root, semitoneFrom(root, 4), semitoneFrom(root, 7), semitoneFrom(root, 12)], gain(0.04), scheduleBrassVoice, { duration: 0.24, detuneSpread: 4 })
      return
    }
    case 'decline':
      scheduleBrassVoice(context, startAt, freq(246.94), gain(0.018), { duration: 0.12 })
      scheduleCalliopeStrike(context, startAt + 0.06, freq(196), gain(0.012), { duration: 0.08, brightness: bright(0.92) })
      scheduleSubDrop(context, startAt + 0.12, freq(130.81), gain(0.012), { duration: 0.16 })
      return
    case 'score':
      scheduleCalliopeStrike(context, startAt, freq(523.25), gain(0.016), { duration: 0.08, brightness: bright(1.24) })
      scheduleVoicedChord(context, startAt + 0.04, [freq(659.25), freq(783.99)], gain(0.02), scheduleBrassVoice, { duration: 0.14, detuneSpread: 2 })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(293.66), freq(392), freq(493.88), freq(587.33)], gain(0.048), scheduleBrassVoice, { duration: 0.28, detuneSpread: 4 })
      ;[0, 4, 7, 12].forEach((interval, index) => {
        scheduleCalliopeStrike(context, startAt + 0.1 + index * 0.05, semitoneFrom(freq(523.25), interval), gain(0.014), { duration: 0.08, brightness: bright(1.3) })
      })
      scheduleVoicedChord(context, startAt + 0.24, [freq(659.25), freq(783.99), freq(1046.5)], gain(0.024), scheduleCalliopeStrike, { duration: 0.14, brightness: bright(1.24), stride: 0.01 })
      return
    case 'match_lose':
      scheduleBrassVoice(context, startAt, freq(233.08), gain(0.018), { duration: 0.12 })
      scheduleSubDrop(context, startAt + 0.08, freq(155.56), gain(0.014), { duration: 0.18 })
      scheduleCalliopeStrike(context, startAt + 0.16, freq(293.66), gain(0.01), { duration: 0.08, brightness: bright(0.8) })
      return
  }
}

function renderSignalCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleNoiseBurst(context, startAt, gain(0.008), { duration: 0.035, filterType: 'highpass', filterFrequency: 2600, endFilterFrequency: 4200, q: 0.8 })
      scheduleBellStrike(context, startAt, freq(783.99), gain(0.014), { duration: 0.08, brightness: bright(1.08) })
      scheduleChipPulse(context, startAt + 0.03, freq(987.77), gain(0.012), { duration: 0.05 })
      return
    case 'deal':
      scheduleChipPulse(context, startAt, freq(146.83), gain(0.014), { duration: 0.06 })
      scheduleBellStrike(context, startAt + 0.05, freq(220), gain(0.01), { duration: 0.08, brightness: bright(0.92) })
      return
    case 'card_play':
      scheduleBellStrike(context, startAt, freq(261.63), gain(0.016), { duration: 0.08, brightness: bright(1.02) })
      scheduleChipPulse(context, startAt + 0.03, freq(392), gain(0.012), { duration: 0.05 })
      return
    case 'card_hide':
      scheduleChipPulse(context, startAt, freq(392), gain(0.012), { duration: 0.05 })
      scheduleBellStrike(context, startAt + 0.04, freq(311.13), gain(0.01), { duration: 0.08, brightness: bright(0.8) })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(174.61 + tier * 22)
      scheduleNoiseBurst(context, startAt, gain(0.01 + tier * 0.0008), { duration: 0.04, filterType: 'highpass', filterFrequency: 2200, endFilterFrequency: 3600, q: 0.9 })
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 7)], gain(0.024), scheduleBrassVoice, { duration: 0.12, detuneSpread: 2 })
      scheduleBellStrike(context, startAt + 0.06, semitoneFrom(root, 12), gain(0.012), { duration: 0.1, brightness: bright(1.14) })
      scheduleVoicedChord(context, startAt + 0.12, [semitoneFrom(root, 2), semitoneFrom(root, 9)], gain(0.02), scheduleChipPulse, { duration: 0.08, stride: 0.01 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(220 + tier * 24)
      ;[0, 4, 7].forEach((interval, index) => {
        scheduleBellStrike(context, startAt + index * 0.05, semitoneFrom(root, interval), gain(0.012), { duration: 0.08, brightness: bright(1.06) })
      })
      scheduleVoicedChord(context, startAt + 0.14, [root, semitoneFrom(root, 7)], gain(0.02), scheduleBrassVoice, { duration: 0.16, detuneSpread: 2 })
      return
    }
    case 'decline':
      scheduleChipPulse(context, startAt, freq(329.63), gain(0.012), { duration: 0.06 })
      scheduleChipPulse(context, startAt + 0.05, freq(261.63), gain(0.01), { duration: 0.06 })
      scheduleSubDrop(context, startAt + 0.1, freq(174.61), gain(0.01), { duration: 0.14 })
      return
    case 'score':
      scheduleNoiseBurst(context, startAt, gain(0.007), { duration: 0.03, filterType: 'highpass', filterFrequency: 3000, endFilterFrequency: 4800, q: 0.7 })
      scheduleBellStrike(context, startAt, freq(523.25), gain(0.012), { duration: 0.08, brightness: bright(1.1) })
      scheduleChipPulse(context, startAt + 0.04, freq(783.99), gain(0.012), { duration: 0.05 })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(293.66), freq(392), freq(587.33)], gain(0.026), scheduleBrassVoice, { duration: 0.18, detuneSpread: 3 })
      ;[0, 7, 12].forEach((interval, index) => {
        scheduleBellStrike(context, startAt + 0.08 + index * 0.05, semitoneFrom(freq(523.25), interval), gain(0.012), { duration: 0.08, brightness: bright(1.18) })
      })
      return
    case 'match_lose':
      scheduleVoicedChord(context, startAt, [freq(220), freq(293.66)], gain(0.016), scheduleChipPulse, { duration: 0.07, stride: 0.01 })
      scheduleSubDrop(context, startAt + 0.08, freq(146.83), gain(0.012), { duration: 0.16 })
      return
  }
}

function renderDustyCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  const gain = (value: number) => themedGain(theme, volume, value)
  const freq = (value: number) => themedFrequency(theme, value)
  const bright = (value: number) => themedBrightness(theme, value)

  switch (cue) {
    case 'ui_click':
      scheduleNoiseBurst(context, startAt, gain(0.006), { duration: 0.04, filterType: 'lowpass', filterFrequency: 900, endFilterFrequency: 480, q: 0.5 })
      schedulePluckStrike(context, startAt, freq(554.37), gain(0.014), { duration: 0.08, brightness: bright(0.74) })
      schedulePluckStrike(context, startAt + 0.035, freq(659.25), gain(0.01), { duration: 0.08, brightness: bright(0.78) })
      return
    case 'deal':
      scheduleNoiseBurst(context, startAt, gain(0.012), { duration: 0.06, filterType: 'lowpass', filterFrequency: 760, endFilterFrequency: 320, q: 0.6 })
      schedulePluckStrike(context, startAt, freq(98), gain(0.018), { duration: 0.08, brightness: bright(0.64) })
      scheduleSubDrop(context, startAt + 0.04, freq(73.42), gain(0.01), { duration: 0.1 })
      return
    case 'card_play':
      scheduleNoiseBurst(context, startAt + 0.008, gain(0.008), { duration: 0.05, filterType: 'bandpass', filterFrequency: 720, endFilterFrequency: 520, q: 1.1 })
      schedulePluckStrike(context, startAt, freq(196), gain(0.022), { duration: 0.09, brightness: bright(0.88) })
      schedulePluckStrike(context, startAt + 0.04, freq(293.66), gain(0.01), { duration: 0.08, brightness: bright(0.92) })
      return
    case 'card_hide':
      schedulePluckStrike(context, startAt, freq(311.13), gain(0.014), { duration: 0.08, brightness: bright(0.72) })
      schedulePluckStrike(context, startAt + 0.04, freq(246.94), gain(0.01), { duration: 0.08, brightness: bright(0.68) })
      return
    case 'raise': {
      const tier = stakeTier(stake)
      const root = freq(146.83 + tier * 18)
      scheduleVoicedChord(context, startAt, [root, semitoneFrom(root, 7), semitoneFrom(root, 10)], gain(0.018), schedulePluckStrike, { duration: 0.1, brightness: bright(0.86), stride: 0.016 })
      scheduleSubDrop(context, startAt + 0.12, root / 2, gain(0.01), { duration: 0.12 })
      return
    }
    case 'accept': {
      const tier = stakeTier(stake)
      const root = freq(185 + tier * 20)
      ;[0, 4, 7].forEach((interval, index) => {
        schedulePluckStrike(context, startAt + index * 0.05, semitoneFrom(root, interval), gain(0.012), { duration: 0.08, brightness: bright(0.86) })
      })
      schedulePluckStrike(context, startAt + 0.16, semitoneFrom(root, 12), gain(0.014), { duration: 0.1, brightness: bright(0.92) })
      return
    }
    case 'decline':
      schedulePluckStrike(context, startAt, freq(277.18), gain(0.012), { duration: 0.08, brightness: bright(0.74) })
      scheduleSubDrop(context, startAt + 0.06, freq(138.59), gain(0.01), { duration: 0.14 })
      return
    case 'score':
      scheduleNoiseBurst(context, startAt, gain(0.007), { duration: 0.04, filterType: 'lowpass', filterFrequency: 1100, endFilterFrequency: 640, q: 0.7 })
      schedulePluckStrike(context, startAt, freq(392), gain(0.014), { duration: 0.08, brightness: bright(0.92) })
      schedulePluckStrike(context, startAt + 0.04, freq(523.25), gain(0.01), { duration: 0.08, brightness: bright(0.96) })
      return
    case 'match_win':
      scheduleVoicedChord(context, startAt, [freq(246.94), freq(311.13), freq(392)], gain(0.02), schedulePluckStrike, { duration: 0.12, brightness: bright(0.94), stride: 0.014 })
      schedulePluckStrike(context, startAt + 0.16, freq(659.25), gain(0.012), { duration: 0.1, brightness: bright(1.04) })
      return
    case 'match_lose':
      schedulePluckStrike(context, startAt, freq(220), gain(0.012), { duration: 0.1, brightness: bright(0.72) })
      scheduleSubDrop(context, startAt + 0.08, freq(130.81), gain(0.012), { duration: 0.16 })
      return
  }
}

function scheduleThemeCue(context: AudioContext, startAt: number, cue: SoundCue, theme: ThemeTone, volume: number, stake?: number) {
  if (cue === 'hand_transition') {
    renderSyntheticHandTransition(context, startAt, theme, volume)
    return
  }

  if (cue === 'eleven_entry' || cue === 'eleven_focus' || cue === 'eleven_duel') {
    renderElevenTensionCue(context, startAt, cue, theme, volume)
    return
  }

  if (cue === 'soft_fold' && !isSampleRenderStyle(theme.renderStyle)) {
    scheduleThemeCue(context, startAt, 'decline', theme, volume * 0.58, 1)
    return
  }

  switch (theme.renderStyle) {
    case 'tablao':
      renderTablaoCue(context, startAt, cue, theme, volume, stake)
      return
    case 'haze':
      renderHazeCue(context, startAt, cue, theme, volume, stake)
      return
    case 'neon':
      renderNeonCue(context, startAt, cue, theme, volume, stake)
      return
    case 'salon':
      renderSalonCue(context, startAt, cue, theme, volume, stake)
      return
    case 'ghost':
      renderGhostCue(context, startAt, cue, theme, volume, stake)
      return
    case 'rail':
      renderRailCue(context, startAt, cue, theme, volume, stake)
      return
    case 'velvet':
      renderVelvetCue(context, startAt, cue, theme, volume, stake)
      return
    case 'arena':
      renderArenaCue(context, startAt, cue, theme, volume, stake)
      return
    case 'signal':
      renderSignalCue(context, startAt, cue, theme, volume, stake)
      return
    case 'dusty':
      renderDustyCue(context, startAt, cue, theme, volume, stake)
      return
    case 'sample-a':
    case 'sample-b':
      return
  }
}

export function useTableSoundFx({ enabled, volume, themeId = DEFAULT_SOUND_THEME_ID, fastMode = false }: TableSoundFxOptions) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const enabledRef = useRef(enabled)
  const volumeRef = useRef(clampVolume(volume))
  const themeIdRef = useRef<SoundThemeId>(themeId)
  const fastModeRef = useRef(fastMode)
  const previewTimeoutsRef = useRef<number[]>([])
  const sampleBufferCacheRef = useRef<Map<string, Promise<AudioBuffer | null>>>(new Map())

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    volumeRef.current = clampVolume(volume)
  }, [volume])

  useEffect(() => {
    themeIdRef.current = isSoundThemeCandidate(themeId) ? themeId : DEFAULT_SOUND_THEME_ID
  }, [themeId])

  useEffect(() => {
    fastModeRef.current = fastMode
  }, [fastMode])

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null

    const AudioContextCtor = window.AudioContext ?? (window as Window & typeof globalThis & {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext

    if (!AudioContextCtor) return null

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor()
    }

    return audioContextRef.current
  }, [])

  const clearPreviewTimeouts = useCallback(() => {
    for (const timeoutId of previewTimeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }
    previewTimeoutsRef.current = []
  }, [])

  const primeSound = useCallback(() => {
    const context = getAudioContext()
    if (!context) return

    void context.resume().catch(() => {})
    primeSampleTheme(context, sampleBufferCacheRef.current, getTableSoundTheme(themeIdRef.current))
  }, [getAudioContext])

  const performSound = useCallback((
    cue: SoundCue,
    options: SoundPlaybackOptions & { force?: boolean } = {},
  ) => {
    const {
      force = false,
      scorePoints,
      stake,
      themeId: overrideThemeId,
    } = options
    if (!force && !enabledRef.current) return

    const context = getAudioContext()
    if (!context) return

    const nextVolume = clampVolume(volumeRef.current)
    if (nextVolume <= 0.001) return

    void context.resume().catch(() => {})

    const theme = getTableSoundTheme(overrideThemeId ?? themeIdRef.current)
    if (isSampleRenderStyle(theme.renderStyle)) {
      void scheduleSampleThemeCue(
        context,
        sampleBufferCacheRef.current,
        context.currentTime + 0.008,
        cue,
        theme,
        nextVolume,
        { stake, scorePoints, fastMode: !force && fastModeRef.current },
      )
      return
    }

    scheduleThemeCue(context, context.currentTime + 0.008, cue, theme, nextVolume, stake)
  }, [getAudioContext])

  const playSound = useCallback((cue: SoundCue, options?: { scorePoints?: number; stake?: number }) => {
    performSound(cue, options)
  }, [performSound])

  const previewSound = useCallback((cue: SoundCue, options?: SoundPlaybackOptions) => {
    performSound(cue, { ...options, force: true })
  }, [performSound])

  const previewThemeReel = useCallback((themeId: SoundThemeId) => {
    if (typeof window === 'undefined') return

    clearPreviewTimeouts()
    for (const item of SOUND_THEME_REEL) {
      const timeoutId = window.setTimeout(() => {
        previewSound(item.cue, item.stake == null ? { themeId } : { themeId, stake: item.stake })
        previewTimeoutsRef.current = previewTimeoutsRef.current.filter((candidate) => candidate !== timeoutId)
      }, item.delayMs)
      previewTimeoutsRef.current.push(timeoutId)
    }
  }, [clearPreviewTimeouts, previewSound])

  useEffect(() => {
    return () => {
      clearPreviewTimeouts()
      const context = audioContextRef.current
      if (!context) return

      audioContextRef.current = null
      void context.close().catch(() => {})
    }
  }, [clearPreviewTimeouts])

  return {
    playSound,
    previewSound,
    previewThemeReel,
    primeSound,
  }
}
