'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Fragment, startTransition, useEffect, useMemo, useRef, useState } from 'react'

import styles from './StudyLab.module.css'
import { LanguagePicker } from './components/live/LanguagePicker'
import {
  BlockBadge,
  BlockCellContent,
  CellSelectedMark,
  ChartCellContent,
  ClassMark,
  ListRowDuoBar,
  ListRowMixBar,
  MiniCard,
  ROLE_COLORS,
  COST_INK,
  DIFF_INK,
  GREEN,
  PAPER,
  RED,
  cellStyles as cells,
  costStrip,
  costVisual,
  diffAcceptVisual,
  diffTvVisual,
  emptyVisual,
  mixColor,
  rangeVisual,
  strategyCellVisual,
  strategyRowVisual,
  untrainedRowVisual,
  type CellVisual,
} from './components/study/ChartCells'
import { StudyTimeline, type TerminalInfo, type TimelineDecision } from './StudyTimeline'
import { reconcileEdit, type EditReconcile } from './lib/reconcile-edit'
import { StudyTableView } from './StudyTableView'
import { StudyWalkthrough } from './StudyWalkthrough'
import { resolveStudyAssetUrl } from './lib/study-assets'
import {
  actionCardAvailable,
  actionRole,
  aggregateCells,
  aggregateRows,
  classCopies,
  classInfos,
  copiesLeftForSeat,
  displayActionsForRow,
  draftAfterPlays,
  draftCompletable,
  draftFitsLine,
  draftKnown,
  draftMatchesHand,
  draftSetSlot,
  draftWithPlaysFitting,
  elevenOwner,
  firstStakeIllegal,
  translateLineForBand,
  linePlays,
  evLossPP,
  interpretNode,
  jointRowWeight,
  nodeJointMass,
  nodeActionOptions,
  observedLine,
  pairHiddenSlot,
  pairKey,
  parseBrGapTable,
  remainingHand,
  roleOrder,
  rootDealWeights,
  rowSelfLossPP,
  seatRole,
  tvDistance,
  viraChoices,
  viraClassOf,
  viraRank,
  viraRanks,
  walkLine,
  N_CLASSES,
  PAIR_INDICES,
  type ActionRole,
  type BandContext,
  type BrGapRecord,
  type CellAgg,
  type ChartAction,
  type ChartDoc,
  type ChartNode,
  type ChartPair,
  type ChartRow,
  type ClassInfo,
  type HandDraft,
  type NodeInterp,
} from './lib/study-data'
import { formatBlockView, parseBlockView } from './lib/block-view'
import { buildStudyPlaySeed } from './lib/study-play'
import { createSeededBotSession, fetchSolverBotStatus } from './lib/session-api'
import {
  parseStudyString,
  resolveDraftSlots,
  resolveHistory,
  serializeStudyString,
  validateDraftWithLine,
  validateDraftsTogether,
  StudyStringError,
} from './lib/study-string'

interface ManifestSpot {
  score: [number, number]
  tc: number
  dealer: number
  file: string
  /** trick-2+ continuation nodes, fetched lazily on drill-in (may be .json.gz) */
  deep?: string
  /** Full-tree, lazy BR-gap table for this exact score / turn-up / dealer spot. */
  br_gaps?: string
  /** early/less-converged solve exported for design review, not the certified column */
  provisional?: boolean
  /** shown alongside the provisional badge, e.g. why and what it will be replaced by */
  provisionalNote?: string
}

interface Manifest {
  spots: ManifestSpot[]
  queued?: Array<{ score: [number, number]; note?: string }>
}

type ViewMode = 'strategy' | 'range' | 'ev' | 'diff'

/** which habit the Cost view prices: the most-played action, or the worst one */
type CostMode = 'habit' | 'worst'

/** the Cost view's currency: hand points, or match-win percentage points */
type CostUnit = 'pts' | 'win'

function spotKey(spot: ManifestSpot) {
  return `${spot.score[0]}x${spot.score[1]}-tc${spot.tc}-d${spot.dealer}`
}

/**
 * Role-wise scores of a spot. `score` is seat-indexed and `dealer` names the
 * pé's seat, so the pair (mão, pé) is the seat-free way to say the same thing.
 */
function spotRoleScores(spot: { score: [number, number]; dealer: number }): {
  mao: number
  pe: number
} {
  return spot.dealer === 0
    ? { pe: spot.score[0], mao: spot.score[1] }
    : { mao: spot.score[0], pe: spot.score[1] }
}

/** localized display words for the two seats and the turned card */
interface RoleWords {
  mao: string
  pe: string
  vira: string
}

function spotLabel(spot: ManifestSpot, words: RoleWords) {
  const { mao, pe } = spotRoleScores(spot)
  return `${words.mao} ${mao} × ${words.pe} ${pe} · ${words.vira} ${viraRank(spot.tc)}`
}

/** compact spot name for tight chrome like the compare button */
function spotLabelShort(spot: ManifestSpot, viraPrefix: string) {
  const { mao, pe } = spotRoleScores(spot)
  return `${mao}×${pe} · ${viraPrefix}${viraRank(spot.tc).toLowerCase()}`
}

/**
 * Fetch a chart doc, transparently gunzipping `.json.gz` deep files. Sniffs
 * the gzip magic instead of trusting the extension so a host that already
 * content-decodes still works.
 */
async function fetchChartDoc(path: string): Promise<ChartDoc> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status}`)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(stream).text()) as ChartDoc
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as ChartDoc
}

/** BR-gap tables use the same optional gzip transport as deep chart windows,
 * while preserving the solver's binary format after decompression. */
async function fetchBrGapTable(path: string, spot: ManifestSpot): Promise<Map<number, BrGapRecord>> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status}`)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const raw =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : buf
  return parseBrGapTable(raw, spot)
}

type DeepEntry = ChartDoc | 'loading' | 'missing'
type BrGapEntry = ReadonlyMap<number, BrGapRecord> | 'loading' | 'missing'

type QualityLevel = 'good' | 'caution' | 'poor'
interface QualitySummary {
  gapPP: number
  level: QualityLevel
}

const BR_GAP_CAUTION_PP = 1
const BR_GAP_POOR_PP = 5

function qualityLevel(gapPP: number): QualityLevel {
  if (gapPP <= BR_GAP_CAUTION_PP) return 'good'
  if (gapPP <= BR_GAP_POOR_PP) return 'caution'
  return 'poor'
}

/** small probabilities keep just enough decimals to stay readable */
function fmtReach(f: number): string {
  const p = f * 100
  return p >= 0.95 ? `${Math.round(p)}` : p >= 0.095 ? p.toFixed(1) : p.toFixed(2)
}

/** percent with one decimal only when it carries information ("99.4", "62", "0.6") */
function fmtPct(p: number): string {
  const s = (p * 100).toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

interface TooltipState {
  x: number
  y: number
  place: 'below' | 'above'
  h1: number
  h2: number
  pair: ChartPair
  /** list rows tooltip with their own aggregates instead of a chart cell;
   *  rem = the fully known remaining hand, so action rows can name every card */
  custom?: { cell: CellAgg; other?: CellAgg; rem?: number[]; quality?: QualitySummary | null }
}

/** anchor a tooltip to the hovered element — set once on mouseenter, so hover
 *  never re-renders the lab per mousemove (the old cursor-follow did, and on
 *  large grids that lag read as the tooltip being slow to appear) */
function tooltipAnchor(el: HTMLElement): { x: number; y: number; place: 'below' | 'above' } {
  const r = el.getBoundingClientRect()
  const below = r.bottom + 220 < window.innerHeight
  return { x: r.left + r.width / 2, y: below ? r.bottom : r.top, place: below ? 'below' : 'above' }
}

type Role = 'mão' | 'pé'

/** what a pending state change would do to one role's existing draft */
interface DraftImpact {
  role: Role
  kind: 'clear' | 'rewrite'
  locked: boolean
}

/** localStorage flag: '0' = don't ask before destructive changes */
const ASK_DESTRUCTIVE_KEY = 'truco-study-ask-destructive'

/** what editing an earlier action does to the actions after it:
 *  'ask' (default) offers the choice each time, 'keep' carries forward what
 *  still fits, 'reset' clears the line from that point */
type EditHistoryMode = 'ask' | 'keep' | 'reset'
const EDIT_HISTORY_KEY = 'truco-study-edit-history'

/** one role's drafted hand; it follows the walk wherever that role acts */
interface DraftEntry {
  /** full-hand slots including cards already played, strongest first */
  slots: HandDraft
  /** remaining-hand slot the varying-card list controls once the hand is full */
  focus: number | null
  /** pinned for the whole hand: editing pauses, that role's decisions condition on it */
  locked: boolean
}

export default function StudyLab({ manifestUrl }: { manifestUrl: string }) {
  const locale = useLocale()
  const t = useTranslations('Study.lab')
  const tt = useTranslations('Study.terms')
  // First-visit tour: auto-open once (localStorage-gated), or on demand via a
  // ?tour=1 link (e.g. the "take the tour" affordance and the guide page).
  const [tourOpen, setTourOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const forced = params.get('tour') === '1'
    const seen = window.localStorage.getItem('truco-study-tour-v2') === '1'
    // an explicit ?s= deep link outranks the first-visit auto-tour — the
    // tour's baseline step would silently replace the linked spot
    if (!forced && (seen || params.get('s'))) return
    const t = window.setTimeout(() => setTourOpen(true), forced ? 200 : 900)
    return () => window.clearTimeout(t)
  }, [])
  const closeTour = () => {
    setTourOpen(false)
    try {
      window.localStorage.setItem('truco-study-tour-v2', '1')
    } catch {
      /* ignore private-mode storage errors */
    }
  }
  /** ask before destructive changes (clearing later actions, touching a
   *  drafted hand); pinned hands ask regardless of this flag */
  const [askDestructive, setAskDestructive] = useState(true)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(ASK_DESTRUCTIVE_KEY) === '0') setAskDestructive(false)
    } catch {
      /* ignore private-mode storage errors */
    }
  }, [])
  function persistAskDestructive(v: boolean) {
    setAskDestructive(v)
    try {
      window.localStorage.setItem(ASK_DESTRUCTIVE_KEY, v ? '1' : '0')
    } catch {
      /* ignore private-mode storage errors */
    }
  }
  /** editing an earlier action: ask keep-vs-reset, or always do one of them */
  const [editHistoryMode, setEditHistoryMode] = useState<EditHistoryMode>('ask')
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(EDIT_HISTORY_KEY)
      if (v === 'keep' || v === 'reset') setEditHistoryMode(v)
    } catch {
      /* ignore private-mode storage errors */
    }
  }, [])
  function persistEditHistoryMode(v: EditHistoryMode) {
    setEditHistoryMode(v)
    try {
      window.localStorage.setItem(EDIT_HISTORY_KEY, v)
    } catch {
      /* ignore private-mode storage errors */
    }
  }
  /** the settings modal behind the cog next to the help menu */
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** the read-only mini-table docked in the rail (plan 76 H-3); open by
   *  default on wider screens, collapsed to its strip on phones */
  const [tableOpen, setTableOpen] = useState(true)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [docs, setDocs] = useState<Record<string, ChartDoc>>({})
  const shallowRequested = useRef(new Set<string>())
  const [deepDocs, setDeepDocs] = useState<Record<string, DeepEntry>>({})
  const [brGaps, setBrGaps] = useState<Record<string, BrGapEntry>>({})
  const [spotIdx, setSpotIdx] = useState(0)
  /** Concrete vira spelling for a losslessly merged solver class. The solve
   * stays keyed by `tc`; this only changes the card labels shown to the player. */
  const [chosenViraRank, setChosenViraRank] = useState<string | null>(null)
  /**
   * The pinned hand: every action taken so far, in table order, in actor-truth
   * form (face-down plays keep their class). This is the single source of
   * truth for navigation and survives score / vira / role switches.
   */
  const [line, setLine] = useState<number[]>([])
  /** which decision along the line is being read (a prefix length of `line`) */
  const [cursor, setCursor] = useState(0)
  const [view, setView] = useState<ViewMode>('strategy')
  /** a legend role can replace every strategy mix with its own percentage */
  const [selectedRole, setSelectedRole] = useState<ActionRole | null>(null)
  /** one GRID for every round: exact blocks on 3-card nodes, a 2D chart on
   *  exact nodes — plus the sorted LIST */
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  /** which hand slot the blocks split by (one block per card in that slot) */
  const [blockSplit, setBlockSplit] = useState<0 | 1 | 2>(2)
  /** all blocks stacked, or one fixed-card chart (the brass badge decides) */
  const [blockMode, setBlockMode] = useState<'all' | 'single'>('all')
  /** the fixed card's class in single-chart mode (null = first available) */
  const [singleBlock, setSingleBlock] = useState<number | null>(null)
  /** which block's brass badge holds the open menu (its split-card class) */
  const [blockMenuFor, setBlockMenuFor] = useState<number | null>(null)
  const [costMode, setCostMode] = useState<CostMode>('worst')
  const [costUnit, setCostUnit] = useState<CostUnit>('pts')
  /** leave face-down plays out of best/worst — hiding is its own question */
  const [ignoreHides, setIgnoreHides] = useState(true)
  /** once the user picks a currency, band changes stop overriding it */
  const unitTouched = useRef(false)
  const [diffIdx, setDiffIdx] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<Role, DraftEntry>>>({})
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The pinned-hand panel is a secondary read on mobile, so it collapses there
  // by default and re-opens when a card gets pinned (cell tap / menu pick) —
  // unless the user has explicitly collapsed it. Always open on wider screens.
  const [handOpen, setHandOpen] = useState(true)
  const handAutoOpenRef = useRef(true)
  const handIsMobileRef = useRef(false)
  const handPanelRef = useRef<HTMLDivElement>(null)
  /** role scores typed by the user that don't (yet) match a solved spot */
  const [scoreDraft, setScoreDraft] = useState<{ mao: number; pe: number } | null>(null)
  /** the hand-string field while it is being edited, and its last error */
  const [stringDraft, setStringDraft] = useState<string | null>(null)
  const [stringError, setStringError] = useState<string | null>(null)
  const urlApplied = useRef(false)

  useEffect(() => {
    setManifest(null)
    setDocs({})
    setDeepDocs({})
    setBrGaps({})
    shallowRequested.current.clear()
    fetch(manifestUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((m: Manifest) => startTransition(() => setManifest(m)))
      .catch(() => setError(t('errManifest')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestUrl])

  const spot = manifest?.spots[spotIdx] ?? null
  // "Play this hand live": whether the solved opponent is mounted on the
  // engine service; without it the seeded match falls back to the heuristic.
  const [solverBotEnabled, setSolverBotEnabled] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchSolverBotStatus()
      .then((status) => { if (!cancelled) setSolverBotEnabled(status.enabled) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [playBusy, setPlayBusy] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const doc = spot ? docs[spotKey(spot)] : undefined
  const brGapEntry = spot ? brGaps[spotKey(spot)] : undefined
  const brGapRecords = brGapEntry instanceof Map ? brGapEntry : null
  const displayViraRank = useMemo(() => {
    if (!spot) return viraRank(0)
    return chosenViraRank && viraRanks(spot.tc).includes(chosenViraRank)
      ? chosenViraRank
      : viraRank(spot.tc)
  }, [chosenViraRank, spot])
  const infos = useMemo(
    () => classInfos(spot?.tc ?? 0, 'cards', displayViraRank),
    [spot?.tc, displayViraRank],
  )
  const labels = useMemo(() => infos.map((c) => c.label), [infos])

  /** Shallow charts are the Lab's main payload. Pull only the selected spot
   * and an active comparison target instead of downloading the whole manifest
   * eagerly on first visit. */
  useEffect(() => {
    if (!manifest) return
    const wanted = [spotIdx, ...(view === 'diff' && diffIdx !== null ? [diffIdx] : [])]
    for (const idx of wanted) {
      const candidate = manifest.spots[idx]
      if (!candidate) continue
      const key = spotKey(candidate)
      if (docs[key] || shallowRequested.current.has(key)) continue
      shallowRequested.current.add(key)
      fetchChartDoc(resolveStudyAssetUrl(candidate.file, manifestUrl, window.location.origin))
        // chart payloads render the whole sheet: fold them in as interruptible
        // transitions so a click never queues behind a grid re-render
        .then((loaded) => startTransition(() => setDocs((prev) => ({ ...prev, [key]: loaded }))))
        .catch(() => {
          shallowRequested.current.delete(key)
          setError(t('errChartData', {
            spot: spotLabel(candidate, { mao: tt('mao'), pe: tt('pe'), vira: t('viraWord') }),
          }))
        })
    }
  }, [manifest, spotIdx, view, diffIdx, docs, manifestUrl, t, tt])

  /** BR quality is optional and loaded only for a spot that ships its compact
   * full-tree table. A failed optional measurement never blocks chart data. */
  useEffect(() => {
    if (!spot?.br_gaps) return
    const key = spotKey(spot)
    if (brGaps[key] !== undefined) return
    setBrGaps((prev) => ({ ...prev, [key]: 'loading' }))
    fetchBrGapTable(resolveStudyAssetUrl(spot.br_gaps, manifestUrl, window.location.origin), spot)
      .then((records) => startTransition(() => setBrGaps((prev) => ({ ...prev, [key]: records }))))
      .catch(() => setBrGaps((prev) => ({ ...prev, [key]: 'missing' })))
  }, [spot, brGaps, manifestUrl])

  /** open plays must not outrun the deck under this vira (kept-line check) */
  function lineFitsDeck(cur: readonly number[], tc: number): boolean {
    const viraCls = viraClassOf(tc)
    const seen = new Map<number, number>([[viraCls, 1]])
    for (const code of cur) {
      if (code <= 12) {
        const n = (seen.get(code) ?? 0) + 1
        if (n > classCopies(code)) return false
        seen.set(code, n)
      }
    }
    return true
  }

  /** the kept line as it survives a band switch: mão-de-onze prefix
   *  translated, then cut at the first action the new stake rules forbid
   *  (a truco raise carried into an eleven band, for instance) */
  function lineForBand(
    cur: readonly number[],
    targetCtx: BandContext,
  ): { next: number[]; shift: number; truncated: boolean } {
    const shifted = translateLineForBand(cur, targetCtx)
    const cut = firstStakeIllegal(shifted, targetCtx)
    return {
      next: shifted.slice(0, cut),
      shift: shifted.length - cur.length,
      truncated: cut < shifted.length,
    }
  }

  /** switch spots without dropping the pinned line — that is the whole
   *  point. The line survives translated (and stake-truncated with a note);
   *  a switch that would clear or re-arrange a drafted hand asks first. */
  function selectSpotIndex(idx: number, concreteViraRank?: string) {
    const target = manifest?.spots[idx]
    if (!target) {
      setSpotIdx(idx)
      if (concreteViraRank) setChosenViraRank(concreteViraRank)
      setScoreDraft(null)
      setTooltip(null)
      return
    }
    const targetViraRank = viraRanks(target.tc).includes(concreteViraRank ?? '')
      ? concreteViraRank!
      : viraRanks(target.tc).includes(displayViraRank)
        ? displayViraRank
        : viraRank(target.tc)
    const targetCtx: BandContext = { dealer: target.dealer, score: target.score }
    const { next, shift, truncated } = lineForBand(line, targetCtx)
    const impacts = draftImpacts(next, targetCtx, target.tc)
    const lockedTouched = impacts.some((i) => i.locked)
    const apply = (fromDialog: boolean) => {
      if (next.length !== line.length || next.some((v, i) => v !== line[i])) {
        setLine(next)
        setCursor((c) => Math.max(0, Math.min(c + shift, next.length)))
      }
      setSpotIdx(idx)
      setChosenViraRank(targetViraRank)
      setScoreDraft(null)
      setTooltip(null)
      const notes = [
        ...(truncated ? [t('truncatedKeptLine')] : []),
        ...(!fromDialog ? impacts.map((i) => impactNote(i)) : []),
      ]
      if (notes.length > 0) setStringError(notes.join(' · '))
    }
    if (impacts.length > 0 && (askDestructive || lockedTouched)) {
      setPendingConfirm({
        title: t('spotDraftTitle'),
        body: t('spotDraftBody'),
        detail: truncated ? t('truncatedKeptLine') : undefined,
        notes: impacts.map((i) => impactDialogLine(i)),
        confirmLabel: t('switchIt'),
        allowSuppress: !lockedTouched,
        proceed: () => apply(true),
      })
      return
    }
    apply(false)
  }

  /** lazily pull a spot's deep (trick-2+) file once a hand is being pinned */
  useEffect(() => {
    if (line.length === 0 || !manifest) return
    const wanted = [spotIdx, ...(view === 'diff' && diffIdx !== null ? [diffIdx] : [])]
    for (const idx of wanted) {
      const s = manifest.spots[idx]
      if (!s?.deep) continue
      const k = spotKey(s)
      if (deepDocs[k]) continue
      const deepFile = s.deep
      setDeepDocs((prev) => ({ ...prev, [k]: 'loading' }))
      fetchChartDoc(resolveStudyAssetUrl(deepFile, manifestUrl, window.location.origin))
        .then((d) => startTransition(() => setDeepDocs((prev) => ({ ...prev, [k]: d }))))
        .catch(() => setDeepDocs((prev) => ({ ...prev, [k]: 'missing' })))
    }
  }, [line.length, manifest, spotIdx, diffIdx, view, deepDocs, manifestUrl])

  const roleScores = scoreDraft ?? (spot ? spotRoleScores(spot) : { mao: 11, pe: 11 })

  /** pick the solved spot for role scores (mão, pé), preferring the current vira */
  function selectRoleScores(mao: number, pe: number) {
    if (!manifest) return
    const matches = manifest.spots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        const rs = spotRoleScores(s)
        return rs.mao === mao && rs.pe === pe
      })
    if (matches.length === 0) {
      setScoreDraft({ mao, pe })
      return
    }
    const preferred =
      matches.find(({ i }) => i === spotIdx) ??
      matches.find(({ s }) => !spot || s.tc === spot.tc) ??
      matches[0]
    selectSpotIndex(preferred.i)
  }

  function changeScore(which: 'mao' | 'pe', raw: string) {
    const value = Math.max(0, Math.min(11, Math.round(Number(raw))))
    if (!Number.isFinite(value)) return
    const next = which === 'mao' ? { ...roleScores, mao: value } : { ...roleScores, pe: value }
    selectRoleScores(next.mao, next.pe)
  }

  const scoreStatus = useMemo(() => {
    if (!manifest || scoreDraft === null) return null
    const queued = (manifest.queued ?? []).some(
      (q) =>
        (q.score[0] === scoreDraft.mao && q.score[1] === scoreDraft.pe) ||
        (q.score[0] === scoreDraft.pe && q.score[1] === scoreDraft.mao),
    )
    return queued ? t('solving') : t('notSolved')
  }, [manifest, scoreDraft, t])

  /** solved spots sharing this spot's role scores, keyed by vira class */
  const viraSpotByTc = useMemo(() => {
    const byTc = new Map<number, number>()
    if (!manifest || !spot) return byTc
    const rs = spotRoleScores(spot)
    manifest.spots.forEach((s, i) => {
      const other = spotRoleScores(s)
      if (other.mao === rs.mao && other.pe === rs.pe) byTc.set(s.tc, i)
    })
    return byTc
  }, [manifest, spot])

  const ctx: BandContext | null = useMemo(
    () => (doc ? { dealer: doc.dealer, score: doc.score } : null),
    [doc],
  )

  /** at 11 every point is the match — points stop meaning anything extra */
  useEffect(() => {
    if (unitTouched.current || !spot) return
    setCostUnit(spot.score.includes(11) ? 'win' : 'pts')
  }, [spot])

  const deepEntry = spot ? deepDocs[spotKey(spot)] : undefined
  const deepDoc = typeof deepEntry === 'object' ? deepEntry : undefined
  const deepLoading = deepEntry === 'loading'

  const allNodes = useMemo(() => {
    if (!doc) return []
    return deepDoc ? [...doc.nodes, ...deepDoc.nodes] : doc.nodes
  }, [doc, deepDoc])

  /** Root deal priors let us turn each row's two counterfactual reaches into
   * a true joint probability for the displayed "of deals get here" metric. */
  const rootNode = useMemo(() => {
    if (!doc || doc.nodes.length === 0) return undefined
    return doc.nodes.reduce((a, b) => (a.history.length <= b.history.length ? a : b))
  }, [doc])
  const rootHandWeights = useMemo(() => rootDealWeights(rootNode), [rootNode])
  const rootW = useMemo(() => nodeJointMass(rootNode, rootHandWeights), [rootNode, rootHandWeights])

  /** nodes by observed history — the actor is implied by the turn rules */
  const nodeIndex = useMemo(() => {
    const map = new Map<string, ChartNode>()
    for (const n of allNodes) map.set(n.history.join('.'), n)
    return map
  }, [allNodes])

  /**
   * The line unrolled into decisions: one per prefix, each resolved to the
   * acting seat and (when the export has it) that seat's chart node.
   */
  const decisions = useMemo<TimelineDecision[]>(() => {
    if (!ctx) return []
    const out: TimelineDecision[] = []
    for (let k = 0; k <= line.length; k += 1) {
      const walk = walkLine(line.slice(0, k), ctx)
      if (walk.folded || walk.toAct === null) break
      // the exports stop at the round-2 answer; round 3 is the terminal tile
      if (k === line.length && walk.stage.kind === 'play' && walk.stage.trick >= 3) break
      const seat = walk.toAct
      const role = seatRole(seat, ctx)
      const node = nodeIndex.get(observedLine(walk.steps, seat).join('.'))
      // a pinned hand (or range) conditions its own decisions: the options
      // shrink to what that hand can do, weighted by how the range plays
      let options = node ? nodeActionOptions(node) : null
      let handConditioned = false
      const pin = drafts[role]
      if (node && pin?.locked) {
        const own = interpretNode(node, ctx).ownPlayed
        const rem = draftAfterPlays(pin.slots, own)
        const rows = rem
          ? node.rows.filter((r) => draftMatchesHand(rem, remainingHand(r.hand, own)))
          : []
        if (rows.length > 0) {
          const weights = new Map<number, number>()
          let total = 0
          for (const row of rows) {
            for (const { action, p } of displayActionsForRow(row, own)) {
              weights.set(action.c, (weights.get(action.c) ?? 0) + p * row.w)
              total += p * row.w
            }
          }
          options = [...weights.entries()].map(([code, w]) => ({
            code,
            p: total ? w / total : 0,
          }))
          handConditioned = true
        }
      }
      out.push({
        k,
        seat,
        role,
        stage: walk.stage,
        node,
        mass: node ? nodeJointMass(node, rootHandWeights) : undefined,
        chosen: line[k],
        options,
        handConditioned,
      })
    }
    return out
  }, [ctx, line, nodeIndex, drafts, rootHandWeights])

  const terminal = useMemo<TerminalInfo>(() => {
    if (!ctx) return null
    const walk = walkLine(line, ctx)
    if (walk.folded) {
      const foldStep = [...walk.steps].reverse().find((s) => s.code === 32 || s.code === 34)
      return foldStep
        ? {
            kind: 'folded',
            role: seatRole(foldStep.seat, ctx),
            eleven: foldStep.code === 34,
          }
        : null
    }
    if (walk.stage.kind === 'play' && walk.stage.trick >= 3) return { kind: 'round3' }
    return null
  }, [ctx, line])

  /** the decision being read; the cursor clamps to what actually exists */
  const viewed = useMemo(() => {
    if (decisions.length === 0) return undefined
    return decisions.find((d) => d.k === cursor) ?? decisions[decisions.length - 1]
  }, [decisions, cursor])

  /** "play this hand live": the viewed position as a seeded-match request */
  const playSeed = useMemo(() => {
    if (!spot) return null
    return buildStudyPlaySeed({
      spot,
      viraRank: displayViraRank,
      line: line.slice(0, viewed?.k ?? line.length),
      drafts,
    })
  }, [spot, displayViraRank, line, viewed, drafts])

  /** the rail's prev/next, mirrored inside the table lightbox */
  const tableNav = useMemo(() => {
    const idx = Math.max(
      0,
      decisions.findIndex((d) => d.k === (viewed?.k ?? 0)),
    )
    return {
      pos: decisions.length ? `${idx + 1} / ${decisions.length}` : '–',
      canPrev: idx > 0,
      canNext: idx < decisions.length - 1,
      onPrev: () => {
        if (idx > 0) setCursor(decisions[idx - 1].k)
      },
      onNext: () => {
        if (idx < decisions.length - 1) setCursor(decisions[idx + 1].k)
      },
    }
  }, [decisions, viewed])

  const node = viewed?.node
  const actorRole = viewed?.role
  const interp = useMemo(() => (node && ctx ? interpretNode(node, ctx) : undefined), [node, ctx])
  const nodeIdent = node ? node.history.join('.') : 'none'

  /** trick-2+ chart: the player's played card is known, cells are exact */
  const exact = (interp?.ownPlayed.length ?? 0) > 0
  const remLen = 3 - (interp?.ownPlayed.length ?? 0)

  /** class of the vira's own rank — one copy of it sits face up on the table */
  const viraClass = useMemo(
    () => (spot ? labels.indexOf(displayViraRank) : -1),
    [labels, spot, displayViraRank],
  )

  /** the actor's card plays over the whole walked line, in table order */
  const ownPlaysAll = useMemo(() => {
    if (!ctx || viewed === undefined) return []
    return linePlays(line, ctx)
      .filter((p) => p.seat === viewed.seat)
      .map((p) => p.cls)
  }, [line, ctx, viewed])

  /** the actor's plays after the viewed node — a draft here must still fit them */
  const futureOwnPlays = useMemo(
    () => ownPlaysAll.slice(interp?.ownPlayed.length ?? 0),
    [ownPlaysAll, interp],
  )

  /** deck copies of each class the actor can still hold, before their own
   *  hand: the vira, every open play by the other seat across the whole
   *  line, and the cards the other role's draft certainly keeps beyond
   *  those plays (an open play already sits inside its own drafted slots —
   *  charging both would count one physical card twice). `copiesLeftForSeat`
   *  is the shared lib predicate (plan 77 L-2) — the play-action list below
   *  gates on the same accounting, generalized to any decision's line prefix. */
  const copiesLeftOutside = useMemo(() => {
    if (!ctx || !spot || viewed === undefined) {
      return (cls: number) => classCopies(cls) - (viraClass >= 0 && cls === viraClass ? 1 : 0)
    }
    const otherEntry = drafts[seatRole(1 - viewed.seat, ctx)]
    return copiesLeftForSeat(viewed.seat, line, ctx, spot.tc, otherEntry?.slots)
  }, [line, ctx, spot, viewed, viraClass, drafts])

  /** whether `code` — a play/hide action's card — is deck-possible for a
   *  decision's acting seat, given the OTHER role's pinned/known hand, the
   *  vira, and every open play committed before that decision (plan 77
   *  L-2). Bids/accept/fold (code ≥ 26) never name a card, so they always
   *  pass. Used to grey a deck-impossible action in the play-action list,
   *  exactly like the range picker greys an impossible slot value. */
  const decisionActionAvailable = useMemo(() => {
    return (d: TimelineDecision, code: number): boolean => {
      if (!ctx || !spot || code >= 26) return true
      const cls = code < 13 ? code : code - 13
      const otherEntry = drafts[seatRole(1 - d.seat, ctx)]
      return actionCardAvailable(cls, d.seat, line.slice(0, d.k), ctx, spot.tc, otherEntry?.slots)
    }
  }, [ctx, spot, drafts, line])

  /** whether a fully-known remaining hand at this node is still possible
   *  alongside the whole walked line: it must contain the actor's later
   *  plays, and together with the cards already played it cannot outrun the
   *  deck copies left past the vira and the other seat's open plays */
  const remPossible = useMemo(() => {
    const need = new Map<number, number>()
    for (const c of futureOwnPlays) need.set(c, (need.get(c) ?? 0) + 1)
    const played = interp?.ownPlayed ?? []
    return (rem: readonly number[]) => {
      for (const [c, n] of need) {
        if (rem.filter((x) => x === c).length < n) return false
      }
      for (const c of new Set(rem)) {
        const inHand =
          rem.filter((x) => x === c).length + played.filter((x) => x === c).length
        if (inHand > copiesLeftOutside(c)) return false
      }
      return true
    }
  }, [futureOwnPlays, interp, copiesLeftOutside])

  /** the acting role's draft — the panel edits and reads this one */
  const draft = actorRole ? drafts[actorRole] : undefined

  function setDraftFor(role: Role, entry: DraftEntry | null) {
    setDrafts((prev) => {
      const next = { ...prev }
      if (entry) next[role] = entry
      else delete next[role]
      return next
    })
  }

  /** the draft as it stands at this node, or empty slots when it can't apply */
  const draftRem = useMemo<HandDraft>(() => {
    const empty = Array.from({ length: remLen }, () => null)
    if (!draft || !interp) return empty
    return draftAfterPlays(draft.slots, interp.ownPlayed) ?? empty
  }, [draft, interp, remLen])

  /** the tooltip anchors to cells of the previous chart — reset per node */
  useEffect(() => {
    setTooltip(null)
  }, [nodeIdent])

  /** keep drafts reconciled with the walked line: the owner's plays must come
   *  out of the slots, and the deck must cover both drafted hands past the
   *  vira and the open plays (both drafts share one deck — F1). When only
   *  the stored placement of played cards no longer fits (an unknown
   *  absorbed a later play), re-place it; drop the draft only when no real
   *  hand can hold it alongside the line. */
  useEffect(() => {
    if (!ctx || !spot) return
    const seatOf = (role: Role) => (role === 'pé' ? ctx.dealer : 1 - ctx.dealer)
    // a draft that contradicts the line on its own cannot vouch for (or
    // veto) the other one — only solo-valid drafts join the cross check
    const soloOk: Partial<Record<Role, boolean>> = {}
    for (const role of ['mão', 'pé'] as const) {
      const entry = drafts[role]
      if (entry) soloOk[role] = draftFitsLine(entry.slots, seatOf(role), line, ctx, spot.tc)
    }
    for (const role of ['mão', 'pé'] as const) {
      const entry = drafts[role]
      if (!entry) continue
      const otherRole = role === 'pé' ? 'mão' : 'pé'
      const other = soloOk[otherRole] ? drafts[otherRole]?.slots : undefined
      const seat = seatOf(role)
      if (draftFitsLine(entry.slots, seat, line, ctx, spot.tc, other)) continue
      const own = linePlays(line, ctx)
        .filter((p) => p.seat === seat)
        .map((p) => p.cls)
      const rem = draftAfterPlays(entry.slots, own)
      const replaced = rem
        ? draftWithPlaysFitting(rem, own, seat, line, ctx, spot.tc, other)
        : null
      setDrafts((prev) => {
        const cur = prev[role]
        if (!cur) return prev
        const next = { ...prev }
        if (replaced) next[role] = { ...cur, slots: replaced }
        else delete next[role]
        return next
      })
    }
  }, [ctx, spot, drafts, line])

  /** collapse the pinned-hand panel and the mini-table by default on phones */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyMobile = () => {
      const mobile = window.matchMedia('(max-width: 640px)').matches
      handIsMobileRef.current = mobile
      if (mobile) {
        setHandOpen(false)
        setTableOpen(false)
      }
    }
    // a hidden or detached tab can mount at width 0 (background restore,
    // embedded webviews) and would wrongly read as a phone — wait for the
    // first real layout instead
    if (window.innerWidth === 0) {
      const onSize = () => {
        if (window.innerWidth === 0) return
        window.removeEventListener('resize', onSize)
        applyMobile()
      }
      window.addEventListener('resize', onSize)
      return () => window.removeEventListener('resize', onSize)
    }
    applyMobile()
  }, [])

  /** open the panel when the user pins a card from the chart, unless they've
   *  explicitly collapsed it; scroll it into view. Phones only. Driven by the
   *  interaction handler (not a draft-count watcher) so URL/programmatic loads
   *  of a pre-pinned hand don't spring it open. */
  function openHandOnInteract() {
    if (!handIsMobileRef.current || !handAutoOpenRef.current) return
    setHandOpen(true)
    requestAnimationFrame(() => {
      handPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  /** manual collapse disables auto-open; manual expand re-enables it */
  const toggleHandPanel = () => {
    setHandOpen((openNow) => {
      const next = !openNow
      handAutoOpenRef.current = next
      return next
    })
  }

  function viewDecision(k: number) {
    setCursor(k)
  }

  /**
   * What would happen to each existing draft if the state moved to this
   * line/band — the reconciliation effect's own predicates, run ahead of
   * time so destructive side effects can ask (or at least say) first.
   */
  function draftImpacts(
    newLine: readonly number[],
    targetCtx: BandContext,
    targetTc: number,
  ): DraftImpact[] {
    const seatOf = (role: Role) => (role === 'pé' ? targetCtx.dealer : 1 - targetCtx.dealer)
    const soloOk: Partial<Record<Role, boolean>> = {}
    for (const role of ['mão', 'pé'] as const) {
      const entry = drafts[role]
      if (entry) {
        soloOk[role] = draftFitsLine(entry.slots, seatOf(role), newLine, targetCtx, targetTc)
      }
    }
    const out: DraftImpact[] = []
    for (const role of ['mão', 'pé'] as const) {
      const entry = drafts[role]
      if (!entry) continue
      const otherRole = role === 'pé' ? 'mão' : 'pé'
      const other = soloOk[otherRole] ? drafts[otherRole]?.slots : undefined
      const seat = seatOf(role)
      if (draftFitsLine(entry.slots, seat, newLine, targetCtx, targetTc, other)) continue
      const own = linePlays(newLine, targetCtx)
        .filter((p) => p.seat === seat)
        .map((p) => p.cls)
      const rem = draftAfterPlays(entry.slots, own)
      const replaced = rem
        ? draftWithPlaysFitting(rem, own, seat, newLine, targetCtx, targetTc, other)
        : null
      out.push({ role, kind: replaced ? 'rewrite' : 'clear', locked: entry.locked })
    }
    return out
  }

  const roleWordOf = (r: Role) => (r === 'pé' ? tt('pe') : tt('mao'))

  /** dialog line for one impact — future tense, pinned hands called out */
  function impactDialogLine(i: DraftImpact): string {
    const role = roleWordOf(i.role)
    if (i.kind === 'clear') {
      return i.locked ? t('confirmClearsPinned', { role }) : t('confirmClearsDraft', { role })
    }
    return i.locked ? t('confirmRewritesPinned', { role }) : t('confirmRewritesDraft', { role })
  }

  /** passive note for one impact, when the dialog is suppressed */
  function impactNote(i: DraftImpact): string {
    const role = roleWordOf(i.role)
    return i.kind === 'clear' ? t('droppedKeptDraft', { role }) : t('rewroteKeptDraft', { role })
  }

  /** a pending destructive-change question: what to say, and what to do */
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    body: string
    detail?: string
    /** consequence sentences, one per affected draft */
    notes: string[]
    confirmLabel: string
    /** offer "don't ask again" — never when a pinned hand is touched */
    allowSuppress: boolean
    proceed: () => void
  } | null>(null)

  function confirmProceed(dontAskAgain: boolean) {
    if (!pendingConfirm) return
    if (dontAskAgain && pendingConfirm.allowSuppress) persistAskDestructive(false)
    pendingConfirm.proceed()
    setPendingConfirm(null)
  }

  /** editing an earlier action with a live future: keep what fits, or reset
   *  from that point? Each option shows its own consequences up front, so
   *  choosing proceeds directly with no second confirmation. */
  const [pendingChoice, setPendingChoice] = useState<{
    body: string
    keep: { detail: string; notes: string[]; proceed: () => void }
    reset: { detail: string; notes: string[]; proceed: () => void }
  } | null>(null)

  function choiceProceed(which: 'keep' | 'reset', dontAskAgain: boolean) {
    if (!pendingChoice) return
    if (dontAskAgain) persistEditHistoryMode(which)
    pendingChoice[which].proceed()
    setPendingChoice(null)
  }

  /**
   * Pick an action at decision `k` — or unpick it by choosing it again.
   * Editing an earlier decision keeps whatever tail of the line survives
   * the conservative criterion (plan 76 H-2: same actors, still legal);
   * clean keeps are silent apart from a passive note, and anything that
   * actually drops — cut suffixes, cleared or re-arranged drafts — asks
   * first (always, when a pinned hand is touched — otherwise unless the
   * user opted out, in which case a passive note surfaces the change).
   * Unpicking removes the action itself, which shifts every later
   * position, so it still clears the rest outright.
   */
  function pickAction(k: number, code: number) {
    if (!ctx || !spot) return
    const later = line.length - (k + 1)
    const unpick = line[k] === code
    const replace = !unpick && line[k] !== undefined && later > 0
    // when the keep would actually keep something, the edit forks: carry the
    // surviving future, or reset the line from this point. The default mode
    // asks (except mid-tour, whose scripted edit expects the silent keep);
    // a remembered choice skips the question. When nothing would survive
    // anyway, both forks coincide and the plain destructive confirm below
    // handles it.
    const wantReset = replace && editHistoryMode === 'reset'
    const rec = replace && !wantReset ? reconcileEdit(line, k, code, ctx, spot.tc) : null
    if (replace && rec && rec.kept > 0 && editHistoryMode === 'ask' && !tourOpen) {
      offerEditChoice(k, code, rec, later)
      return
    }
    const newLine = unpick
      ? line.slice(0, k)
      : rec
        ? rec.next
        : [...line.slice(0, k), code]
    const dropped = unpick || wantReset ? later : (rec?.dropped ?? 0)
    const kept = rec?.kept ?? 0
    const truncates = dropped > 0
    const impacts = draftImpacts(newLine, ctx, spot.tc)
    const lockedTouched = impacts.some((i) => i.locked)
    const cutReason =
      rec?.reason === 'actor'
        ? t('cutReasonActor')
        : rec?.reason === 'deck'
          ? t('cutReasonDeck')
          : t('cutReasonIllegal')
    // a remembered keep/reset answer pre-approves the cut it implies, so the
    // destructive confirm only fires for it when a draft is also touched
    const cutApproved = replace && editHistoryMode !== 'ask'
    const apply = (fromDialog: boolean) => {
      setLine(newLine)
      setCursor(unpick ? k : k + 1)
      if (!fromDialog) {
        const notes = [
          ...(kept > 0 && !truncates ? [t('keptLaterActions', { count: kept })] : []),
          ...(cutApproved && truncates
            ? [
                kept > 0
                  ? t('replaceDetailPartial', { kept, dropped, reason: cutReason })
                  : t('editChoiceResetDetail', { count: dropped }),
              ]
            : []),
          ...impacts.map(impactNote),
        ]
        if (notes.length > 0) setStringError(notes.join(' · '))
      }
    }
    const askForCut = truncates && askDestructive && !cutApproved
    const askForDrafts = impacts.length > 0 && (askDestructive || lockedTouched)
    if (askForCut || askForDrafts) {
      setPendingConfirm({
        title: unpick ? t('unpickTitle') : replace ? t('replaceTitle') : t('pickDraftTitle'),
        body: unpick ? t('unpickBody') : replace ? t('replaceBody') : t('pickDraftBody'),
        detail: truncates
          ? kept > 0
            ? t('replaceDetailPartial', { kept, dropped, reason: cutReason })
            : t('unpickDetail', { count: dropped })
          : undefined,
        notes: impacts.map((i) => impactDialogLine(i)),
        confirmLabel: unpick ? t('unpick') : replace ? t('replaceIt') : t('pickIt'),
        allowSuppress: !lockedTouched,
        proceed: () => apply(true),
      })
      return
    }
    apply(false)
  }

  function resetLine() {
    setLine([])
    setCursor(0)
    setDrafts({})
  }

  /** build the keep-vs-reset question for an edit at decision `k` — both
   *  outcomes are computed up front so each button can state its own price */
  function offerEditChoice(k: number, code: number, rec: EditReconcile, later: number) {
    if (!ctx || !spot) return
    const resetNext = [...line.slice(0, k), code]
    const keepImpacts = draftImpacts(rec.next, ctx, spot.tc)
    const resetImpacts = draftImpacts(resetNext, ctx, spot.tc)
    const cutReason =
      rec.reason === 'actor'
        ? t('cutReasonActor')
        : rec.reason === 'deck'
          ? t('cutReasonDeck')
          : t('cutReasonIllegal')
    const apply = (next: number[]) => {
      setLine(next)
      setCursor(k + 1)
    }
    setPendingChoice({
      body: t('editChoiceBody', { count: later }),
      keep: {
        detail:
          rec.dropped > 0
            ? t('replaceDetailPartial', { kept: rec.kept, dropped: rec.dropped, reason: cutReason })
            : t('editChoiceKeepAll', { count: rec.kept }),
        notes: keepImpacts.map((i) => impactDialogLine(i)),
        proceed: () => apply(rec.next),
      },
      reset: {
        detail: t('editChoiceResetDetail', { count: later }),
        notes: resetImpacts.map((i) => impactDialogLine(i)),
        proceed: () => apply(resetNext),
      },
    })
  }

  /** the whole state as one line — shown in the hand bar and the URL */
  const serialized = useMemo(() => {
    if (!spot || !ctx) return ''
    const rs = spotRoleScores(spot)
    return serializeStudyString({
      mao: rs.mao,
      pe: rs.pe,
      tc: spot.tc,
      viraRankLabel: displayViraRank,
      ctx,
      drafts: (['mão', 'pé'] as const)
        .filter((r) => drafts[r])
        .map((r) => ({ role: r, slots: drafts[r]!.slots, pinned: drafts[r]!.locked })),
      line,
    })
  }, [spot, ctx, displayViraRank, drafts, line])

  /**
   * Apply a typed hand string. Omitted sections keep the current state:
   * score/vira default to the current spot, an omitted history keeps the
   * walked line (translated for the target band), and each omitted draft
   * section keeps that role's draft — kept sections that no longer fit are
   * dropped with a note, while errors in explicitly typed sections abort
   * the whole apply (nothing changes).
   */
  function applyStudyStringInput(input: string) {
    if (!manifest) return
    try {
      const ast = parseStudyString(input)
      const mao = ast.mao ?? roleScores.mao
      const pe = ast.pe ?? roleScores.pe
      const tc = ast.tc ?? spot?.tc ?? 0
      const targetViraRank =
        ast.viraRankLabel ??
        (viraRanks(tc).includes(displayViraRank) ? displayViraRank : viraRank(tc))
      const idx = manifest.spots.findIndex((s) => {
        const rs = spotRoleScores(s)
        return rs.mao === mao && rs.pe === pe && s.tc === tc
      })
      if (idx < 0) {
        throw new StudyStringError(
          t('notSolvedYetSpot', { mao, pe, vira: targetViraRank }),
        )
      }
      const target = manifest.spots[idx]
      const targetCtx: BandContext = { dealer: target.dealer, score: target.score }
      const kept: string[] = []

      let newLine: number[]
      if (ast.history) {
        newLine = resolveHistory(ast.history, targetCtx, tc, targetViraRank)
      } else {
        const carried = lineForBand(line, targetCtx)
        newLine = carried.next
        if (carried.truncated) kept.push(t('truncatedKeptLine'))
        if (!lineFitsDeck(newLine, tc)) {
          newLine = []
          kept.push(t('droppedKeptLine'))
        }
      }

      const newDrafts: Partial<Record<Role, DraftEntry>> = {}
      const explicit = new Set((ast.drafts ?? []).map((d) => d.role))
      for (const d of ast.drafts ?? []) {
        const slots = resolveDraftSlots(d.slots, tc, targetViraRank)
        validateDraftWithLine(d.role, slots, newLine, targetCtx, tc, targetViraRank)
        // an all-unknown section (mao[? ? ?]) explicitly clears that hand
        if (draftKnown(slots).length > 0) {
          newDrafts[d.role] = { slots, focus: null, locked: d.pinned }
        }
      }
      for (const role of ['mão', 'pé'] as const) {
        if (explicit.has(role)) continue
        const cur = drafts[role]
        if (!cur) continue
        const seat = role === 'pé' ? targetCtx.dealer : 1 - targetCtx.dealer
        if (draftFitsLine(cur.slots, seat, newLine, targetCtx, tc)) {
          newDrafts[role] = cur
        } else {
          kept.push(t('droppedKeptDraft', { role: roleWordOf(role) }))
        }
      }

      // both hands (typed or kept) must come from one deck. A conflict
      // between two typed sections is a hard error; a kept draft that no
      // longer coexists with a typed one is dropped instead.
      const pair = () =>
        (['mão', 'pé'] as const)
          .filter((r) => newDrafts[r])
          .map((r) => ({ role: r, slots: newDrafts[r]!.slots }))
      try {
        validateDraftsTogether(pair(), newLine, targetCtx, tc, targetViraRank)
      } catch (e) {
        if (explicit.has('mão') && explicit.has('pé')) throw e
        for (const role of ['mão', 'pé'] as const) {
          if (!explicit.has(role) && newDrafts[role]) {
            delete newDrafts[role]
            kept.push(t('droppedKeptDraft', { role: roleWordOf(role) }))
          }
        }
        validateDraftsTogether(pair(), newLine, targetCtx, tc, targetViraRank)
      }

      setSpotIdx(idx)
      setChosenViraRank(targetViraRank)
      setScoreDraft(null)
      setLine(newLine)
      setCursor(newLine.length)
      setDrafts(newDrafts)
      setStringDraft(null)
      setStringError(kept.length > 0 ? kept.join(' · ') : null)
    } catch (e) {
      setStringError(e instanceof Error ? e.message : String(e))
    }
  }

  /** the URL carries the hand string: read it once, then keep it current.
   *  The block layout rides next to it as `b` (see lib/block-view) — layout
   *  never enters the study string itself. */
  useEffect(() => {
    if (!manifest || urlApplied.current) return
    urlApplied.current = true
    const params = new URLSearchParams(window.location.search)
    const s = params.get('s')
    if (s) applyStudyStringInput(s)
    const b = params.get('b')
    if (b) {
      // resolve card tokens under the vira the s-string lands on (the apply
      // above is still in flight, so read the target tc off the string)
      let tc = manifest.spots[0]?.tc ?? 0
      let concreteViraRank: string | undefined
      if (s) {
        try {
          const parsed = parseStudyString(s)
          tc = parsed.tc ?? tc
          concreteViraRank = parsed.viraRankLabel
        } catch {
          /* an unreadable s already surfaced its own error */
        }
      }
      const view = parseBlockView(b, tc, concreteViraRank)
      if (view) {
        setBlockSplit(view.split)
        setBlockMode(view.mode)
        setSingleBlock(view.single)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest])

  useEffect(() => {
    if (!serialized || !urlApplied.current || typeof window === 'undefined') return
    const b = spot
      ? formatBlockView(
          { split: blockSplit, mode: blockMode, single: singleBlock },
          spot.tc,
          displayViraRank,
        )
      : null
    const query = `?s=${encodeURIComponent(serialized)}${b ? `&b=${encodeURIComponent(b)}` : ''}`
    window.history.replaceState(null, '', `${window.location.pathname}${query}`)
  }, [serialized, spot, displayViraRank, blockSplit, blockMode, singleBlock])

  /** store a remaining-hand draft, re-inserting the cards already played.
   *  Acceptance is the gate: an edit no placement can reconcile with the
   *  walked line is refused here (no-op) instead of being stored and then
   *  silently dropped by the reconciliation effect. */
  function setDraftRem(rem: HandDraft, focus: number | null) {
    if (!actorRole || !interp || draft?.locked) return
    if (draftKnown(rem).length === 0) {
      setDraftFor(actorRole, null)
      return
    }
    if (!ctx || !spot || !viewed) return
    const otherEntry = drafts[actorRole === 'pé' ? 'mão' : 'pé']
    const slots = draftWithPlaysFitting(
      rem,
      interp.ownPlayed,
      viewed.seat,
      line,
      ctx,
      spot.tc,
      otherEntry?.slots,
    )
    if (!slots) return
    setDraftFor(actorRole, { slots, focus, locked: false })
  }

  /** pin (or unpin) the acting role's draft for the whole hand */
  function togglePin() {
    if (!actorRole) return
    const cur = drafts[actorRole]
    if (!cur) return
    setDraftFor(actorRole, { ...cur, locked: !cur.locked })
  }

  /**
   * Click a cell: fill that pair's two slots, keeping any other known slot
   * when a real holding still fits; click the selected cell again to clear.
   */
  function cellClick(pair: ChartPair, h1: number, h2: number) {
    if (!node || !interp || draft?.locked) return
    const [i, j] = remLen < 3 ? [0, 1] : PAIR_INDICES[pair]
    if (draftRem[i] === h1 && draftRem[j] === h2) {
      if (actorRole) setDraftFor(actorRole, null)
      return
    }
    let next: HandDraft = [...draftRem]
    next[i] = h1
    next[j] = h2
    const knowns = next.filter((x): x is number => x !== null)
    const ordered = knowns.every((v, idx) => idx === 0 || knowns[idx - 1] >= v)
    const fits =
      ordered &&
      node.rows.some((r) => draftMatchesHand(next, remainingHand(r.hand, interp.ownPlayed)))
    if (!fits) {
      next = Array.from({ length: remLen }, () => null)
      next[i] = h1
      next[j] = h2
    }
    setDraftRem(next, remLen < 3 ? null : pairHiddenSlot(pair))
  }

  function setSlot(idx: number, value: number | null) {
    setDraftRem(draftSetSlot(draftRem, idx, value), value === null ? idx : (draft?.focus ?? idx))
  }

  /** drag a slot onto another: swap their contents, knowns re-sort. An
   *  infeasible swap (e.g. dragging the top manilha below an unknown, which
   *  no real hand can order) is a no-op via the setDraftRem gate rather than
   *  a stored-then-dropped draft. */
  function swapSlots(a: number, b: number) {
    if (a === b || draft?.locked) return
    const next = [...draftRem]
    ;[next[a], next[b]] = [next[b], next[a]]
    // draftSetSlot re-sorts the knowns across the known positions
    setDraftRem(draftSetSlot(next, a, next[a]), draft?.focus ?? null)
  }

  function playCard(cls: number) {
    if (!viewed) return
    if (!viewed.options?.some((o) => o.code === cls)) return
    pickAction(viewed.k, cls)
  }

  /** the 2D chart exists only on exact nodes; 3-card grids use blocks */
  const chartPairs = useMemo<ChartPair[]>(() => (remLen < 3 ? ['HM'] : []), [remLen])

  /** rows a chart pair aggregates: conditioned on the draft's OTHER slots */
  const rowsForPair = useMemo(() => {
    const map = new Map<ChartPair, ChartRow[]>()
    if (!node || !interp) return map
    for (const p of chartPairs) {
      const [i, j] = remLen < 3 ? [0, 1] : PAIR_INDICES[p]
      const masked = draftRem.map((v, idx) => (idx === i || idx === j ? null : v))
      map.set(
        p,
        node.rows.filter((r) => {
          const rem = remainingHand(r.hand, interp.ownPlayed)
          return remPossible(rem) && draftMatchesHand(masked, rem)
        }),
      )
    }
    return map
  }, [node, interp, chartPairs, draftRem, remLen, remPossible])

  const cellsByPair = useMemo(() => {
    const map = new Map<ChartPair, Map<string, CellAgg>>()
    if (!node || !interp) return map
    for (const p of chartPairs) {
      const rows = rowsForPair.get(p) ?? []
      map.set(p, aggregateCells({ ...node, rows }, interp.ownPlayed, { pair: p }))
    }
    return map
  }, [node, interp, chartPairs, rowsForPair])

  /** what a fixed habit loses for one exact holding, in the chosen currency */
  const rowCost = useMemo(() => {
    const value = (a: ChartAction) => (costUnit === 'pts' ? (a.pts ?? 0) : a.q)
    const scale = costUnit === 'pts' ? 1 : 50
    return (row: ChartRow, mode: CostMode): number => {
      if (row.actions.length === 0) return 0
      let pool = row.actions
      if (ignoreHides) {
        const open = pool.filter((a) => a.c < 13 || a.c > 25)
        if (open.length > 0) pool = open
      }
      const maxV = Math.max(...pool.map(value))
      if (mode === 'worst') {
        const minV = Math.min(...pool.map(value))
        return Math.max(0, (maxV - minV) * scale)
      }
      const acts = displayActionsForRow(row, interp?.ownPlayed ?? [])
      let modalV = maxV
      let best = -1
      for (const { action, p } of acts) {
        if (p > best) {
          best = p
          modalV = value(action)
        }
      }
      return Math.max(0, (maxV - modalV) * scale)
    }
  }, [interp, costUnit, ignoreHides])

  /** per-cell cost distribution over the varying card: mean and worst holding */
  const costStatsByPair = useMemo(() => {
    const map = new Map<ChartPair, Map<string, { mean: number; max: number }>>()
    if (!interp) return map
    for (const p of chartPairs) {
      const byKey = new Map<string, { w: number; sum: number; max: number }>()
      for (const row of rowsForPair.get(p) ?? []) {
        const key = pairKey(remainingHand(row.hand, interp.ownPlayed), p)
        const cost = rowCost(row, costMode)
        const cur = byKey.get(key) ?? { w: 0, sum: 0, max: 0 }
        cur.w += row.w
        cur.sum += cost * row.w
        cur.max = Math.max(cur.max, cost)
        byKey.set(key, cur)
      }
      const out = new Map<string, { mean: number; max: number }>()
      for (const [key, s] of byKey) out.set(key, { mean: s.w > 0 ? s.sum / s.w : 0, max: s.max })
      map.set(p, out)
    }
    return map
  }, [interp, chartPairs, rowsForPair, rowCost, costMode])

  /** Legacy diagnostics remain useful for explaining a bad node, but BR-gap
   * is the headline measurement whenever this spot ships it. */
  const untrainedPP = doc?.certificate?.assert_qgap_pp ?? 1
  /** below this own-reach, the averaged strategy never accumulated here */
  const OWN_REACH_EPS = 1e-3

  /**
   * How often the actor's own exported strategy plays this line holding each
   * hand — the weight CFR gives the averaged mix. Zero means the mix at this
   * node is initialization noise even when its q values happen to be flat.
   */
  const ownReachByHand = useMemo(() => {
    const map = new Map<string, number>()
    if (!node || !viewed || !actorRole) return map
    const priors = decisions.filter(
      (d) => d.role === actorRole && d.k < viewed.k && d.chosen !== undefined && d.node,
    )
    for (const row of node.rows) {
      let reach = 1
      for (const d of priors) {
        const at = d.node!.rows.find(
          (r) =>
            r.hand[0] === row.hand[0] && r.hand[1] === row.hand[1] && r.hand[2] === row.hand[2],
        )
        const act = at?.actions.find((a) => a.c === d.chosen)
        if (act) reach *= act.p
      }
      map.set(row.hand.join(','), reach)
    }
    return map
  }, [node, decisions, viewed, actorRole])

  const brQualityForRows = (rows: readonly ChartRow[]): QualitySummary | null => {
    if (!brGapRecords) return null
    let weightedGap = 0
    let totalWeight = 0
    for (const row of rows) {
      if (row.table_idx === undefined) continue
      const record = brGapRecords.get(row.table_idx)
      if (!record || !Number.isFinite(record.gap)) continue
      const weight = Math.max(row.w, 0)
      weightedGap += Math.max(0, record.gap * 50) * weight
      totalWeight += weight
    }
    if (totalWeight <= 0) return null
    const gapPP = weightedGap / totalWeight
    return { gapPP, level: qualityLevel(gapPP) }
  }

  /** The old self-loss / own-reach proxy only guards legacy exports. */
  const rowUntrained = (row: ChartRow): boolean => {
    const quality = brQualityForRows([row])
    if (quality) return quality.level === 'poor'
    return (
      rowSelfLossPP(row) > untrainedPP ||
      (ownReachByHand.get(row.hand.join(',')) ?? 1) < OWN_REACH_EPS
    )
  }

  const untrainedByPair = useMemo(() => {
    const map = new Map<ChartPair, Set<string>>()
    if (!interp) return map
    for (const p of chartPairs) {
      const flagged = new Set<string>()
      const seen = new Map<string, { w: number; flaggedW: number }>()
      for (const row of rowsForPair.get(p) ?? []) {
        const key = pairKey(remainingHand(row.hand, interp.ownPlayed), p)
        const cur = seen.get(key) ?? { w: 0, flaggedW: 0 }
        cur.w += row.w
        if (rowUntrained(row)) cur.flaggedW += row.w
        seen.set(key, cur)
      }
      for (const [key, s] of seen) if (s.flaggedW > s.w / 2) flagged.add(key)
      map.set(p, flagged)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interp, chartPairs, rowsForPair, ownReachByHand, untrainedPP, brGapRecords])

  const qualityByPair = useMemo(() => {
    const out = new Map<ChartPair, Map<string, QualitySummary>>()
    if (!interp || !brGapRecords) return out
    for (const pair of chartPairs) {
      const buckets = new Map<string, ChartRow[]>()
      for (const row of rowsForPair.get(pair) ?? []) {
        const key = pairKey(remainingHand(row.hand, interp.ownPlayed), pair)
        const rows = buckets.get(key) ?? []
        rows.push(row)
        buckets.set(key, rows)
      }
      const qualities = new Map<string, QualitySummary>()
      for (const [key, rows] of buckets) {
        const quality = brQualityForRows(rows)
        if (quality) qualities.set(key, quality)
      }
      out.set(pair, qualities)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interp, chartPairs, rowsForPair, brGapRecords])

  /** total and peak posterior mass per chart, for the Range view */
  const massByPair = useMemo(() => {
    const map = new Map<ChartPair, { total: number; max: number }>()
    for (const [p, cells] of cellsByPair) {
      let total = 0
      let max = 0
      for (const cell of cells.values()) {
        total += cell.weight
        max = Math.max(max, cell.weight)
      }
      map.set(p, { total, max })
    }
    return map
  }, [cellsByPair])

  /** heaviest single holding at this node, for row-level range shading */
  const rangeMaxRowW = useMemo(
    () => (node ? Math.max(...node.rows.map((r) => r.w), 0) : 0),
    [node],
  )

  const nodeW = useMemo(
    () => (node ? node.rows.reduce((s, r) => s + r.w, 0) : 0),
    [node],
  )
  const nodeJointW = useMemo(() => nodeJointMass(node, rootHandWeights), [node, rootHandWeights])

  /** the actor's expected match-win % over the whole range at this decision */
  const nodeEquity = useMemo(() => {
    if (!node || node.rows.length === 0) return null
    let w = 0
    let sum = 0
    for (const row of node.rows) {
      let mixQ = 0
      let mixP = 0
      for (const a of row.actions) {
        mixQ += a.p * a.q
        mixP += a.p
      }
      if (mixP > 0) {
        sum += (mixQ / mixP) * row.w
        w += row.w
      }
    }
    return w > 0 ? 50 + (sum / w) * 50 : null
  }, [node])
  const arrival = rootW > 0 ? nodeJointW / rootW : 0

  const diffSpot = diffIdx !== null ? manifest?.spots[diffIdx] : undefined
  const diffDoc = diffSpot ? docs[spotKey(diffSpot)] : undefined
  const diffDeepEntry = diffSpot ? deepDocs[spotKey(diffSpot)] : undefined
  const diffNode = useMemo(() => {
    if (!diffDoc || !node || !interp || !ctx) return null
    const pool =
      typeof diffDeepEntry === 'object'
        ? [...diffDoc.nodes, ...diffDeepEntry.nodes]
        : diffDoc.nodes
    // bands with a mão-de-onze decision prefix histories with the accept —
    // translate so the same card decision lines up across bands
    const curEleven = elevenOwner(ctx.score) !== null
    const othEleven = elevenOwner(diffDoc.score) !== null
    let hist = node.history
    if (curEleven && !othEleven && hist[0] === 33) hist = hist.slice(1)
    else if (!curEleven && othEleven) hist = [33, ...hist]
    const key = hist.join('.')
    const other = pool.find((n) => n.history.join('.') === key)
    if (!other) return null
    const otherCtx: BandContext = { dealer: diffDoc.dealer, score: diffDoc.score }
    if (interpretNode(other, otherCtx).stage.kind !== interp.stage.kind) return null
    return other
  }, [diffDoc, diffDeepEntry, node, interp, ctx])

  const diffCellsByPair = useMemo(() => {
    const map = new Map<ChartPair, Map<string, CellAgg>>()
    if (!diffNode || !interp) return map
    for (const p of chartPairs) {
      const [i, j] = remLen < 3 ? [0, 1] : PAIR_INDICES[p]
      const masked = draftRem.map((v, idx) => (idx === i || idx === j ? null : v))
      const rows = diffNode.rows.filter((r) =>
        draftMatchesHand(masked, remainingHand(r.hand, interp.ownPlayed)),
      )
      map.set(p, aggregateCells({ ...diffNode, rows }, interp.ownPlayed, { pair: p }))
    }
    return map
  }, [diffNode, interp, chartPairs, draftRem, remLen])

  /** biggest cost anywhere in this node — 0 means the decision is cost-flat */
  const maxEvLoss = useMemo(() => {
    let max = 0
    for (const stats of costStatsByPair.values()) {
      for (const s of stats.values()) max = Math.max(max, s.max)
    }
    return max
  }, [costStatsByPair])

  const rolesInNode = useMemo(() => {
    // read the node's rows directly: pair-cell aggregates are empty at the
    // round-1 exact-block nodes, which left the strategy legend blank exactly
    // where every session starts
    const roles = new Set<ActionRole>()
    if (node && interp) {
      for (const row of node.rows) {
        for (const { role, p } of displayActionsForRow(row, interp.ownPlayed)) {
          if (p > 0) roles.add(role)
        }
      }
    }
    return [...roles].sort((a, b) => roleOrder(a) - roleOrder(b))
  }, [node, interp])

  useEffect(() => {
    if (selectedRole && !rolesInNode.includes(selectedRole)) setSelectedRole(null)
  }, [rolesInNode, selectedRole])

  /** rows that fit the draft's known slots and stay possible alongside the
   *  walked line — the panel and the cell masks read this subset */
  const rowsMatching = useMemo(() => {
    if (!node || !interp) return []
    return node.rows.filter((r) => {
      const rem = remainingHand(r.hand, interp.ownPlayed)
      return remPossible(rem) && draftMatchesHand(draftRem, rem)
    })
  }, [node, interp, draftRem, remPossible])

  const panelAgg = useMemo(
    () => (interp ? aggregateRows(rowsMatching, interp.ownPlayed) : null),
    [rowsMatching, interp],
  )

  /** cells (per pair) that still contain a holding consistent with the draft */
  const compatibleKeys = useMemo(() => {
    const map = new Map<ChartPair, Set<string>>()
    if (!interp) return map
    for (const p of chartPairs) {
      const set = new Set<string>()
      for (const r of rowsMatching) {
        set.add(pairKey(remainingHand(r.hand, interp.ownPlayed), p))
      }
      map.set(p, set)
    }
    return map
  }, [chartPairs, rowsMatching, interp])

  const exactRow =
    draftKnown(draftRem).length === remLen && rowsMatching.length === 1
      ? rowsMatching[0]
      : undefined

  const quality = brQualityForRows(rowsMatching)
  /** Older charts have no BR table, so retain the previous warning as a
   * compatibility fallback rather than pretending their quality was measured. */
  const trainWarn = (() => {
    if (quality) return null
    if (rowsMatching.length === 0 || draftKnown(draftRem).length === 0) return null
    const totalW = Math.max(
      rowsMatching.reduce((s, r) => s + r.w, 0),
      1e-12,
    )
    const selfLoss =
      rowsMatching.reduce((s, r) => s + rowSelfLossPP(r) * r.w, 0) / totalW
    const ownReach =
      rowsMatching.reduce(
        (s, r) => s + (ownReachByHand.get(r.hand.join(',')) ?? 1) * r.w,
        0,
      ) / totalW
    if (ownReach < OWN_REACH_EPS) {
      return t('trainWarnUntrained', {
        role: actorRole ?? '',
        pct: (ownReach * 100).toFixed(2),
      })
    }
    if (selfLoss > untrainedPP) {
      return t('trainWarnWeak', { pp: selfLoss.toFixed(1) })
    }
    return null
  })()

  const technicalQuality = (() => {
    if (!quality || rowsMatching.length === 0) return null
    const totalW = Math.max(rowsMatching.reduce((s, r) => s + r.w, 0), 1e-12)
    return {
      selfLossPP: rowsMatching.reduce((s, r) => s + rowSelfLossPP(r) * r.w, 0) / totalW,
      ownReach:
        rowsMatching.reduce(
          (s, r) => s + (ownReachByHand.get(r.hand.join(',')) ?? 1) * r.w,
          0,
        ) / totalW,
    }
  })()

  /** how often these cards arrive here: joint over deals, share of the range */
  const reach = (() => {
    if (!interp || rootW <= 0 || nodeJointW <= 0) return null
    if (draftKnown(draftRem).length === 0 || rowsMatching.length === 0) return null
    const w = rowsMatching.reduce((s, r) => s + jointRowWeight(r, rootHandWeights), 0)
    return { joint: w / rootW, share: w / nodeJointW }
  })()

  /** small multiples bookkeeping: the effective split (a drafted card takes
   *  it over: [? 3 ?] shows just the M = 3 block), the rows per block, and
   *  which blocks actually render (all of them, or the badge's fixed card) */
  const blocksInfo = useMemo(() => {
    if (!node || !interp || remLen < 3) return null
    const own = interp.ownPlayed
    const split =
      draftRem[blockSplit] !== null
        ? blockSplit
        : ((draftRem.findIndex((v) => v !== null) + 1 || blockSplit + 1) - 1) as 0 | 1 | 2
    const [ax0, ax1] = ([0, 1, 2] as const).filter((i) => i !== split)
    const bySplit = new Map<number, Map<string, ChartRow>>()
    for (const row of node.rows) {
      const rem = remainingHand(row.hand, own)
      const s = rem[split]
      const key = `${rem[ax0]},${rem[ax1]}`
      if (!bySplit.has(s)) bySplit.set(s, new Map())
      bySplit.get(s)!.set(key, row)
    }
    const order = [...Array(N_CLASSES).keys()]
    if (split !== 2) order.reverse()
    const available = order.filter((h) => bySplit.has(h))
    const draftTakeover = draftRem[split] !== null
    let visible = available
    if (draftTakeover) {
      visible = available.filter((h) => h === draftRem[split])
    } else if (blockMode === 'single') {
      const chosen = singleBlock !== null && bySplit.has(singleBlock) ? singleBlock : available[0]
      visible = chosen === undefined ? [] : [chosen]
    }
    return { split, ax0, ax1, bySplit, order, available, visible, draftTakeover }
  }, [node, interp, remLen, draftRem, blockSplit, blockMode, singleBlock])

  /** the badge menu closes when its anchor block stops rendering */
  useEffect(() => {
    if (blockMenuFor === null) return
    if (!blocksInfo || !blocksInfo.visible.includes(blockMenuFor)) setBlockMenuFor(null)
  }, [blocksInfo, blockMenuFor])

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.status}>{error}</p>
        </div>
      </div>
    )
  }

  if (!manifest || !doc || !ctx) {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.status}>{t('unrolling')}</p>
        </div>
      </div>
    )
  }

  const roleWords: RoleWords = { mao: tt('mao'), pe: tt('pe'), vira: t('viraWord') }
  const latticeHint = (() => {
    const solved = manifest.spots.map((s) => spotLabel(s, roleWords)).join(', ')
    const queued = (manifest.queued ?? [])
      .map((q) => `${q.score[0]}x${q.score[1]}`)
      .join(', ')
    return queued ? t('latticeBoth', { solved, queued }) : t('latticeSolved', { solved })
  })()

  /** the 9 action roles named for the legend and role captions */
  const roleLabel = (role: ActionRole): string => {
    switch (role) {
      case 'accept':
        return tt('accept')
      case 'fold':
        return tt('fold')
      case 'raise':
        return tt('raise')
      case 'play-high':
        return tt('playHighest')
      case 'play-mid':
        return tt('playMiddle')
      case 'play-low':
        return tt('playLowest')
      case 'hide-high':
        return tt('hideHighest')
      case 'hide-mid':
        return tt('hideMiddle')
      case 'hide-low':
        return tt('hideLowest')
    }
  }

  /** short label for one observed history step; card/bid tokens stay literal */
  const stepLabel = (code: number): string => {
    if (code === 33 || code === 31) return tt('accept')
    if (code === 34 || code === 32) return tt('fold')
    if (code === 26) return tt('hidden')
    if (code >= 27 && code <= 30) return `truco ${[3, 6, 9, 12][code - 27]}`
    if (code >= 13 && code <= 25) return `${labels[code - 13]}↓`
    return labels[code]
  }

  /** the chart heading for a decision — card recaps stay as literal tokens */
  const chartTitleText = (n: ChartNode): string => {
    const it = interpretNode(n, ctx)
    const { stage } = it
    if (stage.kind === 'eleven') return t('titleEleven')
    if (stage.kind === 'raise-answer') return t('titleAnswerRaise', { n: stage.trick })
    const first = it.plays[0] !== undefined ? stepLabel(it.plays[0]) : '?'
    const second = it.plays[1] !== undefined ? stepLabel(it.plays[1]) : '?'
    if (stage.trick === 1) {
      if (stage.role === 'lead') {
        return elevenOwner(ctx.score) !== null
          ? t('titleR1LeadAfterAccept')
          : t('titleR1Lead')
      }
      return t('titleR1Answer', { card: first })
    }
    const recap = `${first} / ${second}`
    if (stage.role === 'lead') return t('titleRoundLead', { n: stage.trick, recap })
    const next = it.plays[2] !== undefined ? stepLabel(it.plays[2]) : '?'
    return t('titleRoundAnswer', { n: stage.trick, card: next, recap })
  }

  // compare falls back only when the other spot lacks THIS node — blocks and
  // list draw the diff from diffNode directly, and 3-card nodes (opening
  // lead, mão de onze) never have pair cells, so keying the fallback on the
  // cell map silently killed compare exactly where every session starts
  const effectiveView: ViewMode = view === 'diff' && !diffNode ? 'strategy' : view
  const effectiveLayout = layout
  const chartTitle = node ? chartTitleText(node) : null
  const provisionalLabel = spot?.provisional
    ? spot.provisionalNote ?? t('provisionalDefault')
    : null
  const hasBidDiff = rolesInNode.includes('accept') || rolesInNode.includes('fold')

  function cellVisual(pair: ChartPair, h1: number, h2: number): CellVisual | null {
    const cell = cellsByPair.get(pair)?.get(`${h1},${h2}`)
    if (!cell) return null

    if (effectiveView === 'strategy') {
      return strategyCellVisual(cell, selectedRole)
    }

    if (effectiveView === 'range') {
      const mass = massByPair.get(pair)
      const share = mass && mass.total > 0 ? cell.weight / mass.total : 0
      const shade = mass && mass.max > 0 ? cell.weight / mass.max : 0
      return rangeVisual(share, shade)
    }

    if (effectiveView === 'ev') {
      const stats = costStatsByPair.get(pair)?.get(`${h1},${h2}`)
      const loss = stats?.mean ?? 0
      const worstRow = stats?.max ?? 0
      const span = costUnit === 'pts' ? 5 : 25
      return {
        ...costVisual(loss, span),
        // a hot bottom strip marks cells whose worst holding loses far more
        strip: costStrip(loss, worstRow, span, costUnit === 'pts' ? 0.3 : 1),
      }
    }

    // diff
    const other = diffCellsByPair.get(pair)?.get(`${h1},${h2}`)
    if (!other) return emptyVisual()
    const acceptHere = cell.mix.get('accept')
    if (acceptHere !== undefined) {
      return diffAcceptVisual((other.mix.get('accept') ?? 0) - acceptHere)
    }
    return diffTvVisual(tvDistance(cell.mix, other.mix))
  }

  function selKeyFor(pair: ChartPair): string | null {
    const [i, j] = remLen < 3 ? [0, 1] : PAIR_INDICES[pair]
    const a = draftRem[i]
    const b = draftRem[j]
    return a !== null && b !== null ? `${a},${b}` : null
  }

  /** one exact holding's visual under the current view (blocks and list);
   *  the full mix lives in the hover tooltip, so cells carry no native title */
  function rowVisual(row: ChartRow): CellVisual {
    const own = interp?.ownPlayed ?? []
    const untrained = effectiveView !== 'range' && rowUntrained(row)
    if (untrained) {
      return untrainedRowVisual(displayActionsForRow(row, own))
    }
    if (effectiveView === 'range') {
      const share = nodeW > 0 ? row.w / nodeW : 0
      const shade = rangeMaxRowW > 0 ? row.w / rangeMaxRowW : 0
      return rangeVisual(share, shade)
    }
    if (effectiveView === 'ev') {
      return costVisual(rowCost(row, costMode), costUnit === 'pts' ? 5 : 25)
    }
    if (effectiveView === 'diff' && diffNode && interp) {
      const other = diffNode.rows.find(
        (r) => r.hand[0] === row.hand[0] && r.hand[1] === row.hand[1] && r.hand[2] === row.hand[2],
      )
      if (!other) return emptyVisual()
      const a = aggregateRows([row], own)
      const b = aggregateRows([other], own)
      const acc = a.mix.get('accept')
      if (acc !== undefined) {
        return diffAcceptVisual((b.mix.get('accept') ?? 0) - acc)
      }
      return diffTvVisual(tvDistance(a.mix, b.mix))
    }
    // strategy: the printed number is the biggest slice of the mix
    return strategyRowVisual(displayActionsForRow(row, own), selectedRole)
  }

  /** role of an action code relative to a remaining hand, for segment colors */
  function actionRoleOf(code: number, rem: readonly number[]): ActionRole {
    return actionRole(code, rem)
  }

  /** click an exact holding: draft the whole hand, or clear it again */
  function rowClick(rem: readonly number[]) {
    if (draft?.locked) return
    // the line already rules this holding out (future own plays, spent copies)
    if (!remPossible(rem)) return
    if (draftMatchesHand(draftRem, rem) && draftKnown(draftRem).length === rem.length) {
      if (actorRole) setDraftFor(actorRole, null)
      return
    }
    setDraftRem([...rem], null)
    openHandOnInteract()
  }

  function renderChart(pair: ChartPair) {
    const pairCells = cellsByPair.get(pair)
    if (!pairCells) return null
    const selKey = selKeyFor(pair)
    const compat = compatibleKeys.get(pair)
    return (
      <div key={pair} className={cells.gridWrap}>
        {chartPairs.length > 1 ? (
          <span className={styles.chartPairLabel}>
            {pair[0]} · {pair[1]}
          </span>
        ) : null}
        <table className={cells.chart}>
          <thead>
            <tr>
              <th className={cells.axisLabel}>
                {exact ? t('axisHiLo') : `${pair[0]} \\ ${pair[1]}`}
              </th>
              {[...Array(N_CLASSES).keys()].reverse().map((i) => (
                <th key={i}>
                  <ClassMark info={infos[i]} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(N_CLASSES).keys()].reverse().map((h1) => (
              <tr key={h1}>
                <th>
                  <ClassMark info={infos[h1]} />
                </th>
                {[...Array(N_CLASSES).keys()].reverse().map((h2) => {
                  if (h2 > h1) return <td key={h2} className={cells.void} />
                  const key = `${h1},${h2}`
                  const visual = cellVisual(pair, h1, h2)
                  const cell = pairCells.get(key)
                  if (!visual || !cell) return <td key={h2} className={cells.void} />
                  const isSel = selKey === key
                  const masked = !isSel && compat !== undefined && !compat.has(key)
                  const untrained =
                    effectiveView !== 'range' && (untrainedByPair.get(pair)?.has(key) ?? false)
                  const quality = qualityByPair.get(pair)?.get(key)
                  return (
                    <td
                      key={h2}
                      tabIndex={0}
                      title={
                        masked
                          ? t('cellImpossible')
                          : untrained
                            ? t('cellUntrained')
                            : quality
                              ? t(`quality${quality.level[0].toUpperCase()}${quality.level.slice(1)}` as 'qualityGood' | 'qualityCaution' | 'qualityPoor', { pp: quality.gapPP.toFixed(1) })
                            : undefined
                      }
                      className={`${isSel ? cells.cellSel : cells.cell}${masked ? ` ${cells.cellMasked}` : ''}`}
                      aria-label={`${labels[h1]} ${labels[h2]}`}
                      onClick={() => cellClick(pair, h1, h2)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') cellClick(pair, h1, h2)
                      }}
                      onMouseEnter={(e) =>
                        setTooltip({ ...tooltipAnchor(e.currentTarget), h1, h2, pair })
                      }
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {isSel ? (
                        <CellSelectedMark />
                      ) : (
                        <>
                          <ChartCellContent
                            visual={visual}
                            untrained={untrained}
                            stripTitle={t('riskStripTitle')}
                          />
                          {effectiveView === 'strategy' && !exact && cell.spread > 0.2 ? (
                            <span className={cells.split} />
                          ) : null}
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  /** small multiples: one block per card in the split slot — every hand once */
  function renderBlocks() {
    if (!blocksInfo || !interp) return null
    const own = interp.ownPlayed
    const { split, ax0, ax1, bySplit, order, available, visible, draftTakeover } = blocksInfo
    const slotName = (i: number) => 'HML'[i]
    return (
      <div className={cells.blocksWrap}>
        {visible.map((h) => {
          const cellsH = bySplit.get(h)
          if (!cellsH) return null
          const colVals = [...new Set([...cellsH.keys()].map((k) => Number(k.split(',')[1])))].sort(
            (a, b) => b - a,
          )
          return (
            <div key={h} className={cells.block} data-tour-id={`grid-block-${h}`}>
              <span data-tour-id={`grid-badge-${h}`}>
              <BlockBadge
                value={h}
                split={split}
                mode={draftTakeover ? 'single' : blockMode}
                singleValue={visible.length === 1 ? visible[0] : null}
                order={order}
                available={available}
                infos={infos}
                draftLock={draftTakeover}
                open={blockMenuFor === h}
                onOpen={() => setBlockMenuFor(h)}
                onClose={() => setBlockMenuFor(null)}
                onSplit={(i) => setBlockSplit(i)}
                onMode={(m) => {
                  setBlockMode(m)
                  if (m === 'single') setSingleBlock(h)
                }}
                onSingle={(cls) => {
                  setSingleBlock(cls)
                  setBlockMenuFor(null)
                }}
                allowModeToggle
              />
              </span>
              <table className={`${cells.chart} ${cells.blockTable}`}>
                <thead>
                  <tr>
                    <th className={cells.axisLabel}>{`${slotName(ax0)} \\ ${slotName(ax1)}`}</th>
                    {colVals.map((l) => (
                      <th key={l}>
                        <ClassMark info={infos[l]} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...Array(N_CLASSES).keys()].reverse().map((m) => {
                    if (![...Array(N_CLASSES).keys()].some((l) => cellsH.has(`${m},${l}`)))
                      return null
                    const rowCells = colVals.map((l) => {
                      const row = cellsH.get(`${m},${l}`)
                      if (!row) return <td key={l} className={cells.void} />
                      const rem: number[] = []
                      rem[split] = h
                      rem[ax0] = m
                      rem[ax1] = l
                      const visual = rowVisual(row)
                      const isSel =
                        draftKnown(draftRem).length === 3 && draftMatchesHand(draftRem, rem)
                      const impossible = !remPossible(rem)
                      const masked = !isSel && (impossible || !draftMatchesHand(draftRem, rem))
                      return (
                        <td
                          key={l}
                          tabIndex={0}
                          title={impossible ? t('cellImpossible') : undefined}
                          className={`${isSel ? cells.cellSel : cells.cell} ${cells.cellMini}${masked ? ` ${cells.cellMasked}` : ''}`}
                          data-cell={rem.join('-')}
                          aria-label={rem.map((c) => labels[c]).join(' ')}
                          onClick={() => rowClick(rem)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') rowClick(rem)
                          }}
                          onMouseEnter={(e) =>
                            setTooltip({
                              ...tooltipAnchor(e.currentTarget),
                              h1: rem[0],
                              h2: rem[1],
                              pair: 'HM',
                              custom: {
                                cell: aggregateRows([row], own),
                                other:
                                  effectiveView === 'diff' && diffNode
                                    ? (() => {
                                        const o = diffNode.rows.find(
                                          (r) =>
                                            r.hand[0] === row.hand[0] &&
                                            r.hand[1] === row.hand[1] &&
                                            r.hand[2] === row.hand[2],
                                        )
                                        return o ? aggregateRows([o], own) : undefined
                                      })()
                                    : undefined,
                                rem,
                                quality: brQualityForRows([row]),
                              },
                            })
                          }
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {isSel ? <CellSelectedMark /> : <BlockCellContent visual={visual} />}
                        </td>
                      )
                    })
                    return (
                      <tr key={m}>
                        <th>
                          <ClassMark info={infos[m]} />
                        </th>
                        {rowCells}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    )
  }

  /** every holding as one sorted row: hand, mix bar, and the view's number */
  function renderList() {
    if (!node || !interp) return null
    const own = interp.ownPlayed
    const entries = node.rows
      .map((row) => ({ row, rem: remainingHand(row.hand, own) }))
      .sort((a, b) => {
        for (let i = 0; i < a.rem.length; i += 1) {
          if (a.rem[i] !== b.rem[i]) return b.rem[i] - a.rem[i]
        }
        return 0
      })
    return (
      <div className={cells.handList}>
        {entries.map(({ row, rem }) => {
          const visual = rowVisual(row)
          const isSel =
            draftKnown(draftRem).length === rem.length && draftMatchesHand(draftRem, rem)
          const masked = !isSel && (!remPossible(rem) || !draftMatchesHand(draftRem, rem))
          const acts =
            effectiveView === 'strategy' && !selectedRole
              ? displayActionsForRow(row, own)
                  .filter(({ p }) => p > 0)
                  .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
              : null
          const diffOther =
            effectiveView === 'diff' && diffNode
              ? diffNode.rows.find(
                  (r) =>
                    r.hand[0] === row.hand[0] &&
                    r.hand[1] === row.hand[1] &&
                    r.hand[2] === row.hand[2],
                )
              : undefined
          const diffPairActs = diffOther
            ? ([row, diffOther] as const).map((rr) =>
                displayActionsForRow(rr, own)
                  .filter(({ p }) => p > 0)
                  .sort((a, b) => roleOrder(a.role) - roleOrder(b.role)),
              )
            : null
          return (
            <button
              key={rem.join(',')}
              type="button"
              className={`${isSel ? cells.handRowOn : cells.handRow}${masked ? ` ${cells.cellMasked}` : ''}`}
              onClick={() => rowClick(rem)}
              onMouseEnter={(e) =>
                setTooltip({
                  ...tooltipAnchor(e.currentTarget),
                  h1: rem[0],
                  h2: rem[1],
                  pair: 'HM',
                  custom: {
                    cell: aggregateRows([row], own),
                    other: diffOther ? aggregateRows([diffOther], own) : undefined,
                    rem,
                    quality: brQualityForRows([row]),
                  },
                })
              }
              onMouseLeave={() => setTooltip(null)}
            >
              <span className={cells.handRowCards}>
                {rem.map((c, i) => (
                  <span key={i} className={cells.handRowCard}>
                    <ClassMark info={infos[c]} />
                  </span>
                ))}
              </span>
              <span
                className={`${cells.handRowBar}${visual.untrained ? ` ${cells.untrainedFill}` : ''}`}
                aria-hidden
              >
                {diffPairActs && !visual.untrained ? (
                  <ListRowDuoBar
                    sides={diffPairActs}
                    tags={[t('here'), t('there')]}
                    roleOf={(code) => actionRoleOf(code, rem)}
                  />
                ) : acts && !visual.untrained ? (
                  <ListRowMixBar
                    acts={acts}
                    roleOf={(code) => actionRoleOf(code, rem)}
                    label={stepLabel}
                  />
                ) : (
                  visual.fill
                )}
              </span>
              {effectiveView === 'strategy' || effectiveView === 'diff' ? (
                <span className={cells.handRowVal}>{visual.untrained ? '≈' : selectedRole ? visual.text : ''}</span>
              ) : (
                <span className={cells.handRowVal}>{visual.text}</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <span className={styles.kicker}>{t('mastheadKicker')}</span>
          <h1>{t('mastheadTitle')}</h1>
          <div className={styles.studyLanguage}>
            <LanguagePicker variant="guide" />
          </div>
        </header>

        <div className={styles.plaque} role="toolbar" aria-label={t('spotSelector')} data-tour="score">
          <div className={styles.group}>
            <span className={styles.groupLabel}>{t('score')}</span>
            <label className={styles.scoreRole}>
              <span className={styles.scoreRoleName}>{tt('mao')} · {t('leads')}</span>
              <input
                type="number"
                min={0}
                max={11}
                className={styles.scoreField}
                value={roleScores.mao}
                aria-label={t('maoScoreAria')}
                title={latticeHint}
                onChange={(e) => changeScore('mao', e.target.value)}
              />
            </label>
            <span className={styles.scoreX}>×</span>
            <label className={styles.scoreRole}>
              <span className={styles.scoreRoleName}>{tt('pe')} · {t('dealer')}</span>
              <input
                type="number"
                min={0}
                max={11}
                className={styles.scoreField}
                value={roleScores.pe}
                aria-label={t('peScoreAria')}
                title={latticeHint}
                onChange={(e) => changeScore('pe', e.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.swapBtn}
              title={t('swapTitle')}
              aria-label={t('swapAria')}
              onClick={() => selectRoleScores(roleScores.pe, roleScores.mao)}
            >
              ⇄
            </button>
            {scoreStatus ? <span className={styles.chipTag}>{scoreStatus}</span> : null}
            {provisionalLabel ? (
              <span className={styles.chipTag} title={provisionalLabel}>
                {t('provisional')}
              </span>
            ) : null}
          </div>
          <div className={styles.group}>
            <span className={styles.groupLabel}>{t('vira')}</span>
            <ViraPicker
              variant="chip"
              tc={doc.tc}
              rank={displayViraRank}
              byTc={viraSpotByTc}
              onPick={selectSpotIndex}
            />
          </div>
          <div className={styles.helpGroup} data-tour="help">
            <button
              type="button"
              className={styles.helpFab}
              aria-haspopup="menu"
              aria-expanded={helpOpen}
              aria-label={t('helpAria')}
              title={t('helpAria')}
              onClick={() => setHelpOpen((v) => !v)}
            >
              ?
            </button>
            {helpOpen ? (
              <>
                <div className={styles.menuBackdrop} onClick={() => setHelpOpen(false)} />
                <div
                  role="menu"
                  aria-label={t('helpAria')}
                  className={styles.helpMenu}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setHelpOpen(false)
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.helpMenuItem}
                    title={t('tourTitle')}
                    onClick={() => {
                      setHelpOpen(false)
                      setTourOpen(true)
                    }}
                  >
                    {t('menuTour')}
                  </button>
                  <a
                    role="menuitem"
                    className={styles.helpMenuItem}
                    href={`/${locale}/lab/study/guide`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('guideAria')}
                    title={t('guideTitle')}
                    onClick={() => setHelpOpen(false)}
                  >
                    {t('menuGuide')} ↗
                  </a>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.helpMenuItem}
                    data-testid="study-lab-play-hand-button"
                    disabled={playBusy || !playSeed?.ok}
                    aria-label={t('menuPlayHandAria')}
                    title={
                      playSeed?.ok
                        ? solverBotEnabled
                          ? t('menuPlayHandTitle')
                          : t('menuPlayHandHeuristicTitle')
                        : t('menuPlayHandOver')
                    }
                    onClick={() => {
                      if (!playSeed?.ok || playBusy) return
                      setPlayBusy(true)
                      setPlayError(null)
                      void createSeededBotSession({
                        humanPlayer: playSeed.seed.humanPlayer,
                        score: playSeed.seed.score,
                        dealer: playSeed.seed.dealer,
                        viraRank: playSeed.seed.viraRank,
                        heroHand: playSeed.seed.heroHand,
                        villainHand: playSeed.seed.villainHand,
                        history: playSeed.seed.history,
                        botKind: solverBotEnabled ? 'solver' : 'heuristic',
                      })
                        .then((session) => {
                          window.location.href = `/${locale}/?match=${session.matchId}`
                        })
                        .catch((error: unknown) => {
                          setPlayBusy(false)
                          setPlayError(
                            error instanceof Error ? error.message : t('menuPlayHandFailed'),
                          )
                        })
                    }}
                  >
                    {playBusy ? t('menuPlayHandBusy') : t('menuPlayHand')} ↗
                  </button>
                  {playSeed && !playSeed.ok ? (
                    <div className={styles.helpMenuItem}>{t('menuPlayHandOver')}</div>
                  ) : null}
                  {playError ? (
                    <div className={styles.helpMenuItem} role="alert">
                      {playError}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            <button
              type="button"
              className={styles.settingsFab}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              aria-label={t('settingsAria')}
              title={t('settingsAria')}
              data-testid="study-lab-settings-button"
              onClick={() => setSettingsOpen(true)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.stringBar}>
          <span className={styles.stringLabel} title={t('stringTitle')}>
            {t('handLabel')}
          </span>
          <a
            className={styles.stringHelp}
            href={`/${locale}/lab/study/guide/notation`}
            target="_blank"
            rel="noreferrer"
            aria-label={t('handHelpAria')}
            title={t('handHelpAria')}
          >
            ?
          </a>
          <input
            type="text"
            spellCheck={false}
            className={styles.stringField}
            value={stringDraft ?? serialized}
            aria-label={t('handStringAria')}
            onChange={(e) => setStringDraft(e.target.value)}
            onFocus={(e) => setStringDraft(e.target.value)}
            onBlur={() => {
              setStringDraft(null)
              setStringError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyStudyStringInput((e.target as HTMLInputElement).value)
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
          />
          <button
            type="button"
            className={styles.stringBtn}
            title={t('saveTitle')}
            onClick={() => {
              const blob = new Blob([`${serialized}\n`], { type: 'text/plain' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `${serialized.replace(/[^\w x·-]+/g, ' ').trim().replace(/\s+/g, '-')}.truco`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            {t('save')}
          </button>
          <label className={styles.stringBtn} title={t('openTitle')}>
            {t('open')}
            <input
              type="file"
              accept=".truco,.txt,text/plain"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const text = (await file.text()).split('\n')[0].trim()
                if (text) applyStudyStringInput(text)
              }}
            />
          </label>
          {stringError ? <span className={styles.stringError}>{stringError}</span> : null}
        </div>

        <div className={styles.layout}>
          <div data-tour="rail">
          {/* the mini-table docks right above the timeline whose cursor it
              mirrors. Raw cursor, not viewed.k: past the last chart node (a
              fold, round 3) the charts clamp but the table still shows the
              line */}
          <StudyTableView
            ctx={ctx}
            line={line}
            k={Math.min(cursor, line.length)}
            infos={infos}
            drafts={drafts}
            viraRankLabel={displayViraRank}
            open={tableOpen}
            onToggle={() => setTableOpen((v) => !v)}
            nav={tableNav}
          />
          <StudyTimeline
            decisions={decisions}
            terminal={terminal}
            cursorK={viewed?.k ?? 0}
            labels={labels}
            deepLoading={deepLoading}
            rootW={rootW}
            pins={(['mão', 'pé'] as const)
              .filter((r) => drafts[r]?.locked)
              .map((r) => ({ role: r, slots: drafts[r]!.slots }))}
            onUnpin={(role) => {
              const cur = drafts[role]
              if (cur) setDraftFor(role, { ...cur, locked: false })
            }}
            onView={viewDecision}
            onPick={pickAction}
            onReset={resetLine}
            actionAvailable={decisionActionAvailable}
          />
          </div>

          <section className={styles.sheet} aria-label={t('strategyChartAria')} data-tour="chart">
            {node && interp && chartTitle ? (
              <>
                <div className={styles.sheetHead} data-tour="acthead">
                  <div className={styles.headMain}>
                    <div className={styles.actorLine}>
                      <span className={actorRole === 'pé' ? styles.actorPlatePe : styles.actorPlateMao}>
                        {actorRole === 'pé' ? `${tt('pe')} · ${t('dealerToAct')}` : `${tt('mao')} ${t('toAct')}`}
                      </span>
                    </div>
                    <h2>{chartTitle}</h2>
                    {viewed?.stage.kind === 'eleven' ? (
                      <a
                        className={styles.handbookLink}
                        href={`/${locale}/lab/study/guide/eleven`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t('elevenHandbookAria')}
                        title={t('elevenHandbookAria')}
                      >
                        {t('elevenHandbook')} ↗
                      </a>
                    ) : null}
                    {provisionalLabel ? (
                      <p className={styles.sheetNote}>
                        <b>{provisionalLabel}</b>
                      </p>
                    ) : null}
                  </div>
                  {nodeEquity !== null || rootW > 0 ? (
                    <div className={styles.headStats} data-tour="stats">
                      {nodeEquity !== null ? (
                        <div className={styles.stat} title={t('equityTitle')}>
                          <span className={styles.statLabel}>
                            {t('statEquityLabel', { actor: actorRole === 'pé' ? tt('pe') : tt('mao') })}
                          </span>
                          <span className={styles.statValue}>{nodeEquity.toFixed(1)}%</span>
                          <span className={styles.statSub}>
                            {t('statEquitySub', {
                              other: actorRole === 'pé' ? tt('mao') : tt('pe'),
                              pct: (100 - nodeEquity).toFixed(1),
                            })}
                          </span>
                        </div>
                      ) : null}
                      {rootW > 0 ? (
                        <div className={styles.stat} title={t('reachChipTitle')}>
                          <span className={styles.statLabel}>{t('statReachLabel')}</span>
                          <span className={styles.statValue}>{fmtPct(arrival)}%</span>
                          <span className={styles.statSub}>{t('statReachSub')}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={styles.stickyBar}>
                  <div className={styles.views} role="tablist" aria-label={t('viewMode')} data-tour="views">
                    <button type="button" className={effectiveView === 'strategy' ? styles.viewBtnOn : styles.viewBtn} onClick={() => setView('strategy')}>
                      {t('viewStrategy')}
                    </button>
                    <button type="button" className={effectiveView === 'range' ? styles.viewBtnOn : styles.viewBtn} onClick={() => setView('range')}>
                      {t('viewRange')}
                    </button>
                    <button type="button" className={effectiveView === 'ev' ? styles.viewBtnOn : styles.viewBtn} onClick={() => setView('ev')}>
                      {t('viewCost')}
                    </button>
                    <ComparePicker
                      manifest={manifest}
                      spotIdx={spotIdx}
                      diffIdx={diffIdx}
                      active={effectiveView === 'diff'}
                      onPick={(i) => {
                        setDiffIdx(i)
                        setView('diff')
                      }}
                      onOff={() => setView('strategy')}
                    />
                    <span className={styles.viewDivider} aria-hidden />
                    <div className={styles.segGroup} role="group" aria-label={t('layout')}>
                      {(['grid', 'list'] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          className={effectiveLayout === l ? styles.segBtnOn : styles.segBtn}
                          title={l === 'grid' ? t('gridTitle') : t('listTitle')}
                          onClick={() => setLayout(l)}
                        >
                          {l === 'grid' ? t('grid') : t('list')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.legend} data-tour="legend">
                  {effectiveView === 'strategy' ? (
                    <>
                      {rolesInNode.map((role) => (
                        <button
                          key={role}
                          type="button"
                          className={selectedRole === role ? styles.legendRoleOn : styles.legendRole}
                          aria-pressed={selectedRole === role}
                          style={{ borderColor: selectedRole === role ? ROLE_COLORS[role] : undefined }}
                          onClick={() => setSelectedRole((current) => (current === role ? null : role))}
                        >
                          <span className={styles.swatch} style={{ background: ROLE_COLORS[role] }} />
                          {roleLabel(role)}
                        </button>
                      ))}

                    </>
                  ) : effectiveView === 'range' ? (
                    <div className={styles.rangeLegend} aria-label={t('legendRangeTitle')}>
                      <span className={styles.rangeLegendTitle}>{t('legendRangeTitle')}</span>
                      <span className={styles.rangeLegendItem}>
                        <span className={styles.rangeLegendNumber} aria-hidden>0.6%</span>
                        <span>{t('legendRangeNumber', { actor: actorRole ?? '' })}</span>
                      </span>
                      <span className={styles.rangeLegendItem}>
                        <span className={styles.rangeLegendDot} aria-hidden>·</span>
                        <span>{t('legendRangeDot')}</span>
                      </span>
                      <span className={styles.rangeLegendItem}>
                        <span className={styles.rangeLegendMasked} aria-hidden />
                        <span>{t('legendRangeMasked')}</span>
                      </span>
                    </div>
                  ) : effectiveView === 'ev' ? (
                    <>
                      <span className={styles.costModes}>
                        {(['habit', 'worst'] as CostMode[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={costMode === m ? styles.costModeBtnOn : styles.costModeBtn}
                            title={m === 'habit' ? t('costHabitTitle') : t('costWorstTitle')}
                            onClick={() => setCostMode(m)}
                          >
                            {m === 'habit' ? t('costHabit') : t('costWorst')}
                          </button>
                        ))}
                      </span>
                      <button
                        type="button"
                        className={ignoreHides ? styles.costModeBtnOn : styles.costModeBtn}
                        aria-pressed={ignoreHides}
                        title={t('ignoreHidesTitle')}
                        onClick={() => setIgnoreHides((v) => !v)}
                      >
                        {t('ignoreHides')}
                      </button>
                      <span className={styles.costModes}>
                        {(['pts', 'win'] as CostUnit[]).map((u) => (
                          <button
                            key={u}
                            type="button"
                            className={costUnit === u ? styles.costModeBtnOn : styles.costModeBtn}
                            title={u === 'pts' ? t('unitPtsTitle') : t('unitWinTitle')}
                            onClick={() => {
                              unitTouched.current = true
                              setCostUnit(u)
                            }}
                          >
                            {u === 'pts' ? t('unitPoints') : t('unitEquity')}
                          </button>
                        ))}
                      </span>
                      {maxEvLoss < 0.05 ? (
                        <span>
                          {costMode === 'habit' ? t('costFlatHabit') : t('costFlatWorst')}
                        </span>
                      ) : (
                        <span>
                          <span className={styles.swatch} style={{ background: mixColor(PAPER, COST_INK, 1) }} />
                          {t('legendEv', {
                            unit: costUnit === 'pts' ? t('unitHandPoints') : t('unitMatchWinPp'),
                            action: costMode === 'habit' ? t('costHabit') : t('actionWorstAvailable'),
                          })}
                        </span>
                      )}
                    </>
                  ) : hasBidDiff ? (
                    <>
                      <span>
                        <span className={styles.swatch} style={{ background: mixColor(PAPER, GREEN, 0.8) }} />
                        {t('legendAcceptsMore', {
                          spot: diffSpot ? spotLabel(diffSpot, roleWords) : t('theOtherSpot'),
                        })}
                      </span>
                      <span>
                        <span className={styles.swatch} style={{ background: mixColor(PAPER, RED, 0.8) }} />
                        {t('legendFoldsMore')}
                      </span>
                    </>
                  ) : (
                    <span>
                      <span className={styles.swatch} style={{ background: mixColor(PAPER, DIFF_INK, 0.8) }} />
                      {t('legendDiff')}
                    </span>
                  )}
                  <a
                    className={styles.legendHelp}
                    href={`/${locale}/lab/study/guide/views`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('legendHelpAria')}
                    title={t('legendHelpAria')}
                  >
                    ?
                  </a>
                  </div>
                </div>

                <div className={styles.chartsCol}>
                  {effectiveLayout === 'list'
                    ? renderList()
                    : exact
                      ? chartPairs.map((p) => renderChart(p))
                      : renderBlocks()}
                </div>
              </>
            ) : (
              <div className={styles.sheetEmpty}>
                <h2>{t('noChartTitle')}</h2>
                <p>
                  {deepLoading ? t('loadingDeeper') : t('noChartBody')}
                </p>
              </div>
            )}
          </section>

          <aside data-tour="pinned">
            <div className={styles.detail} ref={handPanelRef}>
              <div className={styles.detailHead} data-tour="hand-head">
                <button
                  type="button"
                  className={styles.detailToggle}
                  aria-expanded={handOpen}
                  aria-label={handOpen ? t('collapsePanel') : t('expandPanel')}
                  onClick={toggleHandPanel}
                >
                  <span className={styles.kicker} style={{ color: 'var(--brass-0, #8a6a28)' }}>
                    {t('handOfRole', { role: actorRole === 'pé' ? tt('pe') : tt('mao') })}
                  </span>
                  <span className={styles.detailChevron} aria-hidden>{handOpen ? '▾' : '▸'}</span>
                </button>
                {draftKnown(draftRem).length > 0 ? (
                  <button
                    type="button"
                    className={draft?.locked ? styles.pinBtnOn : styles.pinBtn}
                    data-tour-id="hand-pin"
                    aria-pressed={draft?.locked ?? false}
                    title={draft?.locked ? t('unpinTitle') : t('pinTitle')}
                    onClick={togglePin}
                  >
                    {draft?.locked ? t('unpin') : t('pin')}
                  </button>
                ) : null}
              </div>
              {handOpen && (node && interp && panelAgg ? (
                <PinnedHand
                  node={node}
                  interp={interp}
                  exact={exact}
                  draftRem={draftRem}
                  focusSlot={draft?.focus ?? null}
                  agg={panelAgg}
                  matching={rowsMatching.length}
                  exactRow={exactRow}
                  labels={labels}
                  infos={infos}
                  playableCodes={new Set((viewed?.options ?? []).map((o) => o.code))}
                  copiesLeft={copiesLeftOutside}
                  futureOwn={futureOwnPlays}
                  remPossible={remPossible}
                  locked={draft?.locked ?? false}
                  costUnit={costUnit}
                  role={actorRole ?? 'mão'}
                  reach={reach}
                  quality={quality}
                  technicalQuality={technicalQuality}
                  trainWarn={trainWarn}
                  onSetSlot={setSlot}
                  onSwapSlots={swapSlots}
                  onPlayCard={playCard}
                />
              ) : (
                <p className={styles.caption}>
                  {t('noChartHere')}
                </p>
              ))}
            </div>
          </aside>
        </div>
      </div>

      <StudyWalkthrough
        open={tourOpen}
        onClose={closeTour}
        tour={{
          apply: applyStudyStringInput,
          setView,
          setLayout,
          openHand: () => {
            handAutoOpenRef.current = true
            setHandOpen(true)
          },
          focusDecision: (k: number) => setCursor(k),
          ready: manifest !== null,
        }}
        observe={{ line, cursor: viewed?.k ?? 0, drafts }}
      />

      {pendingConfirm ? (
        <ConfirmModal
          title={pendingConfirm.title}
          body={pendingConfirm.body}
          detail={pendingConfirm.detail}
          notes={pendingConfirm.notes}
          confirmLabel={pendingConfirm.confirmLabel}
          cancelLabel={t('keepIt')}
          suppressLabel={pendingConfirm.allowSuppress ? t('dontAskAgain') : null}
          onConfirm={confirmProceed}
          onCancel={() => setPendingConfirm(null)}
        />
      ) : null}

      {pendingChoice ? (
        <EditChoiceModal
          title={t('replaceTitle')}
          body={pendingChoice.body}
          keepLabel={t('editChoiceKeep')}
          keepDetail={pendingChoice.keep.detail}
          keepNotes={pendingChoice.keep.notes}
          resetLabel={t('editChoiceReset')}
          resetDetail={pendingChoice.reset.detail}
          resetNotes={pendingChoice.reset.notes}
          rememberLabel={t('dontAskAgain')}
          rememberTitle={t('rememberChoiceTitle')}
          cancelLabel={t('keepIt')}
          onChoose={choiceProceed}
          onCancel={() => setPendingChoice(null)}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsModal
          askDestructive={askDestructive}
          onAskDestructive={persistAskDestructive}
          editHistoryMode={editHistoryMode}
          onEditHistoryMode={persistEditHistoryMode}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {tooltip ? (
        <Tooltip
          state={tooltip}
          cell={tooltip.custom?.cell ?? cellsByPair.get(tooltip.pair)?.get(`${tooltip.h1},${tooltip.h2}`)}
          other={
            tooltip.custom
              ? tooltip.custom.other
              : diffCellsByPair.get(tooltip.pair)?.get(`${tooltip.h1},${tooltip.h2}`)
          }
          otherName={diffSpot && effectiveView === 'diff' ? spotLabel(diffSpot, roleWords) : null}
          exact={exact}
          labels={labels}
          quality={tooltip.custom?.quality ?? qualityByPair.get(tooltip.pair)?.get(`${tooltip.h1},${tooltip.h2}`) ?? null}
        />
      ) : null}
    </div>
  )
}

function ConfirmModal({
  title,
  body,
  detail,
  notes,
  confirmLabel,
  cancelLabel,
  suppressLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  detail?: string
  /** consequence sentences (affected drafted/pinned hands), shown emphasized */
  notes?: string[]
  confirmLabel: string
  cancelLabel: string
  /** when set, offer a "don't ask again" checkbox with this label */
  suppressLabel?: string | null
  onConfirm: (dontAskAgain: boolean) => void
  onCancel: () => void
}) {
  const [dontAsk, setDontAsk] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm(dontAsk)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm, dontAsk])
  return (
    <div className={styles.modalBackdrop} role="presentation" data-tour="confirm" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className={styles.confirmBox}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.confirmTitle}>{title}</h2>
        <p className={styles.confirmBody}>{body}</p>
        {detail ? <p className={styles.confirmDetail}>{detail}</p> : null}
        {(notes ?? []).map((note) => (
          <p key={note} className={styles.confirmNote}>
            {note}
          </p>
        ))}
        {suppressLabel ? (
          <label className={styles.confirmSuppress}>
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
            />
            {suppressLabel}
          </label>
        ) : null}
        <div className={styles.confirmBtns}>
          <button type="button" className={styles.confirmCancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={styles.confirmGo} onClick={() => onConfirm(dontAsk)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** the keep-vs-reset fork on an earlier-action edit — one stacked button per
 *  outcome, each stating its own consequences, so choosing needs no second
 *  confirmation. The remember checkbox saves whichever button is pressed. */
function EditChoiceModal({
  title,
  body,
  keepLabel,
  keepDetail,
  keepNotes,
  resetLabel,
  resetDetail,
  resetNotes,
  rememberLabel,
  rememberTitle,
  cancelLabel,
  onChoose,
  onCancel,
}: {
  title: string
  body: string
  keepLabel: string
  keepDetail: string
  keepNotes: string[]
  resetLabel: string
  resetDetail: string
  resetNotes: string[]
  rememberLabel: string
  rememberTitle: string
  cancelLabel: string
  onChoose: (which: 'keep' | 'reset', dontAskAgain: boolean) => void
  onCancel: () => void
}) {
  const [remember, setRemember] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  const option = (which: 'keep' | 'reset', label: string, detail: string, notes: string[]) => (
    <button
      type="button"
      className={styles.choiceOption}
      data-testid={`study-edit-${which}`}
      onClick={() => onChoose(which, remember)}
    >
      <span className={styles.choiceLabel}>{label}</span>
      <span className={styles.choiceDetail}>{detail}</span>
      {notes.map((note) => (
        <span key={note} className={styles.choiceNote}>
          {note}
        </span>
      ))}
    </button>
  )
  return (
    <div className={styles.modalBackdrop} role="presentation" data-tour="confirm" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className={styles.confirmBox}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.confirmTitle}>{title}</h2>
        <p className={styles.confirmBody}>{body}</p>
        <div className={styles.choiceOptions}>
          {option('keep', keepLabel, keepDetail, keepNotes)}
          {option('reset', resetLabel, resetDetail, resetNotes)}
        </div>
        <label className={styles.confirmSuppress} title={rememberTitle}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {rememberLabel}
        </label>
        <div className={styles.confirmBtns}>
          <button type="button" className={styles.confirmCancel} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** lab preferences behind the cog — the destructive-change confirmation and
 *  the remembered answer of the keep-vs-reset question */
function SettingsModal({
  askDestructive,
  onAskDestructive,
  editHistoryMode,
  onEditHistoryMode,
  onClose,
}: {
  askDestructive: boolean
  onAskDestructive: (v: boolean) => void
  editHistoryMode: EditHistoryMode
  onEditHistoryMode: (v: EditHistoryMode) => void
  onClose: () => void
}) {
  const t = useTranslations('Study.lab')
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const modes: EditHistoryMode[] = ['ask', 'keep', 'reset']
  const modeCopy: Record<EditHistoryMode, { name: string; desc: string }> = {
    ask: { name: t('settingsEditAsk'), desc: t('settingsEditAskDesc') },
    keep: { name: t('settingsEditKeep'), desc: t('settingsEditKeepDesc') },
    reset: { name: t('settingsEditReset'), desc: t('settingsEditResetDesc') },
  }
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('settingsTitle')}
        className={styles.confirmBox}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.confirmTitle}>{t('settingsTitle')}</h2>
        <label className={styles.settingsCheck}>
          <input
            type="checkbox"
            checked={askDestructive}
            onChange={(e) => onAskDestructive(e.target.checked)}
          />
          <span className={styles.settingsText}>
            <span className={styles.settingsName}>{t('settingAskDestructive')}</span>
            <span className={styles.settingsDesc}>{t('settingAskDestructiveDesc')}</span>
          </span>
        </label>
        <fieldset className={styles.settingsGroup}>
          <legend className={styles.settingsLegend}>{t('settingsEditLegend')}</legend>
          {modes.map((m) => (
            <label key={m} className={styles.settingsCheck}>
              <input
                type="radio"
                name="edit-history-mode"
                checked={editHistoryMode === m}
                onChange={() => onEditHistoryMode(m)}
              />
              <span className={styles.settingsText}>
                <span className={styles.settingsName}>{modeCopy[m].name}</span>
                <span className={styles.settingsDesc}>{modeCopy[m].desc}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className={styles.confirmBtns}>
          <button type="button" className={styles.confirmGo} onClick={onClose}>
            {t('settingsClose')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ViraPicker({
  tc,
  rank,
  byTc,
  onPick,
  variant,
}: {
  tc: number
  /** concrete display rank; several ranks may share this `tc` solve */
  rank: string
  /** solved spot index per vira class, for the current score and position */
  byTc: Map<number, number>
  onPick: (spotIdx: number, rank: string) => void
  variant: 'card' | 'chip'
}) {
  const t = useTranslations('Study.lab')
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.viraAnchor}>
      <button
        type="button"
        className={variant === 'card' ? styles.viraCard : styles.chipOn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('viraChangeAria', { rank })}
        title={byTc.size > 1 || viraRanks(tc).length > 1 ? t('chooseVira') : t('viraSolving', { rank })}
        onClick={() => setOpen((v) => !v)}
      >
        {variant === 'card' ? (
          <>
            <span className={styles.viraKicker}>{t('viraKicker')}</span>
            <span className={styles.viraRank}>{rank}</span>
            <span className={cells.anyPips}>♦♠♥♣</span>
          </>
        ) : (
          <>{rank} ▾</>
        )}
      </button>
      {open ? (
        <>
          <div className={styles.menuBackdrop} onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={t('chooseViraAria')}
            className={styles.viraMenu}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
          >
            {viraChoices().map(({ rank: choiceRank, tc: choiceTc }) => {
              const idx = byTc.get(choiceTc)
              return (
                <button
                  key={choiceRank}
                  type="button"
                  role="menuitemradio"
                  aria-checked={choiceTc === tc && rank === choiceRank}
                  disabled={idx === undefined}
                  className={choiceTc === tc && rank === choiceRank ? styles.viraOptOn : styles.viraOpt}
                  onClick={() => {
                    if (idx !== undefined) onPick(idx, choiceRank)
                    setOpen(false)
                  }}
                >
                  {choiceRank}
                </button>
              )
            })}
            <span className={styles.viraMenuNote}>{t('viraGreyNote')}</span>
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * The brass block badge is THE blocks control (plan 77 K-1): clicking `L = 4`
 * opens a paper menu that picks the H/M/L split, toggles all-blocks vs a
 * single fixed-card chart, and — in single-chart mode — chooses the fixed
 * card. Same backdrop/menu pattern and keyboard behavior as the vira picker.
 */
function Tooltip({
  state,
  cell,
  other,
  otherName,
  exact,
  labels,
  quality,
}: {
  state: TooltipState
  cell: CellAgg | undefined
  other: CellAgg | null | undefined
  otherName: string | null
  exact: boolean
  labels: string[]
  quality: QualitySummary | null
}) {
  const t = useTranslations('Study.lab')
  const tt = useTranslations('Study.terms')
  const roleText = (role: ActionRole): string => {
    if (role === 'accept') return tt('accept')
    if (role === 'fold') return tt('fold')
    if (role === 'raise') return tt('raise')
    const verb = role.startsWith('hide') ? tt('hide') : tt('play')
    if (exact) {
      return role.endsWith('high') ? `${verb} ${labels[state.h1]}` : `${verb} ${labels[state.h2]}`
    }
    const slot = role.endsWith('high') ? 0 : role.endsWith('mid') ? 1 : 2
    const rem = state.custom?.rem
    if (rem && rem.length === 3) return `${verb} ${labels[rem[slot]]}`
    const [i, j] = PAIR_INDICES[state.pair]
    if (slot === i) return `${verb} ${labels[state.h1]}`
    if (slot === j) return `${verb} ${labels[state.h2]}`
    return tt('otherCard')
  }
  if (!cell) return null
  const mix = [...cell.mix.entries()]
    .filter(([, p]) => p > 0)
    .sort((a, b) => roleOrder(a[0]) - roleOrder(b[0]))
  // anchored to the hovered cell (which already names its cards) — the rows
  // carry the actions, so no card-list header repeating what's under the cursor
  const maxLeft = typeof window !== 'undefined' ? window.innerWidth - 280 : state.x
  return (
    <div
      className={styles.tooltip}
      role="status"
      data-tour="tooltip"
      style={{
        left: Math.max(8, Math.min(state.x - 30, maxLeft)),
        top: state.place === 'above' ? state.y - 8 : state.y + 8,
        transform: state.place === 'above' ? 'translateY(-100%)' : undefined,
      }}
    >
      {other && otherName ? (
        <div className={styles.tipTable}>
          <span />
          <span className={styles.tooltipSub}>{t('here')}</span>
          <span className={styles.tooltipSub}>{t('there')}</span>
          {[...new Set([...cell.mix.keys(), ...other.mix.keys()])]
            .sort((a, b) => roleOrder(a) - roleOrder(b))
            .map((role) => (
              <Fragment key={role}>
                <span>{roleText(role)}</span>
                <b>{((cell.mix.get(role) ?? 0) * 100).toFixed(0)}%</b>
                <b>{((other.mix.get(role) ?? 0) * 100).toFixed(0)}%</b>
              </Fragment>
            ))}
        </div>
      ) : (
        mix.map(([role, p]) => (
          <div key={role}>
            {roleText(role)} <b>{(p * 100).toFixed(1)}%</b> · {t('win')}{' '}
            {(50 + (cell.q.get(role) ?? 0) * 50).toFixed(1)}%
          </div>
        ))
      )}
      {quality ? (
        <p className={styles.tooltipQuality}>
          {t(`quality${quality.level[0].toUpperCase()}${quality.level.slice(1)}` as 'qualityGood' | 'qualityCaution' | 'qualityPoor', { pp: quality.gapPP.toFixed(1) })}
        </p>
      ) : null}
    </div>
  )
}

function PinnedHand({
  node,
  interp,
  exact,
  draftRem,
  focusSlot,
  agg,
  matching,
  exactRow,
  labels,
  infos,
  playableCodes,
  copiesLeft,
  futureOwn,
  remPossible,
  locked,
  costUnit,
  role,
  reach,
  quality,
  technicalQuality,
  trainWarn,
  onSetSlot,
  onSwapSlots,
  onPlayCard,
}: {
  node: ChartNode
  interp: NodeInterp
  exact: boolean
  /** remaining-hand slots, strongest first, null = unknown */
  draftRem: HandDraft
  focusSlot: number | null
  agg: CellAgg
  matching: number
  exactRow: ChartRow | undefined
  labels: string[]
  infos: ClassInfo[]
  playableCodes: Set<number>
  /** deck copies of a class still available before counting this hand */
  copiesLeft: (cls: number) => number
  /** the actor's plays after this node — the drafted hand must still fit them */
  futureOwn: readonly number[]
  /** whether a fully-known remaining hand stays possible alongside the line */
  remPossible: (rem: readonly number[]) => boolean
  /** the hand is pinned for the whole walk — editing pauses */
  locked: boolean
  /** the Cost currency, used for the per-action cost suffixes */
  costUnit: CostUnit
  role: 'mão' | 'pé'
  /** how often these cards arrive here: joint over all deals, share of the range */
  reach: { joint: number; share: number } | null
  /** Adversarial per-info-set quality from the optional full-tree BR pass. */
  quality: QualitySummary | null
  /** Former proxy diagnostics, kept as an explanation under measured quality. */
  technicalQuality: { selfLossPP: number; ownReach: number } | null
  /** legacy-export fallback, when no BR table exists for this spot */
  trainWarn: string | null
  onSetSlot: (idx: number, value: number | null) => void
  /** drag one slot onto another: the contents swap and the hand re-sorts */
  onSwapSlots: (a: number, b: number) => void
  onPlayCard: (cls: number) => void
}) {
  const t = useTranslations('Study.lab')
  const tt = useTranslations('Study.terms')
  const [menuSlot, setMenuSlot] = useState<number | null>(null)
  /** the card a single click just cleared, so a double click can restore it */
  const restore = useRef<{ i: number; v: number } | null>(null)
  const remLen = draftRem.length
  const knownCount = draftKnown(draftRem).length
  const slotNames =
    remLen >= 3
      ? [t('slotHighest'), t('slotMiddle'), t('slotLowest')]
      : [t('slotHigher'), t('slotLower')]

  /** copies of `cls` this hand already uses, ignoring one slot */
  function handUses(cls: number, exceptSlot: number): number {
    const inDraft = draftRem.reduce(
      (n: number, v, idx) => n + (idx !== exceptSlot && v === cls ? 1 : 0),
      0,
    )
    return inDraft + interp.ownPlayed.filter((c) => c === cls).length
  }

  /** copies of each class the deck still offers this remaining hand */
  function availRem(cls: number): number {
    return copiesLeft(cls) - interp.ownPlayed.filter((c) => c === cls).length
  }

  /** whether picking `v` for slot `i` still leaves a real, playable hand */
  function slotChoiceFits(i: number, v: number): boolean {
    return draftCompletable(draftSetSlot(draftRem, i, v), availRem, futureOwn)
  }

  /** name a role by the actual card when its slot is known */
  function roleName(role: ActionRole): string {
    if (role === 'accept') return tt('accept')
    if (role === 'fold') return tt('fold')
    if (role === 'raise') return tt('raise')
    const slot = role.endsWith('high') ? 0 : role.endsWith('mid') ? 1 : remLen - 1
    const v = draftRem[slot]
    const name = v !== null ? labels[v] : slotNames[slot]
    return role.startsWith('hide') ? `${tt('hide')} ${name}` : `${tt('play')} ${name}`
  }

  /** compact caption label: bare card/slot for plays, ↓ marks face-down */
  function roleShort(role: ActionRole): string {
    if (role === 'accept') return tt('accept')
    if (role === 'fold') return tt('fold')
    if (role === 'raise') return tt('raise')
    const slot = role.endsWith('high') ? 0 : role.endsWith('mid') ? 1 : remLen - 1
    const v = draftRem[slot]
    const name = v !== null ? labels[v] : slotNames[slot]
    return role.startsWith('hide') ? `${name} ↓` : name
  }

  /** short history-step label; card/bid tokens stay literal */
  const stepLabel = (code: number): string => {
    if (code === 33 || code === 31) return tt('accept')
    if (code === 34 || code === 32) return tt('fold')
    if (code === 26) return tt('hidden')
    if (code >= 27 && code <= 30) return `truco ${[3, 6, 9, 12][code - 27]}`
    if (code >= 13 && code <= 25) return `${labels[code - 13]}↓`
    return labels[code]
  }

  /** full action label for titles; card tokens stay literal */
  const actionTitle = (code: number): string => {
    if (code === 33) return tt('acceptEleven')
    if (code === 34) return tt('foldEleven')
    if (code === 31) return tt('acceptRaise')
    if (code === 32) return tt('foldAction')
    if (code === 26) return tt('hiddenCard')
    if (code >= 27 && code <= 30) return tt('raiseTo', { n: [3, 6, 9, 12][code - 27] })
    if (code >= 13 && code <= 25) return tt('playFaceDown', { card: labels[code - 13] })
    return tt('playCard', { card: labels[code] })
  }

  const unitLabel = costUnit === 'pts' ? 'pts' : 'pp'

  /** per-action stats of the exact row: displayed p, win chance, cost */
  const exactStats = exactRow
    ? (() => {
        const acts = displayActionsForRow(exactRow, interp.ownPlayed)
        const maxQ = Math.max(...exactRow.actions.map((a) => a.q))
        const maxPts = Math.max(...exactRow.actions.map((a) => a.pts ?? 0))
        return acts
          .map(({ action, p, role: r }) => ({
            code: action.c,
            p,
            role: r,
            win: 50 + action.q * 50,
            cost:
              costUnit === 'pts'
                ? Math.max(0, maxPts - (action.pts ?? 0))
                : Math.max(0, (maxQ - action.q) * 50),
          }))
          .sort((a, b) => b.p - a.p || a.cost - b.cost)
      })()
    : null

  const aggMix = [...agg.mix.entries()].sort((a, b) => roleOrder(a[0]) - roleOrder(b[0]))
  const aggBestQ = agg.q.size ? Math.max(...agg.q.values()) : 0
  const aggBestPts = agg.pts.size ? Math.max(...agg.pts.values()) : 0
  const loss = exactStats ? (exactStats[0]?.cost ?? 0) : evLossPP(agg)
  const winValues = exactStats
    ? exactStats.map((s) => s.win)
    : [...agg.q.values()].map((q) => 50 + q * 50)
  const winGap = winValues.length ? Math.max(...winValues) - Math.min(...winValues) : 0

  /** the slot the pin list fills: the single unknown, or the focused one */
  const nullIdxs = draftRem.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
  const varyIdx =
    exact || remLen < 3
      ? null
      : nullIdxs.length === 1
        ? nullIdxs[0]
        : nullIdxs.length === 0
          ? (focusSlot ?? remLen - 1)
          : null

  /** rows matching every slot except the vary one, bucketed by that card;
   *  holdings the walked line rules out don't make pinnable suggestions */
  const byVary = useMemo(() => {
    if (varyIdx === null) return new Map<number, ChartRow>()
    const masked = draftRem.map((v, i) => (i === varyIdx ? null : v))
    const map = new Map<number, ChartRow>()
    for (const r of node.rows) {
      const rem = remainingHand(r.hand, interp.ownPlayed)
      if (remPossible(rem) && draftMatchesHand(masked, rem)) map.set(rem[varyIdx], r)
    }
    return map
  }, [varyIdx, draftRem, node, interp, remPossible])

  /** single click clears a known card (fast path); on a ? it opens the menu */
  const maxVaryW = Math.max(...[...byVary.values()].map((r) => r.w), 1e-12)

  function slotClick(i: number) {
    if (locked) return
    const v = draftRem[i]
    if (v === null) {
      setMenuSlot((m) => (m === i ? null : i))
      return
    }
    restore.current = { i, v }
    onSetSlot(i, null)
  }

  /** double click restores what the first click cleared and opens the menu */
  function slotDoubleClick(i: number) {
    if (locked) return
    const r = restore.current
    if (r && r.i === i) {
      onSetSlot(i, r.v)
      restore.current = null
    }
    setMenuSlot(i)
  }

  /** the range a slot accepts without reshuffling: between its known neighbors */
  function slotRange(i: number): [number, number] {
    const above = draftRem.slice(0, i).filter((x): x is number => x !== null)
    const below = draftRem.slice(i + 1).filter((x): x is number => x !== null)
    return [below.length ? below[0] : 0, above.length ? above[above.length - 1] : N_CLASSES - 1]
  }

  const title = draftRem.map((c) => (c === null ? '?' : labels[c])).join(' · ')

  return (
    <>
      <h3>{title}</h3>
      <div className={styles.handLine} data-tour="hand-cards">
        {draftRem.map((c, i) => (
          <div
            key={i}
            className={styles.slotAnchor}
            draggable={!locked}
            onDragStart={(e) => e.dataTransfer.setData('text/slot', String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const from = Number(e.dataTransfer.getData('text/slot'))
              if (Number.isInteger(from)) onSwapSlots(from, i)
            }}
          >
            <button
              type="button"
              className={styles.slotBtn}
              disabled={locked}
              data-tour-id={`hand-slot-${i}`}
              title={
                locked
                  ? t('pinnedUnpinToEdit')
                  : c === null
                    ? t('pickSlotCard', { slot: slotNames[i] })
                    : t('cardClickHint', { card: labels[c] })
              }
              onClick={() => slotClick(i)}
              onDoubleClick={() => slotDoubleClick(i)}
            >
              {c === null ? <div className={cells.miniUnknown}>?</div> : <MiniCard info={infos[c]} />}
            </button>
            {menuSlot === i && !locked ? (
              <>
                <div className={styles.menuBackdrop} onClick={() => setMenuSlot(null)} />
                <div role="menu" className={styles.cardMenu} aria-label={t('chooseSlotCard', { slot: slotNames[i] })}>
                  {c !== null && playableCodes.has(c) ? (
                    <button
                      type="button"
                      className={styles.cardMenuPlay}
                      onClick={() => {
                        setMenuSlot(null)
                        onPlayCard(c)
                      }}
                    >
                      {t('playCardNow', { card: labels[c] })}
                    </button>
                  ) : null}
                  <div className={styles.cardMenuGrid}>
                    <button
                      type="button"
                      className={c === null ? styles.cardMenuOptOn : styles.cardMenuOpt}
                      title={t('leaveUnknown')}
                      onClick={() => {
                        setMenuSlot(null)
                        onSetSlot(i, null)
                      }}
                    >
                      ?
                    </button>
                    {[...Array(N_CLASSES).keys()].reverse().map((v) => {
                      const [lo, hi] = slotRange(i)
                      const inRange = v >= lo && v <= hi
                      const noCopies = c !== v && copiesLeft(v) - handUses(v, i) <= 0
                      // slot-order feasibility: e.g. the top manilha can only
                      // ever be the strongest card, so weaker slots grey it out
                      const noSlotFit = !noCopies && c !== v && !slotChoiceFits(i, v)
                      const impossible = noCopies || noSlotFit
                      return (
                        <button
                          key={v}
                          type="button"
                          disabled={impossible}
                          className={
                            c === v
                              ? styles.cardMenuOptOn
                              : impossible
                                ? styles.cardMenuOptOff
                                : inRange
                                  ? styles.cardMenuOpt
                                  : styles.cardMenuOptDim
                          }
                          title={
                            noCopies
                              ? t('noCopiesLeft', { card: labels[v] })
                              : noSlotFit
                                ? t('slotInfeasible', { card: labels[v], slot: slotNames[i] })
                                : inRange
                                  ? labels[v]
                                  : t('outOfOrder', { card: labels[v], slot: slotNames[i] })
                          }
                          onClick={() => {
                            setMenuSlot(null)
                            onSetSlot(i, v)
                          }}
                        >
                          <ClassMark info={infos[v]} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ))}
        {interp.ownPlayed.length > 0 ? (
          <span className={styles.playedNote}>
            {t('played', { cards: interp.ownPlayed.map((c) => labels[c]).join(', ') })}
          </span>
        ) : null}
      </div>

      {locked ? (
        <p className={styles.caption}>
          {t('pinnedFollows', {
            what: knownCount === remLen ? t('thisHand') : t('thisRange'),
          })}
        </p>
      ) : null}
      {quality ? (
        <div
          className={`${styles.qualityBadge} ${
            quality.level === 'good'
              ? styles.qualityGood
              : quality.level === 'caution'
                ? styles.qualityCaution
                : styles.qualityPoor
          }`}
          title={t('qualityTitle')}
        >
          <span>{t('qualityLabel')}</span>
          <b>{t(`quality${quality.level[0].toUpperCase()}${quality.level.slice(1)}` as 'qualityGood' | 'qualityCaution' | 'qualityPoor', { pp: quality.gapPP.toFixed(1) })}</b>
        </div>
      ) : null}
      {technicalQuality ? (
        <details className={styles.qualityDetails}>
          <summary>{t('qualityTechnical')}</summary>
          <p>
            {t('qualityTechnicalBody', {
              selfLoss: technicalQuality.selfLossPP.toFixed(1),
              ownReach: (technicalQuality.ownReach * 100).toFixed(2),
            })}
          </p>
        </details>
      ) : null}
      {reach ? (
        <div className={styles.reachBlock} data-tour="hand-often">
          <span
            className={styles.h3Head}
            title={t('howOftenTitle')}
          >
            {t('howOften')}
          </span>
          <div
            className={styles.statRow}
            title={t('dealsLandTitle')}
          >
            <span>{t('dealsLand')}</span>
            <b>{fmtReach(reach.joint)}%</b>
          </div>
          <div
            className={styles.statRow}
            title={t('shareOfTitle', { role: role === 'pé' ? tt('pe') : tt('mao') })}
          >
            <span>{t('shareOf', { role: role === 'pé' ? tt('pe') : tt('mao') })}</span>
            <b>{fmtReach(reach.share)}%</b>
          </div>
          {trainWarn ? <p className={styles.offPathWarn}>{trainWarn}</p> : null}
        </div>
      ) : null}

      {matching === 0 ? (
        <p className={styles.caption}>{t('noMatch')}</p>
      ) : (
        <>
          {exactStats ? (
            <>
              <div className={styles.mixBar}>
                {exactStats
                  .filter((s) => s.p > 0)
                  .map((s) => (
                    <div key={s.code} style={{ width: `${s.p * 100}%`, background: ROLE_COLORS[s.role] }} />
                  ))}
              </div>
              <p className={styles.caption}>
                {exactStats
                  .filter((s) => s.p > 0)
                  .map((s) => `${stepLabel(s.code)} ${fmtPct(s.p)}%`)
                  .join(' · ')}
              </p>
            </>
          ) : (
            <>
              <div className={styles.mixBar}>
                {aggMix.map(([role, p]) => (
                  <div key={role} style={{ width: `${p * 100}%`, background: ROLE_COLORS[role] }} />
                ))}
              </div>
              <p className={styles.caption}>
                {aggMix
                  .filter(([, p]) => p > 0)
                  .map(([role, p]) => `${roleShort(role)} ${(p * 100).toFixed(1)}%`)
                  .join(' · ')}
              </p>
            </>
          )}

          <div data-tour="hand-win">
          <p className={styles.caption} style={{ marginTop: 12, marginBottom: 0 }}>
            {t('winIfTake')}
          </p>
          <div style={{ marginTop: 4 }}>
            {exactStats
              ? exactStats.map((s) => (
                  <div key={s.code} className={styles.statRow}>
                    <span>{stepLabel(s.code)}</span>
                    <b className={s.cost < 0.05 ? styles.statGood : styles.statBad}>
                      {s.win.toFixed(1)}% {t('win')} · {s.cost < 0.05 ? '0.0' : `−${s.cost.toFixed(1)}`}{' '}
                      {unitLabel}
                    </b>
                  </div>
                ))
              : aggMix.map(([r]) => {
                  const q = agg.q.get(r)
                  if (q === undefined) return null
                  const cost =
                    costUnit === 'pts'
                      ? Math.max(0, aggBestPts - (agg.pts.get(r) ?? 0))
                      : Math.max(0, (aggBestQ - q) * 50)
                  return (
                    <div key={r} className={styles.statRow}>
                      <span>{roleName(r)}</span>
                      <b className={cost < 0.05 ? styles.statGood : styles.statBad}>
                        {(50 + q * 50).toFixed(1)}% {t('win')} · {cost < 0.05 ? '0.0' : `−${cost.toFixed(1)}`}{' '}
                        {unitLabel}
                      </b>
                    </div>
                  )
                })}
          </div>
          </div>
        </>
      )}

      {varyIdx !== null && byVary.size > 0 ? (
        <div className={styles.h3Rows} data-tour="hand-vary">
          <span
            className={styles.h3Head}
            title={t('varyHint')}
          >
            {t('slotCard', { slot: slotNames[varyIdx] })}
          </span>
          {[...Array(N_CLASSES).keys()].reverse().map((h3) => {
            const row = byVary.get(h3)
            if (!row) return null
            const acts = displayActionsForRow(row, interp.ownPlayed)
              .filter(({ p }) => p > 0)
              .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
            const total = acts.reduce((s, a) => s + a.p, 0) || 1
            const mixText = acts
              .map(({ action, p }) => `${stepLabel(action.c)} ${fmtPct(p)}%`)
              .join(' · ')
            const isPinned = draftRem[varyIdx] === h3
            return (
              <button
                key={h3}
                type="button"
                disabled={locked}
                className={isPinned ? styles.h3RowOn : styles.h3Row}
                title={
                  locked
                    ? t('pinnedUnpinToEdit')
                    : t('pinAsSlot', {
                        action: isPinned ? t('clear') : t('pinVerb'),
                        card: labels[h3],
                        slot: slotNames[varyIdx],
                        mix: acts
                          .map(({ action, p }) => `${actionTitle(action.c)} ${fmtPct(p)}%`)
                          .join(' · '),
                      })
                }
                onClick={() => onSetSlot(varyIdx, isPinned ? null : h3)}
              >
                <span className={styles.h3Lab}>
                  <ClassMark info={infos[h3]} />
                </span>
                <span
                  className={styles.h3Bar}
                  style={{ width: `${Math.max(10, (row.w / maxVaryW) * 100)}%` }}
                  aria-hidden
                >
                  {acts.map(({ action, p, role }) => (
                    <span
                      key={action.c}
                      style={{
                        width: `${(p / total) * 100}%`,
                        background: ROLE_COLORS[role],
                      }}
                    />
                  ))}
                </span>
                <span className={styles.h3Mix}>{mixText}</span>
              </button>
            )
          })}
        </div>
      ) : knownCount === 0 && !exact ? (
        <p className={styles.caption} style={{ marginTop: 10 }}>
          {t('emptyPinnedHint')}
        </p>
      ) : null}

      {matching > 0 ? (
        <p className={styles.marginalia}>
          {loss >= (costUnit === 'pts' ? 0.2 : 0.5) ? (
            t.rich('marginaliaMistake', {
              b: (c) => <b>{c}</b>,
              loss: loss.toFixed(1),
              unit: costUnit === 'pts' ? t('unitHandPoints') : t('unitPpMatchWin'),
            })
          ) : winGap < 1 ? (
            t('marginaliaNoise')
          ) : (
            t.rich('marginaliaGap', {
              b: (c) => <b>{c}</b>,
              gap: winGap.toFixed(1),
            })
          )}
        </p>
      ) : null}
    </>
  )
}

function ComparePicker({
  manifest,
  spotIdx,
  diffIdx,
  active,
  onPick,
  onOff,
}: {
  manifest: Manifest
  spotIdx: number
  diffIdx: number | null
  active: boolean
  onPick: (spotIdx: number) => void
  onOff: () => void
}) {
  const t = useTranslations('Study.lab')
  const tt = useTranslations('Study.terms')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const spots = manifest.spots
  const target = active && diffIdx !== null ? spots[diffIdx] : undefined
  const base = target ?? spots[spotIdx]
  const baseScores = spotRoleScores(base)
  const [scores, setScores] = useState<{ mao: number; pe: number } | null>(null)
  const shown = scores ?? baseScores

  /** solved spot index per vira for the drafted scores */
  const byTc = useMemo(() => {
    const map = new Map<number, number>()
    spots.forEach((s, i) => {
      const rs = spotRoleScores(s)
      if (rs.mao === shown.mao && rs.pe === shown.pe) map.set(s.tc, i)
    })
    return map
  }, [spots, shown])

  function pickScores(mao: number, pe: number) {
    setScores({ mao, pe })
    const candidates = spots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        const rs = spotRoleScores(s)
        return rs.mao === mao && rs.pe === pe
      })
    if (candidates.length === 0) return
    const preferred =
      candidates.find(({ s }) => target && s.tc === target.tc) ?? candidates[0]
    if (preferred.i !== spotIdx) onPick(preferred.i)
  }

  function changeScore(which: 'mao' | 'pe', raw: string) {
    const value = Math.max(0, Math.min(11, Math.round(Number(raw))))
    if (!Number.isFinite(value)) return
    pickScores(which === 'mao' ? value : shown.mao, which === 'pe' ? value : shown.pe)
  }

  const resolvable = byTc.size > 0
  const roleWords: RoleWords = { mao: tt('mao'), pe: tt('pe'), vira: t('viraWord') }
  const viraPrefix = t('viraShortPrefix')

  return (
    <div className={styles.viraAnchor}>
      <span className={styles.compareSplit}>
        <button
          type="button"
          className={active ? styles.viewBtnOn : styles.viewBtn}
          disabled={spots.length < 2}
          title={
            active
              ? t('stopComparing')
              : diffIdx !== null
                ? t('compareAgain', { spot: spotLabel(spots[diffIdx], roleWords) })
                : t('compareOverlay')
          }
          onClick={() => {
            if (active) onOff()
            else if (diffIdx !== null) onPick(diffIdx)
            else {
              setScores(null)
              setOpen(true)
            }
          }}
        >
          {diffIdx !== null && spots[diffIdx]
            ? t('vsSpot', { spot: spotLabelShort(spots[diffIdx], viraPrefix) })
            : t('compare')}
        </button>
        <button
          type="button"
          className={active ? styles.viewBtnOn : styles.viewBtn}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={spots.length < 2}
          title={t('chooseCompare')}
          onClick={() => {
            setScores(null)
            setOpen((v) => !v)
          }}
        >
          ▾
        </button>
      </span>
      {open ? (
        <>
          <div className={styles.menuBackdrop} onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={t('compareDialogAria')}
            className={styles.compareMenu}
          >
            <span className={styles.viraMenuNote}>{t('compareNote')}</span>
            <div className={styles.compareScores}>
              <label className={styles.compareField}>
                <span>{tt('mao')}</span>
                <input
                  type="number"
                  min={0}
                  max={11}
                  value={shown.mao}
                  onChange={(e) => changeScore('mao', e.target.value)}
                />
              </label>
              <span className={styles.scoreX}>×</span>
              <label className={styles.compareField}>
                <span>{tt('pe')}</span>
                <input
                  type="number"
                  min={0}
                  max={11}
                  value={shown.pe}
                  onChange={(e) => changeScore('pe', e.target.value)}
                />
              </label>
              {!resolvable ? <span className={styles.compareStatus}>{t('notSolved')}</span> : null}
            </div>
            <div className={styles.compareViras}>
              {viraChoices().map(({ rank, tc }) => {
                const idx = byTc.get(tc)
                const isOn = target !== undefined && target.tc === tc && resolvable
                return (
                  <button
                    key={rank}
                    type="button"
                    disabled={idx === undefined || idx === spotIdx}
                    className={isOn ? styles.viraOptOn : styles.viraOpt}
                    onClick={() => {
                      if (idx !== undefined) onPick(idx)
                    }}
                  >
                    {rank}
                  </button>
                )
              })}
            </div>
            {active ? (
              <button
                type="button"
                className={styles.compareOpt}
                onClick={() => {
                  onOff()
                  setOpen(false)
                }}
              >
                {t('stopComparing')}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
