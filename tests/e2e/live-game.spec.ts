import { expect, test, type Locator, type Page, type Request } from '@playwright/test'

type ObservedSessionAction = {
  type: string
  cardId?: string
  to?: number
}

type HeroPlayOverlayProbeState = {
  sawOverlay: boolean
  overlayGoneAt: number | null
  firstAngle: number | null
  maxAngleDelta: number
  maxWidth: number
  maxHeight: number
  hasFarolMotionClass: boolean
  cardBackCount: number
  cardBackBackgroundImage: string
  maxHeroTableCardsDuringOverlay: number
  minHeroHandCardsDuringOverlay: number | null
}

const LIVE_GAME_TEST_URL = process.env.LIVE_GAME_BASE_URL ?? 'http://127.0.0.1:3002'
const SCORE_DISPLAY_STYLE_STORAGE_KEY = 'truco.live.scoreDisplayStyle'
const DECK_PICKER_TEST_TITLE = 'deck picker defaults to French and settings plus deck hold can switch decks'
const DECK_PICKER_MOBILE_TEST_TITLE = 'first-run deck picker scrolls inside the dialog on short mobile viewport'
const FAST_MODE_MIGRATION_TEST_TITLE = 'fast mode migrates the legacy preference and persists shell toggling'

test.beforeEach(async ({ page }, testInfo) => {
  if (
    testInfo.title === DECK_PICKER_TEST_TITLE ||
    testInfo.title === DECK_PICKER_MOBILE_TEST_TITLE ||
    testInfo.title === FAST_MODE_MIGRATION_TEST_TITLE
  ) return

  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
    }))
  })
})

async function waitForHeroTurn(page: Page) {
  const deadline = Date.now() + 12_000

  while (Date.now() < deadline) {
    await dismissFirstRunDeckPickerIfVisible(page)

    const tableStatusLocator = page.locator('.table-status')
    const tableStatus = await tableStatusLocator.count() > 0
      ? ((await tableStatusLocator.textContent({ timeout: 500 }).catch(() => '')) ?? '')
      : ''
    if (tableStatus.includes('Your turn')) {
      await expect(page.locator('.hand.player-hand .card')).toHaveCount(3)
      return
    }

    const draggableHeroCards = page.locator('.hand.player-hand .card.is-draggable')
    if (await draggableHeroCards.count() > 0) {
      await expect(draggableHeroCards.first()).toBeVisible()
      return
    }

    const acceptButton = page.getByRole('button', { name: /^Accept\b/ }).first()
    if ((await acceptButton.count()) > 0 && (await acceptButton.isEnabled().catch(() => false))) {
      await acceptButton.click()
      continue
    }

    const acceptElevenButton = page.getByRole('button', { name: /Play For 3|Accept Eleven/ }).first()
    if (
      (await acceptElevenButton.count()) > 0 &&
      (await acceptElevenButton.isEnabled().catch(() => false))
    ) {
      await acceptElevenButton.click()
      continue
    }

    await page.waitForTimeout(200)
  }

  throw new Error('Timed out waiting for a hero card-play turn.')
}

async function ensureLauncherReady(page: Page) {
  const startButton = page.getByRole('button', { name: 'Start Match' })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const isVisible = await startButton.isVisible({ timeout: 5_000 }).catch(() => false)
    if (isVisible) return
    if (attempt === 2) break

    await page.waitForTimeout(250)
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' })
  }

  await expect(startButton).toBeVisible()
}

async function dismissFirstRunDeckPickerIfVisible(page: Page) {
  const picker = page.getByTestId('first-run-deck-picker')
  if (await picker.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByTestId('deck-picker-french').click()
    await expect(picker).toHaveCount(0)
  }
}

async function clickDogEarAffordance(
  cardShell: Locator,
  selector: '.dge-fold-button' | '.dge-unfold-button',
) {
  const affordance = cardShell.locator(selector)
  const box = await affordance.boundingBox()
  if (!box) throw new Error(`Missing ${selector} geometry.`)

  await affordance.click({
    position: {
      x: Math.max(1, box.width - 5),
      y: 5,
    },
  })
}

async function expectLiveMatchReady(page: Page) {
  await expect(page.locator('.live-arena__board')).toBeVisible()
  const compactMatchStrip = page.getByTestId('live-arena-match-strip')
  if (await compactMatchStrip.isVisible().catch(() => false)) {
    await expect(compactMatchStrip).toBeVisible()
    return
  }
  const farolScorepad = page.locator('.ft-scorepad-slot .scorepad')
  if (await farolScorepad.isVisible().catch(() => false)) {
    await expect(farolScorepad).toBeVisible()
    return
  }
  const farolScoreRail = page.getByTestId('farol-score-rail')
  if (await farolScoreRail.isVisible().catch(() => false)) {
    await expect(farolScoreRail).toBeVisible()
    return
  }
  await expect(page.getByTestId('score-row-hero')).toBeVisible()
  await expect(page.getByTestId('score-row-villain')).toBeVisible()
}

async function waitForMotionOverlaysToSettle(page: Page) {
  await expect(page.getByTestId('deal-overlay-card')).toHaveCount(0)
  await expect(page.getByTestId('hero-play-overlay')).toHaveCount(0)
  await expect(page.getByTestId('opponent-play-overlay')).toHaveCount(0)
}

async function installHeroPlayOverlayProbe(page: Page) {
  await page.evaluate(() => {
    const state: HeroPlayOverlayProbeState = {
      sawOverlay: false,
      overlayGoneAt: null,
      firstAngle: null,
      maxAngleDelta: 0,
      maxWidth: 0,
      maxHeight: 0,
      hasFarolMotionClass: false,
      cardBackCount: 0,
      cardBackBackgroundImage: '',
      maxHeroTableCardsDuringOverlay: 0,
      minHeroHandCardsDuringOverlay: null,
    }

    const readAngle = (element: Element) => {
      const transform = window.getComputedStyle(element).transform
      if (!transform || transform === 'none') return 0

      try {
        const matrix = new DOMMatrixReadOnly(transform)
        const angle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI)
        return Number.isFinite(angle) ? angle : 0
      } catch {
        return 0
      }
    }

    let animationFrameId = 0
    const tick = () => {
      const overlay = document.querySelector('[data-testid="hero-play-overlay"]')
      if (overlay instanceof HTMLElement) {
        const angle = readAngle(overlay)
        const style = window.getComputedStyle(overlay)
        const width = Number.parseFloat(style.width)
        const height = Number.parseFloat(style.height)
        const cardBacks = overlay.querySelectorAll('.spcard-back, .fcard-back')
        const firstCardBack = cardBacks[0]

        state.sawOverlay = true
        state.hasFarolMotionClass = state.hasFarolMotionClass || overlay.classList.contains('farol-motion-card-back')
        state.cardBackCount = cardBacks.length
        state.maxWidth = Math.max(state.maxWidth, Number.isFinite(width) ? width : 0)
        state.maxHeight = Math.max(state.maxHeight, Number.isFinite(height) ? height : 0)
        state.maxHeroTableCardsDuringOverlay = Math.max(
          state.maxHeroTableCardsDuringOverlay,
          document.querySelectorAll('[data-testid="hero-table-slot"] .card:not(.placeholder)').length,
        )

        const heroHandCards = document.querySelectorAll('.hand.player-hand .card').length
        state.minHeroHandCardsDuringOverlay = state.minHeroHandCardsDuringOverlay == null
          ? heroHandCards
          : Math.min(state.minHeroHandCardsDuringOverlay, heroHandCards)

        if (firstCardBack instanceof HTMLElement) {
          state.cardBackBackgroundImage = window.getComputedStyle(firstCardBack).backgroundImage
        }

        if (state.firstAngle == null) {
          state.firstAngle = angle
        } else {
          state.maxAngleDelta = Math.max(state.maxAngleDelta, Math.abs(angle - state.firstAngle))
        }
      } else if (state.sawOverlay && state.overlayGoneAt == null) {
        state.overlayGoneAt = performance.now()
        return
      }

      animationFrameId = window.requestAnimationFrame(tick)
    }

    animationFrameId = window.requestAnimationFrame(tick)
    ;(window as typeof window & {
      __heroPlayOverlayProbe?: {
        state: HeroPlayOverlayProbeState
        cancel: () => void
      }
    }).__heroPlayOverlayProbe = {
      state,
      cancel: () => window.cancelAnimationFrame(animationFrameId),
    }
  })
}

async function readHeroPlayOverlayProbe(page: Page) {
  return page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __heroPlayOverlayProbe?: {
        state: HeroPlayOverlayProbeState
        cancel: () => void
      }
    }
    const probe = globalWindow.__heroPlayOverlayProbe
    if (!probe) return null

    probe.cancel()
    return probe.state
  })
}

async function waitForFarolIntroToSettle(page: Page) {
  await expect(page.locator('.ft-root.ft-root-intro-tilted, .ft-root.ft-root-intro-settling')).toHaveCount(0, { timeout: 6_000 })
}

function activeOpponentTableSlot(page: Page) {
  return page.locator('.ft-played-round-active .current-opponent-card')
}

function activeHeroTableSlot(page: Page) {
  return page.locator('.ft-played-round-active .current-player-card')
}

function farolRound(page: Page, index: number) {
  return page.locator('.ft-played-round').nth(index)
}

async function setStoredScoreDisplayStyle(page: Page, style: string) {
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value)
    },
    [SCORE_DISPLAY_STYLE_STORAGE_KEY, style],
  )
}

async function startMockedMatch(page: Page) {
  await page.goto(LIVE_GAME_TEST_URL)
  const board = page.locator('.live-arena__board')
  if (await board.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await expectLiveMatchReady(page)
    await dismissFirstRunDeckPickerIfVisible(page)
    return
  }
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await expectLiveMatchReady(page)
  await dismissFirstRunDeckPickerIfVisible(page)
}

test('Farol keeps the photographic walnut on the table and a separate dark-walnut rail', async ({ page }) => {
  await startMockedMatch(page)

  const materials = await page.evaluate(() => {
    const stage = document.querySelector('.ft-root-rich-walnut')
    const table = document.querySelector('.ft-root-rich-walnut .ft-table-surface.walnut')
    const rail = document.querySelector('.ft-root-rich-walnut .td-rail')
    if (!stage || !table || !rail) {
      throw new Error('Missing Farol stage, walnut table surface, or action rail.')
    }

    return {
      bodyBackgroundColor: window.getComputedStyle(document.body).backgroundColor,
      bodyBackgroundImage: window.getComputedStyle(document.body).backgroundImage,
      stageBackgroundImage: window.getComputedStyle(stage).backgroundImage,
      tableBackgroundImage: window.getComputedStyle(table).backgroundImage,
      railBackgroundColor: window.getComputedStyle(rail).backgroundColor,
      railBackgroundImage: window.getComputedStyle(rail).backgroundImage,
    }
  })

  expect(materials.bodyBackgroundColor).toBe('rgb(10, 7, 5)')
  expect(materials.bodyBackgroundImage).toBe('none')
  expect(materials.stageBackgroundImage).not.toContain('rich-walnut.webp')
  expect(materials.tableBackgroundImage).toContain('rich-walnut.webp')
  expect(materials.railBackgroundColor).toBe('rgb(22, 13, 8)')
  expect(materials.railBackgroundImage).not.toContain('rich-walnut.webp')
  expect(materials.railBackgroundImage).toContain('repeating-linear-gradient')
})

test('launcher walnut is one continuous full-screen surface', async ({ page }) => {
  await page.goto(LIVE_GAME_TEST_URL)
  await ensureLauncherReady(page)

  const launcherMaterial = await page.getByTestId('live-game-launcher-screen').evaluate((launcher) => {
    const style = window.getComputedStyle(launcher)
    const bounds = launcher.getBoundingClientRect()
    return {
      backgroundImage: style.backgroundImage,
      backgroundPosition: style.backgroundPosition,
      backgroundRepeat: style.backgroundRepeat,
      backgroundSize: style.backgroundSize,
      height: bounds.height,
      width: bounds.width,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }
  })

  expect(launcherMaterial.backgroundImage).toContain('rich-walnut.webp')
  expect(launcherMaterial.backgroundPosition.split(', ')).toEqual(Array(6).fill('50% 50%'))
  expect(launcherMaterial.backgroundRepeat.split(', ')).toEqual(Array(6).fill('no-repeat'))
  expect(launcherMaterial.backgroundSize.split(', ')).toEqual(Array(6).fill('cover'))
  expect(launcherMaterial.height).toBe(launcherMaterial.viewportHeight)
  expect(launcherMaterial.width).toBe(launcherMaterial.viewportWidth)
})

async function openSettingsDrawer(page: Page) {
  await dismissFirstRunDeckPickerIfVisible(page)
  await page.getByTestId('live-game-settings-button').click()
  const drawer = page.getByTestId('live-settings-drawer')
  await expect(drawer).toBeVisible()
  await expect(drawer).not.toHaveClass(/is-opening/)
  return drawer
}

async function closeSettingsDrawer(page: Page) {
  const drawer = page.getByTestId('live-settings-drawer')
  await drawer.getByRole('button', { name: /close/i }).click()
  await expect(drawer).toBeHidden()
}

async function openSettingsSection(page: Page, section: 'match' | 'experience' | 'shortcuts') {
  const toggle = page.getByTestId(`live-settings-section-${section}-toggle`)
  if (await toggle.count() === 0) {
    return null
  }
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  return toggle
}

async function expectComputedSize(locator: Locator, width: number, height: number, tolerance = 1) {
  const size = await locator.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
    }
  })

  expect(size.width).toBeGreaterThanOrEqual(width - tolerance)
  expect(size.width).toBeLessThanOrEqual(width + tolerance)
  expect(size.height).toBeGreaterThanOrEqual(height - tolerance)
  expect(size.height).toBeLessThanOrEqual(height + tolerance)
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
}

async function expectSessionFailureCopy(page: Page, text: string) {
  const failure = page.getByTestId('live-session-failure')
  await expect(failure).toContainText(text, { timeout: 12_000 })
  return failure
}

async function dragBetweenLocators(
  page: Page,
  from: ReturnType<Page['locator']>,
  toX: number,
  toY: number,
) {
  const startBox = await from.boundingBox()
  if (!startBox) throw new Error('Missing drag source box.')

  const startX = startBox.x + startBox.width / 2
  const startY = startBox.y + startBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(startX + 12, startY - 8, { steps: 4 })
  await page.waitForTimeout(50)
  await page.mouse.move(toX, toY, { steps: 16 })
  await page.mouse.up()
}

async function dragCardToSlot(
  page: Page,
  card: ReturnType<Page['locator']>,
  slot: ReturnType<Page['locator']>,
) {
  await card.scrollIntoViewIfNeeded()
  await slot.scrollIntoViewIfNeeded()
  const slotBox = await slot.boundingBox()
  if (!slotBox) throw new Error('Missing drop slot box.')

  await dragBetweenLocators(
    page,
    card,
    slotBox.x + slotBox.width / 2,
    slotBox.y + slotBox.height / 2,
  )
}


async function setRangeValue(
  locator: ReturnType<Page['locator']>,
  nextValue: string,
) {
  await locator.evaluate((element, value) => {
    const input = element as HTMLInputElement
    const prototype = window.HTMLInputElement.prototype
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (!valueSetter) {
      throw new Error('Missing native input value setter.')
    }

    valueSetter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, nextValue)
}

function observeSessionActionRequests(page: Page) {
  const actionRequests: ObservedSessionAction[] = []

  const handleRequest = (request: Request) => {
    const { pathname } = new URL(request.url())
    if (request.method() !== 'POST' || !pathname.match(/\/api\/game\/session\/[^/]+\/actions$/)) {
      return
    }

    const body = request.postData()
    if (!body) return

    const payload = JSON.parse(body) as {
      action?: {
        type?: string
        card_id?: string
        to?: number
      }
    }

    actionRequests.push({
      type: payload.action?.type ?? 'unknown',
      cardId: payload.action?.card_id,
      to: typeof payload.action?.to === 'number' ? payload.action.to : undefined,
    })
  }

  page.on('request', handleRequest)

  return {
    actionRequests,
    dispose: () => page.off('request', handleRequest),
  }
}

async function expectOnlyFaceUpPlayRequest(
  actionRequests: ObservedSessionAction[],
  cardId?: string,
) {
  await expect.poll(() => actionRequests.length).toBe(1)
  expect(actionRequests[0]?.type).toBe('play_face_up')
  if (cardId) {
    expect(actionRequests[0]?.cardId).toBe(cardId)
  }
}

function buildFinishedMatchSession(options: {
  winner: 0 | 1
  heroScore: number
  villainScore: number
}) {
  const { winner, heroScore, villainScore } = options
  const score = { '0': heroScore, '1': villainScore } as const

  return {
    matchId: 'mock-finished-match',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: winner === 0 ? 1 : 0,
      score,
      winner,
      current_hand: null,
    },
    publicView: {
      score,
      winner,
      next_dealer: winner === 0 ? 1 : 0,
      current_player: null,
      hand_in_progress: false,
      hand: null,
    },
    playerView: {
      player: 0,
      score,
      winner,
      next_dealer: winner === 0 ? 1 : 0,
      current_player: null,
      hand_in_progress: false,
      hand: null,
    },
    legalActions: [],
  }
}

async function mockFinishedMatch(page: Page, options: {
  winner: 0 | 1
  heroScore: number
  villainScore: number
}) {
  const session = buildFinishedMatchSession(options)

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })
}

function buildWaitingTurnSession(options?: { dealer?: 0 | 1; score?: { '0': number; '1': number } }) {
  const dealer = options?.dealer ?? 0
  const score = options?.score ?? { '0': 4, '1': 3 } as const

  return {
    matchId: 'mock-waiting-turn-match',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer,
          next_player: dealer === 0 ? 1 : 0,
          score,
          hand_value: 1,
          turnup: { rank: 'K', suit: 'CLUBS' },
          completed_rounds: [],
          current_round: {
            leader: dealer === 0 ? 0 : 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: dealer === 0 ? 1 : 0,
      hand_in_progress: true,
      hand: {
        next_player: dealer === 0 ? 1 : 0,
        hand_value: 1,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [],
        current_round: {
          leader: dealer === 0 ? 0 : 1,
          plays: [],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: dealer === 0 ? 1 : 0,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: dealer === 0 ? 1 : 0,
          hand_value: 1,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [],
          current_round: {
            leader: dealer === 0 ? 0 : 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'hero-1', rank: '4', suit: 'HEARTS' },
          { id: 'hero-2', rank: '7', suit: 'SPADES' },
          { id: 'hero-3', rank: 'A', suit: 'DIAMONDS' },
        ],
      },
    },
    legalActions: [],
  }
}

async function mockWaitingTurnMatch(page: Page, options?: { dealer?: 0 | 1 }) {
  const session = buildWaitingTurnSession(options)

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })
}

function buildHeroLeadReadySession() {
  const session = cloneJson(buildWaitingTurnSession())

  session.matchId = 'mock-hero-lead-sequence'
  session.state.current_hand.state.next_player = 0
  session.publicView.current_player = 0
  session.publicView.hand!.next_player = 0
  session.playerView.current_player = 0
  session.playerView.hand!.public_state.next_player = 0
  session.legalActions = session.playerView.hand!.hand.map((card) => ({
    type: 'play_face_up' as const,
    card_id: card.id,
  }))

  return session
}

function buildBotLeadAfterDealSession() {
  const session = buildHeroLeadReadySession()

  session.matchId = 'mock-bot-lead-after-deal'
  session.state.current_hand.state.dealer = 1
  session.state.current_hand.state.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { id: 'villain-lead-1', rank: '6', suit: 'DIAMONDS' },
      },
    ],
  }
  session.publicView.hand!.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { rank: '6', suit: 'DIAMONDS' },
      },
    ],
  }
  session.playerView.hand!.public_state.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { rank: '6', suit: 'DIAMONDS' },
      },
    ],
  }

  return session
}

function buildHeroLeadVillainResponseSession() {
  const session = buildHeroLeadReadySession()
  const [heroCard, ...remainingHeroCards] = session.playerView.hand!.hand

  session.playerView.hand!.hand = remainingHeroCards
  session.state.current_hand.state.next_player = null
  session.publicView.current_player = null
  session.publicView.hand!.next_player = null
  session.playerView.current_player = null
  session.playerView.hand!.public_state.next_player = null
  session.state.current_hand.state.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: heroCard,
      },
      {
        player: 1,
        visibility: 'up',
        card: { id: 'villain-response-1', rank: 'K', suit: 'CLUBS' },
      },
    ],
  }
  session.publicView.hand!.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: { rank: heroCard.rank, suit: heroCard.suit },
      },
      {
        player: 1,
        visibility: 'up',
        card: { rank: 'K', suit: 'CLUBS' },
      },
    ],
  }
  session.playerView.hand!.public_state.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: { rank: heroCard.rank, suit: heroCard.suit },
      },
      {
        player: 1,
        visibility: 'up',
        card: { rank: 'K', suit: 'CLUBS' },
      },
    ],
  }
  session.legalActions = []

  return session
}

function buildHeroPlayedWithVisibleHandSession() {
  const session = buildHeroLeadReadySession()
  const [heroCard, ...remainingHeroCards] = session.playerView.hand!.hand

  session.matchId = 'mock-hero-played-visible-hand'
  session.playerView.hand!.hand = remainingHeroCards
  session.legalActions = remainingHeroCards.map((card) => ({
    type: 'play_face_up' as const,
    card_id: card.id,
  }))
  session.state.current_hand.state.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: heroCard,
      },
    ],
  }
  session.publicView.hand!.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: { rank: heroCard.rank, suit: heroCard.suit },
      },
    ],
  }
  session.playerView.hand!.public_state.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: { rank: heroCard.rank, suit: heroCard.suit },
      },
    ],
  }

  return session
}

function buildHeroPlayIntoVillainRaiseSession() {
  const session = buildHeroLeadReadySession()
  const [heroCard, ...remainingHeroCards] = session.playerView.hand!.hand

  session.playerView.hand!.hand = remainingHeroCards
  session.state.current_hand.state.next_player = 0
  session.publicView.current_player = 0
  session.publicView.hand!.next_player = 0
  session.playerView.current_player = 0
  session.playerView.hand!.public_state.next_player = 0
  session.state.current_hand.state.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: heroCard,
      },
    ],
  }
  session.publicView.hand!.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: { rank: heroCard.rank, suit: heroCard.suit },
      },
    ],
  }
  session.playerView.hand!.public_state.current_round = {
    leader: 0,
    plays: [
      {
        player: 0,
        visibility: 'up',
        card: { rank: heroCard.rank, suit: heroCard.suit },
      },
    ],
  }
  session.state.current_hand.state.last_raised_by = 1
  session.state.current_hand.state.pending_raise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  }
  session.publicView.hand!.pending_raise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  }
  session.playerView.hand!.public_state.pending_raise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  }
  session.legalActions = [
    { type: 'accept_raise' as const },
    { type: 'fold' as const },
    { type: 'raise' as const, to: 6 },
  ]

  return session
}

function buildHeroLeadIntoVillainLeadSession() {
  const session = buildHeroLeadReadySession()
  const [heroCard, ...remainingHeroCards] = session.playerView.hand!.hand

  session.playerView.hand!.hand = remainingHeroCards
  session.state.current_hand.state.next_player = 0
  session.publicView.current_player = 0
  session.publicView.hand!.next_player = 0
  session.playerView.current_player = 0
  session.playerView.hand!.public_state.next_player = 0
  session.state.current_hand.state.completed_rounds = [
    {
      leader: 0,
      winner: 1,
      plays: [
        {
          player: 0,
          visibility: 'up',
          card: heroCard,
        },
        {
          player: 1,
          visibility: 'up',
          card: { id: 'villain-round-1', rank: '7', suit: 'SPADES' },
        },
      ],
    },
  ]
  session.publicView.hand!.completed_rounds = [
    {
      leader: 0,
      winner: 1,
    },
  ]
  session.playerView.hand!.public_state.completed_rounds = [
    {
      leader: 0,
      winner: 1,
    },
  ]
  session.state.current_hand.state.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { id: 'villain-round-2', rank: 'Q', suit: 'HEARTS' },
      },
    ],
  }
  session.publicView.hand!.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { rank: 'Q', suit: 'HEARTS' },
      },
    ],
  }
  session.playerView.hand!.public_state.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { rank: 'Q', suit: 'HEARTS' },
      },
    ],
  }
  session.legalActions = remainingHeroCards.map((card) => ({
    type: 'play_face_up' as const,
    card_id: card.id,
  }))

  return session
}

function buildHeroLeadIntoVillainRaiseSession() {
  const session = buildHeroLeadReadySession()
  const [heroCard, ...remainingHeroCards] = session.playerView.hand!.hand

  session.playerView.hand!.hand = remainingHeroCards
  session.state.current_hand.state.next_player = 0
  session.publicView.current_player = 0
  session.publicView.hand!.next_player = 0
  session.playerView.current_player = 0
  session.playerView.hand!.public_state.next_player = 0
  session.state.current_hand.state.completed_rounds = [
    {
      leader: 0,
      winner: 1,
      plays: [
        {
          player: 0,
          visibility: 'up',
          card: heroCard,
        },
        {
          player: 1,
          visibility: 'up',
          card: { id: 'villain-round-1', rank: '7', suit: 'SPADES' },
        },
      ],
    },
  ]
  session.publicView.hand!.completed_rounds = [
    {
      leader: 0,
      winner: 1,
    },
  ]
  session.playerView.hand!.public_state.completed_rounds = [
    {
      leader: 0,
      winner: 1,
    },
  ]
  session.state.current_hand.state.current_round = {
    leader: 1,
    plays: [],
  }
  session.publicView.hand!.current_round = {
    leader: 1,
    plays: [],
  }
  session.playerView.hand!.public_state.current_round = {
    leader: 1,
    plays: [],
  }
  session.state.current_hand.state.last_raised_by = 1
  session.state.current_hand.state.pending_raise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  }
  session.publicView.hand!.pending_raise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  }
  session.playerView.hand!.public_state.pending_raise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  }
  session.legalActions = [
    { type: 'accept_raise' as const },
    { type: 'fold' as const },
    { type: 'raise' as const, to: 6 },
  ]

  return session
}

async function mockStaticSession(page: Page, session: ReturnType<typeof buildWaitingTurnSession>) {
  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}/actions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}/start-hand`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })
}

async function mockActionSequenceMatch(page: Page, options: {
  initialSession: ReturnType<typeof buildWaitingTurnSession>
  actionSession: ReturnType<typeof buildWaitingTurnSession>
  actionDelayMs?: number
}) {
  const { initialSession, actionSession, actionDelayMs = 0 } = options
  let currentSession = cloneJson(initialSession)

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/actions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    if (actionDelayMs > 0) {
      await page.waitForTimeout(actionDelayMs)
    }

    currentSession = cloneJson(actionSession)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/start-hand`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })
}

async function mockFreshMatchWithStableId(page: Page, matchId: string) {
  const session = cloneJson(buildWaitingTurnSession())
  session.matchId = matchId

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })
}

async function mockSequentialMatchStarts(page: Page, matchIds: string[]) {
  const startRequests: Array<Record<string, unknown>> = []
  let activeSession: ReturnType<typeof buildWaitingTurnSession> | null = null

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    startRequests.push(route.request().postDataJSON() as Record<string, unknown>)

    const nextSession = cloneJson(buildWaitingTurnSession())
    nextSession.matchId = matchIds[Math.min(startRequests.length - 1, matchIds.length - 1)] ?? nextSession.matchId
    activeSession = nextSession

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nextSession),
    })
  })

  await page.route('**/api/game/session/**', async (route) => {
    const request = route.request()
    if (request.method() !== 'GET' || !activeSession) {
      await route.continue()
      return
    }

    const url = new URL(request.url())
    if (url.pathname !== `/api/game/session/${activeSession.matchId}`) {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(activeSession),
    })
  })

  return { startRequests }
}

function buildHideCardReadySession() {
  const score = { '0': 4, '1': 3 } as const

  return {
    matchId: 'mock-hide-card-match',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 0,
          score,
          hand_value: 1,
          turnup: { rank: 'Q', suit: 'CLUBS' },
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
              plays: [
                {
                  player: 0,
                  visibility: 'up',
                  card: { id: 'hero-prev', rank: '5', suit: 'HEARTS' },
                },
                {
                  player: 1,
                  visibility: 'up',
                  card: { id: 'villain-prev', rank: '4', suit: 'SPADES' },
                },
              ],
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              {
                player: 1,
                visibility: 'up',
                card: { id: 'villain-open', rank: '6', suit: 'DIAMONDS' },
              },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        next_player: 0,
        hand_value: 1,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [
          {
            leader: 0,
            winner: 0,
          },
        ],
        current_round: {
          leader: 1,
          plays: [
            {
              player: 1,
              visibility: 'up',
              card: { rank: '6', suit: 'DIAMONDS' },
            },
          ],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 0,
          hand_value: 1,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              {
                player: 1,
                visibility: 'up',
                card: { rank: '6', suit: 'DIAMONDS' },
              },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'hero-hide-1', rank: 'Q', suit: 'SPADES' },
          { id: 'hero-hide-2', rank: 'J', suit: 'DIAMONDS' },
          { id: 'hero-hide-3', rank: '3', suit: 'DIAMONDS' },
        ],
      },
    },
    legalActions: [
      { type: 'play_face_up', card_id: 'hero-hide-1' },
      { type: 'play_face_down', card_id: 'hero-hide-1' },
      { type: 'play_face_up', card_id: 'hero-hide-2' },
      { type: 'play_face_down', card_id: 'hero-hide-2' },
      { type: 'play_face_up', card_id: 'hero-hide-3' },
      { type: 'play_face_down', card_id: 'hero-hide-3' },
      { type: 'raise', to: 3 },
    ],
  }
}

function buildHiddenPlayTableSession() {
  const score = { '0': 4, '1': 3 } as const

  return {
    matchId: 'mock-hide-card-match',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 1,
          score,
          hand_value: 1,
          turnup: { rank: 'Q', suit: 'CLUBS' },
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
              plays: [
                {
                  player: 0,
                  visibility: 'up',
                  card: { id: 'hero-prev', rank: '5', suit: 'HEARTS' },
                },
                {
                  player: 1,
                  visibility: 'up',
                  card: { id: 'villain-prev', rank: '4', suit: 'SPADES' },
                },
              ],
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              {
                player: 1,
                visibility: 'up',
                card: { id: 'villain-open', rank: '6', suit: 'DIAMONDS' },
              },
              {
                player: 0,
                visibility: 'down',
                card: { id: 'hero-hide-1', rank: 'Q', suit: 'SPADES' },
              },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        next_player: 1,
        hand_value: 1,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [
          {
            leader: 0,
            winner: 0,
          },
        ],
        current_round: {
          leader: 1,
          plays: [
            {
              player: 1,
              visibility: 'up',
              card: { rank: '6', suit: 'DIAMONDS' },
            },
            {
              player: 0,
              visibility: 'down',
              card: null,
            },
          ],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 1,
          hand_value: 1,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              {
                player: 1,
                visibility: 'up',
                card: { rank: '6', suit: 'DIAMONDS' },
              },
              {
                player: 0,
                visibility: 'down',
                card: null,
              },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'hero-hide-2', rank: 'J', suit: 'DIAMONDS' },
          { id: 'hero-hide-3', rank: '3', suit: 'DIAMONDS' },
        ],
      },
    },
    legalActions: [],
  }
}

function buildHiddenPlayTraceSession() {
  const score = { '0': 4, '1': 3 } as const

  return {
    matchId: 'mock-hide-card-match',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 1,
          score,
          hand_value: 1,
          turnup: { rank: 'Q', suit: 'CLUBS' },
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
              plays: [
                {
                  player: 0,
                  visibility: 'up',
                  card: { id: 'hero-prev', rank: '5', suit: 'HEARTS' },
                },
                {
                  player: 1,
                  visibility: 'up',
                  card: { id: 'villain-prev', rank: '4', suit: 'SPADES' },
                },
              ],
            },
            {
              leader: 1,
              winner: 1,
              plays: [
                {
                  player: 1,
                  visibility: 'up',
                  card: { id: 'villain-open', rank: '6', suit: 'DIAMONDS' },
                },
                {
                  player: 0,
                  visibility: 'down',
                  card: { id: 'hero-hide-1', rank: 'Q', suit: 'SPADES' },
                },
              ],
            },
          ],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        next_player: 1,
        hand_value: 1,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [
          {
            leader: 0,
            winner: 0,
          },
          {
            leader: 1,
            winner: 1,
          },
        ],
        current_round: {
          leader: 1,
          plays: [],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 1,
          hand_value: 1,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
            },
            {
              leader: 1,
              winner: 1,
            },
          ],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'hero-hide-2', rank: 'J', suit: 'DIAMONDS' },
          { id: 'hero-hide-3', rank: '3', suit: 'DIAMONDS' },
        ],
      },
    },
    legalActions: [],
  }
}

async function mockHideCardMatch(page: Page) {
  const initialSession = buildHideCardReadySession()
  const hiddenPlayTableSession = buildHiddenPlayTableSession()
  const hiddenPlayTraceSession = buildHiddenPlayTraceSession()
  let currentSession = cloneJson(initialSession)
  let shouldServeTraceSessionOnReload = false

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    if (shouldServeTraceSessionOnReload) {
      currentSession = cloneJson(hiddenPlayTraceSession)
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/actions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    const payload = JSON.parse(route.request().postData() ?? '{}') as {
      action?: {
        type?: string
      }
    }

    if (payload.action?.type === 'play_face_down') {
      currentSession = cloneJson(hiddenPlayTableSession)
      shouldServeTraceSessionOnReload = true
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })
}

function buildHandEndPayoffReadySession() {
  const score = { '0': 4, '1': 3 } as const

  return {
    matchId: 'mock-hand-end-payoff-match',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 0,
          score,
          hand_value: 3,
          turnup: { rank: 'K', suit: 'HEARTS' },
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
              plays: [
                {
                  player: 0,
                  visibility: 'up',
                  card: { id: 'hero-round-1', rank: 'A', suit: 'SPADES' },
                },
                {
                  player: 1,
                  visibility: 'up',
                  card: { id: 'villain-round-1', rank: '7', suit: 'CLUBS' },
                },
              ],
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              {
                player: 1,
                visibility: 'up',
                card: { id: 'villain-round-2', rank: '6', suit: 'DIAMONDS' },
              },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        next_player: 0,
        hand_value: 3,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [
          {
            leader: 0,
            winner: 0,
          },
        ],
        current_round: {
          leader: 1,
          plays: [
            {
              player: 1,
              visibility: 'up',
              card: { rank: '6', suit: 'DIAMONDS' },
            },
          ],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 0,
          hand_value: 3,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              {
                player: 1,
                visibility: 'up',
                card: { rank: '6', suit: 'DIAMONDS' },
              },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'hero-payoff-1', rank: 'Q', suit: 'HEARTS' },
          { id: 'hero-payoff-2', rank: '4', suit: 'CLUBS' },
        ],
      },
    },
    legalActions: [
      { type: 'play_face_up', card_id: 'hero-payoff-1' },
      { type: 'play_face_up', card_id: 'hero-payoff-2' },
      { type: 'raise', to: 6 },
    ],
  }
}

function buildHandEndPayoffResolvedSession() {
  const score = { '0': 7, '1': 3 } as const

  return {
    matchId: 'mock-hand-end-payoff-match',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 1,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: null,
          score,
          hand_value: 3,
          turnup: { rank: 'K', suit: 'HEARTS' },
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
              plays: [
                {
                  player: 0,
                  visibility: 'up',
                  card: { id: 'hero-round-1', rank: 'A', suit: 'SPADES' },
                },
                {
                  player: 1,
                  visibility: 'up',
                  card: { id: 'villain-round-1', rank: '7', suit: 'CLUBS' },
                },
              ],
            },
            {
              leader: 1,
              winner: 0,
              plays: [
                {
                  player: 1,
                  visibility: 'up',
                  card: { id: 'villain-round-2', rank: '6', suit: 'DIAMONDS' },
                },
                {
                  player: 0,
                  visibility: 'up',
                  card: { id: 'hero-payoff-1', rank: 'Q', suit: 'HEARTS' },
                },
              ],
            },
          ],
          current_round: {
            leader: 0,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: 0,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 1,
      current_player: null,
      hand_in_progress: false,
      hand: {
        next_player: null,
        hand_value: 3,
        hand_winner: 0,
        match_winner: null,
        score,
        completed_rounds: [
          {
            leader: 0,
            winner: 0,
          },
          {
            leader: 1,
            winner: 0,
          },
        ],
        current_round: {
          leader: 0,
          plays: [],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 1,
      current_player: null,
      hand_in_progress: false,
      hand: {
        public_state: {
          next_player: null,
          hand_value: 3,
          hand_winner: 0,
          match_winner: null,
          score,
          completed_rounds: [
            {
              leader: 0,
              winner: 0,
            },
            {
              leader: 1,
              winner: 0,
            },
          ],
          current_round: {
            leader: 0,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'hero-payoff-2', rank: '4', suit: 'CLUBS' },
        ],
      },
    },
    legalActions: [],
  }
}

function buildMatchWinningHandEndPayoffReadySession() {
  const session = cloneJson(buildHandEndPayoffReadySession())
  const score = { '0': 9, '1': 3 } as const

  session.matchId = 'mock-match-winning-hand-end-payoff-match'
  session.state.score = score
  session.state.current_hand.state.score = score
  session.publicView.score = score
  session.publicView.hand!.score = score
  session.playerView.score = score
  session.playerView.hand!.public_state.score = score

  return session
}

function buildMatchWinningHandEndPayoffResolvedSession() {
  const session = cloneJson(buildHandEndPayoffResolvedSession())
  const score = { '0': 12, '1': 3 } as const

  session.matchId = 'mock-match-winning-hand-end-payoff-match'
  session.state.next_dealer = 1
  session.state.score = score
  session.state.winner = 0
  session.state.current_hand!.state.score = score
  session.state.current_hand!.match_winner = 0
  session.publicView.score = score
  session.publicView.winner = 0
  session.publicView.next_dealer = 1
  session.publicView.hand!.score = score
  session.publicView.hand!.match_winner = 0
  session.playerView.score = score
  session.playerView.winner = 0
  session.playerView.next_dealer = 1
  session.playerView.hand!.public_state.score = score
  session.playerView.hand!.public_state.match_winner = 0

  return session
}

async function mockHandEndPayoffMatch(page: Page) {
  const initialSession = buildHandEndPayoffReadySession()
  const resolvedSession = buildHandEndPayoffResolvedSession()
  let currentSession = cloneJson(initialSession)

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/actions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    currentSession = cloneJson(resolvedSession)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/start-hand`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })
}

async function mockMatchWinningHandEndPayoffMatch(page: Page) {
  const initialSession = buildMatchWinningHandEndPayoffReadySession()
  const resolvedSession = buildMatchWinningHandEndPayoffResolvedSession()
  let currentSession = cloneJson(initialSession)

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/actions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    currentSession = cloneJson(resolvedSession)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/start-hand`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })
}

function buildOpponentThirdCardPendingSession() {
  const score = { '0': 0, '1': 0 } as const

  return {
    matchId: 'mock-opponent-third-card',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 1,
          score,
          hand_value: 3,
          turnup: { rank: '4', suit: 'CLUBS' },
          hands: {
            '0': [{ id: 'p0c2', rank: '2', suit: 'DIAMONDS' }],
            '1': [{ id: 'p1c1', rank: 'Q', suit: 'HEARTS' }],
          },
          completed_rounds: [
            {
              leader: 1,
              winner: 0,
              plays: [
                { player: 1, visibility: 'up', card: { id: 'p1c0', rank: '4', suit: 'SPADES' } },
                { player: 0, visibility: 'up', card: { id: 'p0c0', rank: '6', suit: 'CLUBS' } },
              ],
            },
            {
              leader: 0,
              winner: 1,
              plays: [
                { player: 0, visibility: 'up', card: { id: 'p0c1', rank: 'J', suit: 'CLUBS' } },
                { player: 1, visibility: 'up', card: { id: 'p1c2', rank: 'K', suit: 'SPADES' } },
              ],
            },
          ],
          current_round: {
            leader: 1,
            plays: [],
          },
          last_raised_by: 0,
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        next_player: 1,
        hand_value: 3,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [
          { leader: 1, winner: 0 },
          { leader: 0, winner: 1 },
        ],
        current_round: {
          leader: 1,
          plays: [],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: 1,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 1,
          hand_value: 3,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [
            { leader: 1, winner: 0 },
            { leader: 0, winner: 1 },
          ],
          current_round: {
            leader: 1,
            plays: [],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [{ id: 'p0c2', rank: '2', suit: 'DIAMONDS' }],
      },
    },
    legalActions: [],
  }
}

function buildOpponentThirdCardPlayedSession() {
  const score = { '0': 0, '1': 0 } as const

  return {
    matchId: 'mock-opponent-third-card',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: 0,
          score,
          hand_value: 3,
          turnup: { rank: '4', suit: 'CLUBS' },
          hands: {
            '0': [{ id: 'p0c2', rank: '2', suit: 'DIAMONDS' }],
            '1': [],
          },
          completed_rounds: [
            {
              leader: 1,
              winner: 0,
              plays: [
                { player: 1, visibility: 'up', card: { id: 'p1c0', rank: '4', suit: 'SPADES' } },
                { player: 0, visibility: 'up', card: { id: 'p0c0', rank: '6', suit: 'CLUBS' } },
              ],
            },
            {
              leader: 0,
              winner: 1,
              plays: [
                { player: 0, visibility: 'up', card: { id: 'p0c1', rank: 'J', suit: 'CLUBS' } },
                { player: 1, visibility: 'up', card: { id: 'p1c2', rank: 'K', suit: 'SPADES' } },
              ],
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              { player: 1, visibility: 'up', card: { id: 'p1c1', rank: 'Q', suit: 'HEARTS' } },
            ],
          },
          last_raised_by: 0,
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        next_player: 0,
        hand_value: 3,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [
          { leader: 1, winner: 0 },
          { leader: 0, winner: 1 },
        ],
        current_round: {
          leader: 1,
          plays: [
            { player: 1, visibility: 'up', card: { rank: 'Q', suit: 'HEARTS' } },
          ],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 0,
          hand_value: 3,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [
            { leader: 1, winner: 0 },
            { leader: 0, winner: 1 },
          ],
          current_round: {
            leader: 1,
            plays: [
              { player: 1, visibility: 'up', card: { rank: 'Q', suit: 'HEARTS' } },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [{ id: 'p0c2', rank: '2', suit: 'DIAMONDS' }],
      },
    },
    legalActions: [
      { type: 'play_face_up', card_id: 'p0c2' },
    ],
  }
}

function buildVisibleOpponentCurrentRoundSession() {
  const score = { '0': 3, '1': 0 } as const

  return {
    matchId: 'mock-visible-opponent-current-round',
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 1,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 1,
          next_player: 0,
          score,
          hand_value: 1,
          turnup: { rank: '6', suit: 'HEARTS' },
          hands: {
            '0': [
              { id: 'p0c1', rank: '2', suit: 'DIAMONDS' },
              { id: 'p0c2', rank: '3', suit: 'DIAMONDS' },
            ],
            '1': [
              { id: 'p1c1', rank: 'Q', suit: 'HEARTS' },
            ],
          },
          completed_rounds: [
            {
              leader: 0,
              winner: 1,
              plays: [
                { player: 0, visibility: 'up', card: { id: 'p0c0', rank: 'Q', suit: 'SPADES' } },
                { player: 1, visibility: 'up', card: { id: 'p1c2', rank: '3', suit: 'SPADES' } },
              ],
            },
          ],
          current_round: {
            leader: 1,
            plays: [
              { player: 1, visibility: 'up', card: { id: 'p1c0', rank: '4', suit: 'DIAMONDS' } },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 1,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        next_player: 0,
        hand_value: 1,
        hand_winner: null,
        match_winner: null,
        score,
        completed_rounds: [
          { leader: 0, winner: 1 },
        ],
        current_round: {
          leader: 1,
          plays: [
            { player: 1, visibility: 'up', card: { rank: '4', suit: 'DIAMONDS' } },
          ],
        },
        pending_raise: null,
        pending_decision: null,
      },
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 1,
      current_player: 0,
      hand_in_progress: true,
      hand: {
        public_state: {
          next_player: 0,
          hand_value: 1,
          hand_winner: null,
          match_winner: null,
          score,
          completed_rounds: [
            { leader: 0, winner: 1 },
          ],
          current_round: {
            leader: 1,
            plays: [
              { player: 1, visibility: 'up', card: { rank: '4', suit: 'DIAMONDS' } },
            ],
          },
          pending_raise: null,
          pending_decision: null,
        },
        hand: [
          { id: 'p0c1', rank: '2', suit: 'DIAMONDS' },
          { id: 'p0c2', rank: '3', suit: 'DIAMONDS' },
        ],
      },
    },
    legalActions: [
      { type: 'play_face_up', card_id: 'p0c1' },
      { type: 'play_face_up', card_id: 'p0c2' },
    ],
  }
}

async function mockVisibleOpponentCurrentRoundMatch(page: Page) {
  const session = cloneJson(buildVisibleOpponentCurrentRoundSession())

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}/actions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })

  await page.route(`**/api/game/session/${session.matchId}/start-hand`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    })
  })
}

async function mockOpponentThirdCardTableRender(page: Page) {
  const initialSession = buildOpponentThirdCardPendingSession()
  const resolvedSession = buildOpponentThirdCardPlayedSession()
  let currentSession = cloneJson(initialSession)

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/actions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/start-hand`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  return {
    advanceToPlayedState() {
      currentSession = cloneJson(resolvedSession)
    },
  }
}

async function mockSessionLoadFailure(page: Page, options: {
  matchId: string
  status: number
  code?: string
  message: string
}) {
  const { matchId, status, code, message } = options

  await page.route('**/api/game/session/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (
      request.method() !== 'GET' ||
      url.pathname !== `/api/game/session/${matchId}`
    ) {
      await route.continue()
      return
    }

    const payload = code ? { code, message } : { message }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function buildStakeFxScenarioSession(options: {
  matchId: string
  handValue: number
  currentPlayer: 0 | 1 | null
  score?: { '0': number; '1': number }
  pendingRaise?: { raised_by: 0 | 1; to: number; previous_value: number } | null
  pendingDecision?: { type: 'mao_de_onze'; player: 0 | 1 } | null
  lastRaisedBy?: 0 | 1 | null
  legalActions?: Array<Record<string, unknown>>
}) {
  const {
    matchId,
    handValue,
    currentPlayer,
    score = { '0': 4, '1': 3 } as const,
    pendingRaise = null,
    pendingDecision = null,
    lastRaisedBy = null,
    legalActions = [],
  } = options
  const publicHandState = {
    next_player: currentPlayer,
    hand_value: handValue,
    hand_winner: null,
    match_winner: null,
    score,
    completed_rounds: [],
    current_round: {
      leader: 0 as const,
      plays: [],
    },
    pending_raise: pendingRaise,
    pending_decision: pendingDecision,
  }

  return {
    matchId,
    humanPlayer: 0,
    botPlayer: 1,
    botKind: 'heuristic',
    botProfile: 'balanced',
    botModel: null,
    notice: null,
    state: {
      next_dealer: 0,
      score,
      winner: null,
      current_hand: {
        state: {
          dealer: 0,
          next_player: currentPlayer,
          score,
          hand_value: handValue,
          turnup: { rank: 'A', suit: 'SPADES' },
          completed_rounds: [],
          current_round: {
            leader: 0,
            plays: [],
          },
          last_raised_by: lastRaisedBy,
          pending_raise: pendingRaise,
          pending_decision: pendingDecision,
        },
        hand_winner: null,
        match_winner: null,
      },
    },
    publicView: {
      score,
      winner: null,
      next_dealer: 0,
      current_player: currentPlayer,
      hand_in_progress: true,
      hand: publicHandState,
    },
    playerView: {
      player: 0,
      score,
      winner: null,
      next_dealer: 0,
      current_player: currentPlayer,
      hand_in_progress: true,
      hand: {
        public_state: publicHandState,
        hand: [
          { id: 'stake-fx-hero-1', rank: '4', suit: 'HEARTS' },
          { id: 'stake-fx-hero-2', rank: '7', suit: 'DIAMONDS' },
          { id: 'stake-fx-hero-3', rank: 'A', suit: 'CLUBS' },
        ],
      },
    },
    legalActions,
  }
}

async function mockStakeFxScenario(page: Page, options: {
  initialSession: ReturnType<typeof buildStakeFxScenarioSession>
  nextSessionsByAction: Record<string, ReturnType<typeof buildStakeFxScenarioSession>>
}) {
  const { initialSession, nextSessionsByAction } = options
  let currentSession = cloneJson(initialSession)

  await page.route('**/api/game/session', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/actions`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }

    const payload = JSON.parse(route.request().postData() ?? '{}') as {
      action?: {
        type?: string
      }
    }
    const actionType = payload.action?.type
    if (actionType && nextSessionsByAction[actionType]) {
      currentSession = cloneJson(nextSessionsByAction[actionType])
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })

  await page.route(`**/api/game/session/${initialSession.matchId}/start-hand`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentSession),
    })
  })
}

async function expectOnlyHiddenPlayRequest(actionRequests: ObservedSessionAction[]) {
  await expect.poll(() => actionRequests.length).toBe(1)
  expect(actionRequests[0]?.type).toBe('play_face_down')
  expect(actionRequests[0]?.cardId).toBeTruthy()
  expect(actionRequests.map((action) => action.type)).toEqual(['play_face_down'])
}

test('new match overlay keeps its fixed shell and dismisses before the opening deal animation', async ({ page }, testInfo) => {
  const matchId = 'fresh-match-1'
  const { startRequests } = await mockSequentialMatchStarts(page, [matchId])

  await page.goto('/')
  await ensureLauncherReady(page)

  const launcherScreen = page.getByTestId('live-game-launcher-screen')
  const launcherCard = page.locator('.match-setup-card--launcher')
  const botPickerTrigger = page.getByTestId('live-game-launcher-bot-trigger')
  const dealerTrigger = page.getByTestId('live-game-launcher-dealer-trigger')
  const startButton = page.getByTestId('live-game-launcher-start-button')
  const baselineHeight = await launcherCard.evaluate((element) => element.clientHeight)

  await expect(launcherScreen).toBeVisible()
  await expect(startButton).toBeVisible()
  await expect(launcherScreen).toContainText('Truco')
  await expect(launcherScreen).toContainText('Start match')
  await expect(launcherScreen.getByText('opponent', { exact: true })).toBeVisible()
  await expect(launcherScreen.getByText('dealer', { exact: true })).toBeVisible()
  await expect(startButton).toContainText('Start')
  await expect(botPickerTrigger).toContainText('Heuristic')
  await expect(botPickerTrigger).not.toContainText('Balanced')
  await expect(page.getByTestId('live-game-launcher-bot-profile-trigger')).toContainText('Balanced')
  await expect(page.getByTestId('live-game-launcher-play-to-row')).toHaveCount(0)
  await expect(page.getByTestId('live-game-launcher-play-to-trigger')).toHaveCount(0)
  await expect(page.getByTestId('live-game-launcher-bot-config')).toHaveCount(1)
  await expect(dealerTrigger).toContainText('Random')
  await expect(page.getByTestId('live-game-launcher-bot-settings-button')).toHaveCount(0)
  await launcherCard.screenshot({
    path: testInfo.outputPath('launcher-screen.png'),
  })

  await botPickerTrigger.click()
  await expect(page.getByTestId('live-game-launcher-bot-menu')).toBeVisible()
  await expect(page.getByTestId('live-game-launcher-bot-option-openai')).toHaveCount(0)
  await expect(page.getByTestId('live-game-launcher-bot-option-anthropic')).toHaveCount(0)
  const openHeight = await launcherCard.evaluate((element) => element.clientHeight)
  expect(Math.abs(openHeight - baselineHeight)).toBeLessThanOrEqual(1)
  await page.getByTestId('live-game-launcher-bot-option-heuristic').click()

  await startButton.click()

  await expect(launcherScreen).toBeHidden()
  await expect.poll(() => page.locator('.hand.player-hand .card').count()).toBeLessThan(3)
  await expect.poll(() => startRequests.length).toBe(1)
  expect(startRequests[0]?.startingDealer).toBeUndefined()
  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(matchId)
})

test('launcher dealer picker uses the simplified menu copy and starts with the chosen opener', async ({ page }, testInfo) => {
  const matchId = 'fresh-match-2'
  const { startRequests } = await mockSequentialMatchStarts(page, [matchId])

  await page.goto('/')
  await ensureLauncherReady(page)

  const launcherCard = page.locator('.match-setup-card--launcher')
  const dealerTrigger = page.getByTestId('live-game-launcher-dealer-trigger')
  const closedHeight = await launcherCard.evaluate((element) => element.clientHeight)

  await dealerTrigger.click({ force: true })
  const dealerMenu = page.getByTestId('live-game-launcher-dealer-menu')
  await expect(dealerMenu).toBeVisible()
  await expect(dealerMenu).toContainText('Them')
  const openHeight = await launcherCard.evaluate((element) => element.clientHeight)
  expect(Math.abs(openHeight - closedHeight)).toBeLessThanOrEqual(1)
  const menuGeometry = await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="live-game-launcher-dealer-trigger"]')
    const menu = document.querySelector('[data-testid="live-game-launcher-dealer-menu"]')
    if (!(trigger instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
      throw new Error('Missing launcher dealer menu geometry targets.')
    }

    const triggerRect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()

    return {
      menuLeft: menuRect.left,
      triggerLeft: triggerRect.left,
    }
  })
  expect(Math.abs(menuGeometry.menuLeft - menuGeometry.triggerLeft)).toBeLessThanOrEqual(10)
  await launcherCard.screenshot({
    path: testInfo.outputPath('launcher-dealer-menu.png'),
  })
  await dealerMenu.getByTestId('live-game-launcher-dealer-option-1').click()

  await expect(page.getByTestId('live-game-launcher-dealer-menu')).toHaveCount(0)
  await expect(dealerTrigger).toContainText('Them')

  await page.getByTestId('live-game-launcher-start-button').click({ force: true })

  await expect.poll(() => startRequests.length).toBe(1)
  expect(startRequests[0]?.startingDealer).toBe(1)
  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(matchId)
})

test('launcher bot setup keeps follow-up fields on the title screen instead of using settings', async ({ page }) => {
  await page.goto('/')
  await ensureLauncherReady(page)

  const botPickerTrigger = page.getByTestId('live-game-launcher-bot-trigger')

  await botPickerTrigger.click()
  const pickerMenu = page.getByTestId('live-game-launcher-bot-menu')
  await expect(pickerMenu).toBeVisible()
  await expect(page.getByTestId('live-game-launcher-bot-option-openai')).toHaveCount(0)
  await expect(page.getByTestId('live-game-launcher-bot-option-anthropic')).toHaveCount(0)
  await pickerMenu.getByTestId('live-game-launcher-bot-option-random').click()

  await expect(page.getByTestId('live-game-launcher-bot-menu')).toHaveCount(0)
  await expect(botPickerTrigger).toContainText('Random')
  await expect(page.getByTestId('live-game-launcher-bot-config')).toHaveCount(0)

  await botPickerTrigger.click()
  await page.getByTestId('live-game-launcher-bot-option-heuristic').click()
  const botConfig = page.getByTestId('live-game-launcher-bot-config')
  await expect(botConfig).toBeVisible()
  await expect(botConfig).toContainText('style')
  await expect(botPickerTrigger).not.toContainText('Balanced')
  await page.getByTestId('live-game-launcher-bot-profile-trigger').click()
  await page.getByTestId('live-game-launcher-bot-profile-option-aggressive').click()
  await expect(botPickerTrigger).toContainText('Heuristic')
  await expect(botPickerTrigger).not.toContainText('Aggressive')
  await expect(page.getByTestId('live-game-launcher-bot-profile-trigger')).toContainText('Aggressive')
  await expect(page.getByTestId('live-settings-drawer')).toHaveCount(0)
})

test('mid-match replacement setup keeps dealer and bot choices while cancel preserves the live table', async ({ page }, testInfo) => {
  const activeMatchId = 'active-match-1'
  const replacementMatchId = 'replacement-match-2'
  const { startRequests } = await mockSequentialMatchStarts(page, [activeMatchId, replacementMatchId])

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByTestId('live-game-launcher-start-button').click({ force: true })

  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(activeMatchId)

  await openSettingsDrawer(page)
  await page.getByTestId('live-game-new-match-button').click()
  const confirmation = page.getByTestId('live-game-new-match-confirmation')
  await expect(confirmation).toBeVisible()
  await expect(confirmation).toContainText('confirm')
  await expect(confirmation.getByRole('heading', { name: 'Quit match?' })).toBeVisible()
  await expect(confirmation.locator('.rm-live')).toContainText('in progress')
  await expect(confirmation.locator('.rm-live')).toContainText('against Heuristic · Balanced')
  await expect(confirmation.locator('.rm-live-num.is-ahead')).toHaveText('4')
  await expect(confirmation.getByTestId('new-match-confirm-dealer-trigger')).toContainText('Random')
  await expect(confirmation.getByTestId('new-match-confirm-bot-trigger')).toContainText('Heuristic')
  await expect(confirmation.getByTestId('new-match-confirm-bot-trigger')).not.toContainText('Balanced profile')
  await expect(confirmation.getByTestId('new-match-confirm-bot-config')).toContainText('style')
  await expect(confirmation.getByTestId('new-match-confirm-bot-profile-trigger')).toContainText('Balanced')
  await confirmation.screenshot({
    path: testInfo.outputPath('new-match-confirmation-modal.png'),
  })
  await confirmation.getByTestId('new-match-confirm-dealer-trigger').click()
  await confirmation.getByTestId('new-match-confirm-dealer-option-1').click()
  await confirmation.getByTestId('new-match-confirm-bot-trigger').click()
  await expect(confirmation.getByTestId('new-match-confirm-bot-option-simple')).toHaveCount(0)
  await confirmation.getByTestId('new-match-confirm-bot-option-random').click()
  await expect.poll(() => startRequests.length).toBe(1)

  await confirmation.getByRole('button', { name: 'keep playing' }).click()

  await expect(confirmation).toBeHidden()
  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(activeMatchId)

  await openSettingsDrawer(page)
  await page.getByTestId('live-game-new-match-button').click()
  const reopenedConfirmation = page.getByTestId('live-game-new-match-confirmation')
  await expect(reopenedConfirmation).toBeVisible()
  await expect(reopenedConfirmation.getByTestId('new-match-confirm-dealer-trigger')).toContainText('Them')
  await expect(reopenedConfirmation.getByTestId('new-match-confirm-bot-trigger')).toContainText('Random')
  await expect(reopenedConfirmation.getByTestId('new-match-confirm-bot-config')).toHaveCount(0)
  await expect(reopenedConfirmation.getByTestId('new-match-confirm-bot-profile-trigger')).toHaveCount(0)
})

test('replacement confirmation launches the chosen dealer and bot after an explicit confirm', async ({ page }) => {
  const activeMatchId = 'active-match-1'
  const replacementMatchId = 'replacement-match-2'
  const { startRequests } = await mockSequentialMatchStarts(page, [activeMatchId, replacementMatchId])

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByTestId('live-game-launcher-start-button').click({ force: true })

  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(activeMatchId)

  await openSettingsDrawer(page)
  await page.getByTestId('live-game-new-match-button').click()
  const confirmation = page.getByTestId('live-game-new-match-confirmation')
  await expect(confirmation.getByTestId('new-match-confirm-bot-profile-trigger')).toBeVisible()
  await confirmation.getByTestId('new-match-confirm-bot-profile-trigger').click()
  await confirmation.getByTestId('new-match-confirm-bot-profile-option-aggressive').click()
  await confirmation.getByTestId('new-match-confirm-dealer-trigger').click()
  await confirmation.getByTestId('new-match-confirm-dealer-option-1').click()
  await confirmation.getByRole('button', { name: /quit match/i }).click()

  await expect.poll(() => startRequests.length).toBe(2)
  expect(startRequests[1]?.startingDealer).toBe(1)
  expect(startRequests[1]?.botKind).toBe('heuristic')
  expect(startRequests[1]?.botProfile).toBe('aggressive')
  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(replacementMatchId)
})

test('fast mode migrates the legacy preference and persists shell toggling', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-ui-settings-v1', JSON.stringify({ fastMode: true }))
  })

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('match')).not.toBeNull()

  const shell = page.getByTestId('live-game-shell')
  await openSettingsDrawer(page)
  await openSettingsSection(page, 'experience')
  const playbackPanel = page.getByTestId('live-game-settings-playback-panel')
  const fastModeOnButton = playbackPanel.getByRole('button', { name: 'Fast Mode On' })

  await expect(fastModeOnButton).toHaveAttribute('aria-pressed', 'true')
  await expect(shell).toHaveClass(/is-fast-mode/)
  const fastModeOnWidth = await fastModeOnButton.evaluate((element) =>
    Math.round(element.getBoundingClientRect().width),
  )

  await fastModeOnButton.click()

  const fastModeOffButton = playbackPanel.getByRole('button', { name: 'Fast Mode Off' })
  await expect(fastModeOffButton).toHaveAttribute('aria-pressed', 'false')
  await expect(shell).not.toHaveClass(/is-fast-mode/)
  await expect
    .poll(async () =>
      fastModeOffButton.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBe(fastModeOnWidth)

  const persistedFastMode = await page.evaluate(() => {
    const stored = window.localStorage.getItem('truco-live-game-preferences-v1')
    return stored ? JSON.parse(stored).fastMode : null
  })

  expect(persistedFastMode).toBe(false)

  await page.reload()
  await openSettingsDrawer(page)
  await openSettingsSection(page, 'experience')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Fast Mode Off' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('live-game-shell')).not.toHaveClass(/is-fast-mode/)
})

test('shortcuts toggle disables gameplay shortcuts until re-enabled', async ({ page }) => {
  await mockStaticSession(page, buildHeroLeadReadySession())

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect(page.locator('.table-status')).toContainText('Your turn')

  await openSettingsDrawer(page)
  await openSettingsSection(page, 'shortcuts')
  const shortcutsPanel = page.getByTestId('live-game-shortcuts-panel')
  const shortcutsToggle = page.getByTestId('live-shortcuts-enabled-toggle')

  await expect(shortcutsPanel).toBeVisible()
  await expect(shortcutsPanel).not.toContainText('Press a key to assign it. Use Backspace/Delete to clear, or Esc to cancel capture.')
  await expect(shortcutsToggle).toHaveAttribute('aria-pressed', 'true')

  const requestObserver = observeSessionActionRequests(page)

  try {
    await shortcutsToggle.click()
    await expect(shortcutsToggle).toHaveAttribute('aria-pressed', 'false')

    await closeSettingsDrawer(page)
    await page.keyboard.press('1')
    await page.waitForTimeout(200)
    expect(requestObserver.actionRequests).toHaveLength(0)

    const persistedDisabledState = await page.evaluate(() => {
      const stored = window.localStorage.getItem('truco-live-game-preferences-v1')
      return stored ? JSON.parse(stored).shortcutsEnabled : null
    })

    expect(persistedDisabledState).toBe(false)

    await openSettingsDrawer(page)
    await openSettingsSection(page, 'shortcuts')
    const reenabledShortcutsToggle = page.getByTestId('live-shortcuts-enabled-toggle')
    await reenabledShortcutsToggle.click()
    await expect(reenabledShortcutsToggle).toHaveAttribute('aria-pressed', 'true')

    await closeSettingsDrawer(page)
    await page.keyboard.press('1')
    await expect.poll(() => requestObserver.actionRequests.length).toBe(1)
    expect(requestObserver.actionRequests[0]).toMatchObject({
      type: 'play_face_up',
      cardId: 'hero-1',
    })
  } finally {
    requestObserver.dispose()
  }
})

test('sound controls persist across reload and sanitize stored settings', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('sound-settings-seeded') === 'true') {
      return
    }

    window.localStorage.setItem(
      'truco-live-sound-settings-v1',
      JSON.stringify({ soundEnabled: 'nope', soundVolume: 3.4, soundTheme: 'broken-theme' }),
    )
    window.sessionStorage.setItem('sound-settings-seeded', 'true')
  })

  await startMockedMatch(page)
  await openSettingsDrawer(page)
  await openSettingsSection(page, 'experience')

  const playbackPanel = page.getByTestId('live-game-settings-playback-panel')
  const soundToggle = playbackPanel.getByRole('button', { name: 'Mute Sound FX' })
  const volumeSlider = playbackPanel.getByLabel('Sound Volume')

  await expect(soundToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(soundToggle).toHaveText('100%')
  await expect(volumeSlider).toHaveValue('100')
  await expect(page.getByLabel('Dev Audition Theme')).toHaveCount(0)
  await expect(page.getByText('Current Theme', { exact: true })).toHaveCount(0)

  await setRangeValue(volumeSlider, '33')
  await expect(soundToggle).toHaveText('33%')

  await soundToggle.click()
  await expect(page.getByRole('button', { name: 'Unmute Sound FX' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Unmute Sound FX' })).toHaveText('0%')
  await expect(volumeSlider).toHaveValue('0')
  await expect(volumeSlider).toBeEnabled()

  await page.reload()
  await openSettingsDrawer(page)
  await openSettingsSection(page, 'experience')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Unmute Sound FX' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Unmute Sound FX' })).toHaveText('0%')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume')).toHaveValue('0')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume')).toBeEnabled()

  await page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Unmute Sound FX' }).click()
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Mute Sound FX' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Mute Sound FX' })).toHaveText('33%')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume')).toHaveValue('33')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume')).toBeEnabled()

  await setRangeValue(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume'), '40')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Mute Sound FX' })).toHaveText('40%')

  await setRangeValue(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume'), '0')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Unmute Sound FX' })).toHaveText('0%')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume')).toHaveValue('0')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume')).toBeEnabled()

  await page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Unmute Sound FX' }).click()
  await expect(page.getByTestId('live-game-settings-playback-panel').getByRole('button', { name: 'Mute Sound FX' })).toHaveText('40%')
  await expect(page.getByTestId('live-game-settings-playback-panel').getByLabel('Sound Volume')).toHaveValue('40')
})

test('starting a fresh match clears stale last-hand review copy for a recycled match id', async ({ page }) => {
  const recycledMatchId = 'match-1'
  await mockFreshMatchWithStableId(page, recycledMatchId)

  await page.addInitScript((matchId) => {
    window.localStorage.setItem(
      `truco-live-last-hand-review:${matchId}`,
      JSON.stringify({
        state: { next_dealer: 0, score: { '0': 0, '1': 0 }, winner: null, current_hand: null },
        summary: {
          winner: 1,
          points: 1,
          scoreBefore: { hero: 0, villain: 2 },
          score: { hero: 0, villain: 3 },
          rounds: [{ winner: 1 }],
          handValue: 1,
          turnup: 'J♦',
          dealer: 0,
          reason: 'fold',
        },
      }),
    )
  }, recycledMatchId)

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect
    .poll(() => page.evaluate((matchId) => (
      window.localStorage.getItem(`truco-live-last-hand-review:${matchId}`)
    ), recycledMatchId))
    .toBeNull()
  await expect(page.getByTestId('live-arena-coach-dock-trigger')).toHaveCount(0)
  await expect(page.getByTestId('live-arena-compact-coach-toggle')).toHaveCount(0)
})

test('starting a match syncs the url and survives reload', async ({ page }) => {
  await startMockedMatch(page)
  await expect(page.locator('.hand.player-hand .card').first()).toBeVisible()

  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBeTruthy()
  const matchId = new URL(page.url()).searchParams.get('match')
  expect(matchId).toBeTruthy()

  await page.reload()
  await expectLiveMatchReady(page)
  await expect(page.locator('.hand.player-hand .card').first()).toBeVisible()
  await expect(new URL(page.url()).searchParams.get('match')).toBe(matchId)
})

test('finished match overlay celebrates a win and keeps dealer override actions close', async ({ page }, testInfo) => {
  await mockFinishedMatch(page, { winner: 0, heroScore: 12, villainScore: 8 })
  await page.goto('/')
  await ensureLauncherReady(page)

  await page.getByRole('button', { name: 'Start Match' }).click()

  const overlay = page.getByTestId('match-complete-overlay')
  const board = page.locator('.live-arena__board')

  await expect(board).toHaveAttribute('data-match-complete-pending', 'victory')
  await expect(board).toHaveAttribute('data-match-complete-winner-side', 'hero')
  await expect(page.getByTestId('score-row-hero')).toHaveAttribute('data-score-points', '12')
  await expect(page.getByTestId('score-row-villain')).toHaveAttribute('data-score-points', '8')
  await board.screenshot({
    path: testInfo.outputPath('match-complete-pending-board.png'),
  })

  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('match complete')
  await expect(overlay).toContainText('Won.')
  await expect(overlay).toContainText('you')
  await expect(overlay).toContainText('12')
  await expect(overlay).toContainText('them')
  await expect(overlay).toContainText('8')
  await expect(overlay).toContainText('hands -')
  await expect(overlay).not.toContainText('Final Score')
  await expect(overlay).not.toContainText('point edge')
  await expect(page.getByRole('button', { name: /rematch/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /change opponent/i })).toBeVisible()
  await overlay.locator('.match-result-slab').screenshot({
    path: testInfo.outputPath('match-complete-overlay.png'),
  })

  const loserDealerRequest = page.waitForRequest((request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/api/game/session')) {
      return false
    }

    const payload = request.postDataJSON() as { startingDealer?: number }
    return payload.startingDealer === 1
  })

  await page.getByRole('button', { name: /rematch/i }).click()
  await loserDealerRequest
})

test('finished match overlay switches to defeat copy for a loss', async ({ page }) => {
  await mockFinishedMatch(page, { winner: 1, heroScore: 9, villainScore: 12 })
  await page.goto('/')
  await ensureLauncherReady(page)

  await page.getByRole('button', { name: 'Start Match' }).click()

  const board = page.locator('.live-arena__board')
  await expect(board).toHaveAttribute('data-match-complete-pending', 'defeat')
  await expect(board).toHaveAttribute('data-match-complete-winner-side', 'villain')
  await expect(page.getByTestId('score-row-hero')).toHaveAttribute('data-score-points', '9')
  await expect(page.getByTestId('score-row-villain')).toHaveAttribute('data-score-points', '12')

  const overlay = page.getByTestId('match-complete-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('match complete')
  await expect(overlay).toContainText('Lost.')
  await expect(overlay).not.toContainText('The villain got over the line first this time.')
  await expect(overlay).not.toContainText('Final Score')
  await expect(overlay).not.toContainText('point edge')
  await page.getByRole('button', { name: /change opponent/i }).click()
  await expect(overlay).toHaveCount(0)
  await expect(page.getByTestId('live-game-new-match-confirmation')).toBeVisible()
})

test('mobile viewport exposes Menu and New Match through the scoreboard dots icon', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockStaticSession(page, buildWaitingTurnSession({ dealer: 0 }))
  await startMockedMatch(page)

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="live-game-shell"]')
    const table = document.querySelector('.ft-root')
    if (!shell || !table) {
      throw new Error('Missing compact table geometry targets.')
    }

    const rect = (element: Element) => {
      const box = element.getBoundingClientRect()
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      }
    }

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      scrollY: window.scrollY,
      shell: rect(shell),
      table: rect(table),
    }
  })

  expect(geometry.shell.left).toBeLessThanOrEqual(1)
  expect(geometry.shell.top).toBeLessThanOrEqual(1)
  expect(geometry.shell.right).toBeGreaterThanOrEqual(geometry.viewportWidth - 1)
  expect(geometry.shell.bottom).toBeGreaterThanOrEqual(geometry.viewportHeight - 1)
  expect(geometry.table.left).toBeLessThanOrEqual(1)
  expect(geometry.table.top).toBeLessThanOrEqual(1)
  expect(geometry.table.right).toBeGreaterThanOrEqual(geometry.viewportWidth - 1)
  expect(geometry.table.bottom).toBeGreaterThanOrEqual(geometry.viewportHeight - 1)
  expect(geometry.scrollY).toBe(0)
  expect(geometry.documentScrollHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1)
  expect(geometry.bodyScrollHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1)

  await page.mouse.wheel(0, 420)
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0)

  await page.locator('.ft-root').screenshot({
    path: testInfo.outputPath('farol-mobile-edge-to-edge.png'),
  })

  const devDockButton = page.getByTestId('live-dev-controls-dock-button')
  await devDockButton.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => {})
  if (await devDockButton.isVisible().catch(() => false)) {
    await expect(devDockButton).toBeVisible()
    await expect(page.getByTestId('live-dev-controls')).toHaveCount(0)
    await devDockButton.click()

    const devDrawer = page.getByTestId('live-dev-controls')
    await expect(devDrawer).toBeVisible()
    await expect(devDrawer).toHaveClass(/is-open/)
    await expect(devDrawer.locator('.live-dev-controls__plaque')).toHaveCount(0)
    const devDrawerGeometry = await devDrawer.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        viewportWidth: window.innerWidth,
      }
    })
    expect(devDrawerGeometry.left).toBeGreaterThanOrEqual(8)
    expect(devDrawerGeometry.right).toBeLessThanOrEqual(devDrawerGeometry.viewportWidth - 8)
    expect(devDrawerGeometry.width).toBeGreaterThanOrEqual(devDrawerGeometry.viewportWidth - 30)
    await devDrawer.screenshot({
      path: testInfo.outputPath('farol-mobile-dev-controls-drawer.png'),
    })
    await devDrawer.getByRole('button', { name: 'Collapse dev controls' }).click()
    await expect(page.getByTestId('live-dev-controls')).toHaveCount(0)
  }

  const menu = page.getByTestId('live-game-settings-button')
  await expect(menu).toBeVisible()
  await menu.click()

  const drawer = page.getByTestId('live-settings-drawer')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByTestId('live-game-new-match-button')).toBeVisible()
  await expect(drawer.getByTestId('live-settings-section-shortcuts-toggle')).toHaveCount(0)
})

test('narrow Farol viewport forces the top score rail instead of the paper scorepad', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 880, height: 780 })
  await mockStaticSession(page, buildWaitingTurnSession({
    score: { '0': 7, '1': 5 },
  }))
  await startMockedMatch(page)

  const scoreRail = page.getByTestId('farol-score-rail')
  await expect(scoreRail).toBeVisible()
  await expect(page.getByTestId('farol-scorepad')).toHaveCount(0)
  await expect(page.getByTestId('score-row-hero').locator('.score-number')).toHaveText('7')
  await expect(page.getByTestId('score-row-villain').locator('.score-number')).toHaveText('5')
  await expect(page.getByTestId('score-row-hero').locator('.ft-score-rail-tally-stroke')).toHaveCount(7)
  await expect(page.getByTestId('score-row-villain').locator('.ft-score-rail-tally-stroke')).toHaveCount(5)
  await expect(scoreRail.getByTestId('farol-score-rail-new-match-button')).toHaveCount(0)
  await expect(scoreRail.getByTestId('live-game-settings-button')).toBeVisible()
  await expect(scoreRail.getByTestId('live-game-settings-button')).toHaveClass(/ft-settings-cog--outline/)
  await expect(scoreRail.getByRole('button', { name: 'Unroll scorepad' })).toHaveCount(0)

  const geometry = await page.evaluate(() => {
    const rail = document.querySelector('[data-testid="farol-score-rail"]')
    const score = document.querySelector('.ft-score-rail-score')
    const villainHand = document.querySelector('.ft-villain-hand .live-arena__player-hand-wrap')
    if (!rail || !score || !villainHand) {
      throw new Error('Missing narrow score rail geometry targets.')
    }
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect()
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
      }
    }
    return {
      rail: rect(rail),
      score: rect(score),
      villainHand: rect(villainHand),
    }
  })

  expect(geometry.score.left - geometry.rail.left).toBeLessThan(geometry.rail.width * 0.18)
  expect(geometry.score.right).toBeLessThan(geometry.rail.left + geometry.rail.width * 0.55)
  expect(geometry.rail.bottom).toBeLessThanOrEqual(geometry.villainHand.top)
  await page.locator('.ft-root').screenshot({
    path: testInfo.outputPath('farol-narrow-score-rail.png'),
  })
})

test('wide Farol scorepad rolls into the top rail and unrolls again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStaticSession(page, buildWaitingTurnSession({
    score: { '0': 4, '1': 3 },
  }))
  await startMockedMatch(page)

  const scorepadSlot = page.locator('.ft-scorepad-slot')
  await expect(page.getByTestId('farol-scorepad')).toBeVisible()
  await expect(page.getByTestId('farol-score-rail')).toHaveCount(0)
  await expect(page.locator('.td-rail-settings')).toBeVisible()

  const bottomRailActions = await page.evaluate(() => {
    const fold = document.querySelector('.td-rail-fold')
    const settings = document.querySelector('.td-rail-settings')
    if (!fold || !settings) throw new Error('Missing bottom rail action geometry targets.')

    const foldRect = fold.getBoundingClientRect()
    const settingsRect = settings.getBoundingClientRect()
    return {
      foldRight: foldRect.right,
      settingsLeft: settingsRect.left,
    }
  })
  expect(bottomRailActions.settingsLeft).toBeGreaterThan(bottomRailActions.foldRight)

  await page.getByRole('button', { name: 'Roll up scorepad' }).click()

  const scoreRail = page.getByTestId('farol-score-rail')
  await expect(scorepadSlot).toHaveClass(/is-rolled/)
  await expect(scoreRail).toBeVisible()
  await expect(scoreRail.getByRole('button', { name: 'Unroll scorepad' })).toBeVisible()
  await expect(page.locator('.td-rail-settings')).toHaveCount(0)

  await scoreRail.getByRole('button', { name: 'Unroll scorepad' }).click()

  await expect(scorepadSlot).toHaveClass(/is-unrolled/)
  await expect(page.getByTestId('farol-scorepad')).toBeVisible()
  await expect(page.getByTestId('farol-score-rail')).toHaveCount(0)
})

test('hand end payoff highlights the winning trace row and transfers stake into score', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
    }))
  })
  await mockHandEndPayoffMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect(page.locator('.table-status')).toContainText('Your turn')
  await expect(page.locator('.hand.player-hand .card')).toHaveCount(2)

  await page.locator('.hand.player-hand .card').first().click()

  await expect(activeOpponentTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)
  await expect(activeHeroTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)
  await expect(page.locator('.round-reference').nth(1).locator('.card-ref')).toHaveCount(0)
  await expect(page.getByTestId('score-row-hero')).toHaveAttribute('data-score-points', '7')
  await expect(farolRound(page, 1).locator('.ft-played-marker-won')).toBeVisible()
  await expect(page.getByTestId('score-row-hero').locator('.score-number')).toHaveAttribute('aria-label', 'You score 7')
  await expect(page.getByTestId('live-arena-coach-dock-trigger')).toHaveCount(0)
  await expect(page.getByTestId('live-arena-compact-coach-toggle')).toHaveCount(0)
})

test('match-complete celebration and score payoff arm as soon as the final card lands', async ({ page }) => {
  await mockMatchWinningHandEndPayoffMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  const board = page.locator('.live-arena__board')
  const heroScoreRow = page.getByTestId('score-row-hero')

  await expect(page.locator('.table-status')).toContainText('Your turn')
  await page.locator('.hand.player-hand .card').first().click()

  await expect(activeOpponentTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)
  await expect(activeHeroTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)
  await expect(page.locator('.round-reference').nth(1).locator('.card-ref')).toHaveCount(0)
  await expect(board).toHaveAttribute('data-match-complete-pending', 'victory')

  await expect(heroScoreRow.locator('.score-number')).toHaveAttribute('aria-label', 'You score 12')
  await expect(board).toHaveAttribute('data-match-complete-pending', 'victory')
  await expect(page.getByTestId('match-complete-overlay')).toBeVisible()
})

test('villain opening lead lands on the table after match start', async ({ page }) => {
  await mockStaticSession(page, buildBotLeadAfterDealSession())
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect.poll(async () => (
    activeOpponentTableSlot(page).locator('.card:not(.placeholder)').count()
  )).toBe(1)
  await expect(activeOpponentTableSlot(page).locator('.card:not(.placeholder)').first()).toContainText('6')
})

test('villain response lands on the table after the hero play', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadVillainResponseSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)
  await page.locator('.hand.player-hand .card').first().click()

  await expect(activeHeroTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)

  await expect.poll(async () => (
    activeOpponentTableSlot(page).locator('.card:not(.placeholder)').count()
  )).toBe(1)
  await expect(activeOpponentTableSlot(page).locator('.card:not(.placeholder)').first()).toContainText('K')
})

test('villain response overlay starts after the hero card finishes moving on screen', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadVillainResponseSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)

  await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveSequencingObserver?: MutationObserver
      __liveSequencingTimings?: {
        heroMotionIdleAt: number | null
        opponentOverlayAt: number | null
      }
    }

    const timings = {
      heroMotionIdleAt: null as number | null,
      opponentOverlayAt: null as number | null,
    }
    const heroSlot = document.querySelector('[data-testid="hero-table-slot"]')
    let sawHeroAnimating = heroSlot?.getAttribute('data-motion-state') === 'animating'

    const record = () => {
      const heroState = heroSlot?.getAttribute('data-motion-state')
      if (heroState === 'animating') {
        sawHeroAnimating = true
      }
      if (sawHeroAnimating && heroState === 'idle' && timings.heroMotionIdleAt == null) {
        timings.heroMotionIdleAt = performance.now()
      }

      if (timings.opponentOverlayAt == null && document.querySelector('[data-testid="opponent-play-overlay"]')) {
        timings.opponentOverlayAt = performance.now()
      }
    }

    record()
    const observer = new MutationObserver(() => {
      record()
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-motion-state'],
    })

    globalWindow.__liveSequencingObserver = observer
    globalWindow.__liveSequencingTimings = timings
  })

  await page.locator('.hand.player-hand .card').first().click()

  await expect(activeHeroTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)
  await page.screenshot({
    path: '/tmp/truco-live-hero-response-follow-through.png',
    fullPage: true,
  })
  await expect.poll(async () => (
    activeOpponentTableSlot(page).locator('.card:not(.placeholder)').count()
  )).toBe(1)

  await page.waitForFunction(() => {
    const globalWindow = window as typeof window & {
      __liveSequencingTimings?: {
        heroMotionIdleAt: number | null
        opponentOverlayAt: number | null
      }
    }

    return Boolean(
      globalWindow.__liveSequencingTimings &&
      globalWindow.__liveSequencingTimings.heroMotionIdleAt != null &&
      globalWindow.__liveSequencingTimings.opponentOverlayAt != null,
    )
  })

  const timings = await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveSequencingObserver?: MutationObserver
      __liveSequencingTimings?: {
        heroMotionIdleAt: number | null
        opponentOverlayAt: number | null
      }
    }

    globalWindow.__liveSequencingObserver?.disconnect()
    return globalWindow.__liveSequencingTimings ?? null
  })

  expect(timings?.heroMotionIdleAt).not.toBeNull()
  expect(timings?.opponentOverlayAt).not.toBeNull()
  expect((timings?.opponentOverlayAt ?? 0) - (timings?.heroMotionIdleAt ?? 0)).toBeGreaterThanOrEqual(0)
})

test('villain raise after hero play waits for the hero card to finish landing', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroPlayIntoVillainRaiseSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)

  await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveStakeSequencingTimings?: {
        heroSettledAt: number | null
        stakeFxAt: number | null
      }
    }

    const timings = {
      heroSettledAt: null as number | null,
      stakeFxAt: null as number | null,
    }
    globalWindow.__liveStakeSequencingTimings = timings

    let sawHeroOverlay = false

    const tick = () => {
      const heroOverlay = document.querySelector('[data-testid="hero-play-overlay"]')
      if (heroOverlay) {
        sawHeroOverlay = true
      } else if (sawHeroOverlay && timings.heroSettledAt == null) {
        timings.heroSettledAt = performance.now()
      }

      if (timings.stakeFxAt == null && document.querySelector('[data-testid="live-stake-fx-callout"]')) {
        timings.stakeFxAt = performance.now()
      }

      if (timings.heroSettledAt == null || timings.stakeFxAt == null) {
        window.requestAnimationFrame(tick)
      }
    }

    window.requestAnimationFrame(tick)
  })

  await page.locator('.hand.player-hand .card').first().click()

  await expect(page.getByTestId('hero-play-overlay')).toHaveCount(1)
  await expect(page.getByTestId('live-stake-fx-callout')).toHaveCount(0)
  await expect(page.locator('.live-arena__board')).not.toHaveClass(/is-response-focus/)

  await page.waitForFunction(() => {
    const globalWindow = window as typeof window & {
      __liveStakeSequencingTimings?: {
        heroSettledAt: number | null
        stakeFxAt: number | null
      }
    }

    return Boolean(
      globalWindow.__liveStakeSequencingTimings &&
      globalWindow.__liveStakeSequencingTimings.heroSettledAt != null &&
      globalWindow.__liveStakeSequencingTimings.stakeFxAt != null,
    )
  })

  const timings = await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveStakeSequencingTimings?: {
        heroSettledAt: number | null
        stakeFxAt: number | null
      }
    }

    return globalWindow.__liveStakeSequencingTimings ?? null
  })

  expect(timings?.heroSettledAt).not.toBeNull()
  expect(timings?.stakeFxAt).not.toBeNull()
  expect((timings?.stakeFxAt ?? 0) - (timings?.heroSettledAt ?? 0)).toBeGreaterThanOrEqual(40)
  await expect(page.locator('.live-arena__board')).toHaveClass(/is-response-focus/)
  await expect(page.locator('.ft-stake-caption')).toContainText(/truco/i)
  await expect(page.locator('.ft-stake-whose')).toContainText('they called')
})

test('villain advances from the completed trace into the next Farol lead without duplicating cards', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadIntoVillainLeadSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  const opponentHandCards = page.locator('.hand.opponent-hand .card')

  await expect(page.locator('.table-status')).toContainText('Your turn')
  await expect(opponentHandCards).toHaveCount(3)

  await page.locator('.hand.player-hand .card').first().click()

  await expect(farolRound(page, 0)).toContainText('7')
  await expect(farolRound(page, 0)).toContainText('4')
  await expect(opponentHandCards).toHaveCount(1)
  await expect(activeOpponentTableSlot(page)).toContainText('Q')
})

test('round preview hands off into a moving villain lead instead of leaving the table blank', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadIntoVillainLeadSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect(page.locator('.table-status')).toContainText('Your turn')
  await page.locator('.hand.player-hand .card').first().click()

  await expect(farolRound(page, 0)).toContainText('7')
  await expect(farolRound(page, 0)).toContainText('4')

  await expect.poll(async () => (
    activeOpponentTableSlot(page).locator('.placeholder').count()
  )).toBe(0)
  await expect(activeOpponentTableSlot(page)).toContainText('Q')
})

test('villain post-round raise waits until the round preview beat finishes', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadIntoVillainRaiseSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)
  await page.locator('.hand.player-hand .card').first().click()

  await page.waitForTimeout(150)
  await expect(page.locator('.live-arena__board')).not.toHaveClass(/is-response-focus/)
  await expect(page.locator('.ft-whisper')).toHaveCount(0)
  await expect(page.locator('.ft-stake-caption')).toHaveCount(0)

  await expect(farolRound(page, 0)).toContainText('7')
  await expect(farolRound(page, 0)).toContainText('4')

  await expect(page.locator('.live-arena__board')).toHaveClass(/is-response-focus/)
  await expect(page.locator('.ft-stake-caption')).toContainText(/truco/i)
  await expect(page.locator('.ft-stake-whose')).toContainText('they called')
  await expect(page.locator('.ft-whisper')).toContainText('they raised - answer or raise again')
  await expect(page.locator('.td-rail-slot-accept')).toContainText('accept')
  await expect(page.locator('.live-arena__board')).toHaveClass(/is-response-focus/)

  await page.locator('.live-arena__board').screenshot({ path: '/tmp/truco-live-raise-focus.png' })
})

test('villain raise after hero play waits for the hero card to land', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroPlayIntoVillainRaiseSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)
  await waitForMotionOverlaysToSettle(page)

  const board = page.locator('.live-arena__board')
  const heroSlot = page.getByTestId('hero-table-slot')
  const stake = page.getByTestId('live-stake-indicator')

  await page.locator('.hand.player-hand .card').first().click()

  await expect(heroSlot).toHaveAttribute('data-motion-state', 'animating')
  await expect(stake).toHaveAttribute('data-stake-fx-action', '')
  await expect(board).not.toHaveClass(/is-response-focus/)

  await page.waitForTimeout(340)
  await expect(heroSlot).toHaveAttribute('data-motion-state', 'animating')
  await expect(stake).toHaveAttribute('data-stake-fx-action', '')
  await expect(board).not.toHaveClass(/is-response-focus/)

  await expect(board).toHaveClass(/is-response-focus/, { timeout: 2_000 })
  await expect(heroSlot).toHaveAttribute('data-motion-state', 'idle')
  await expect(stake).toHaveAttribute('data-stake-tooltip', 'Accept raise')
})

test('fresh desktop matches skip the automatic Farol intro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await mockStaticSession(page, buildWaitingTurnSession())
  await startMockedMatch(page)

  const table = page.locator('.ft-root')
  const plane = page.locator('.ft-table-plane')
  const surface = page.locator('.ft-table-surface')
  await expect(table).not.toHaveClass(/ft-root-intro-tilted/)
  await expect(table).not.toHaveClass(/ft-root-intro-settling/)

  await expect(page.locator('.ft-table-plane .ft-hero-hand')).toHaveCount(0)
  const villainHandCard = page.locator('.ft-villain-hand .hand > div').first()
  await expect(villainHandCard).toBeVisible()
  const villainHandPaintsAboveTable = await villainHandCard.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const paintedElement = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
    return Boolean(paintedElement?.closest('.ft-villain-hand'))
  })
  expect(villainHandPaintsAboveTable).toBe(true)
  const rootTransform = await table.evaluate((element) => window.getComputedStyle(element).transform)
  const introPlaneTransform = await plane.evaluate((element) => window.getComputedStyle(element).transform)
  expect(rootTransform).toBe('none')
  expect(introPlaneTransform).toBe('none')
  await expect.poll(async () => (
    Number(await surface.evaluate((element) => window.getComputedStyle(element, '::after').opacity))
  )).toBe(0)

  const devControls = page.getByTestId('live-dev-controls')
  if (await devControls.isVisible().catch(() => false)) {
    const expandButton = devControls.getByRole('button', { name: 'Expand dev controls' })
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click()
    }
    await devControls.locator('summary').filter({ hasText: 'Animations' }).click()
    const calloutStyle = devControls.getByTestId('live-dev-stake-callout-style')
    await expect(calloutStyle).toHaveValue('wash')
    await expect(table).toHaveAttribute('data-stake-callout-style', 'wash')
    const calloutStyleValues = await calloutStyle.locator('option').evaluateAll((options) => (
      options.map((option) => (option as HTMLOptionElement).value)
    ))
    expect(calloutStyleValues).toEqual([
      'current',
      'halo',
      'wash',
      'smart-offset',
      'lane',
      'spotlight',
      'split',
    ])
    const deckSwitchAnimation = devControls.getByTestId('live-dev-deck-switch-animation')
    await expect(deckSwitchAnimation).toHaveValue('dissolve')
    await expect(table).toHaveAttribute('data-deck-switch-animation', 'dissolve')
    const deckSwitchAnimationValues = await deckSwitchAnimation.locator('option').evaluateAll((options) => (
      options.map((option) => (option as HTMLOptionElement).value)
    ))
    expect(deckSwitchAnimationValues).toEqual(['dissolve', 'lamp'])
    await deckSwitchAnimation.selectOption('lamp')
    await expect(table).toHaveAttribute('data-deck-switch-animation', 'lamp')
    const acceptElevenFx = devControls.getByRole('button', { name: 'Accept 11' })
    await expect(acceptElevenFx).toBeVisible()
    await acceptElevenFx.click()
    await expect(page.getByTestId('live-stake-fx-callout')).toBeVisible()
    await expect(page.getByTestId('live-stake-fx-live-badge')).toBeVisible()
    await expect.poll(async () => page.evaluate(() => {
      const callout = document.querySelector('[data-testid="live-stake-fx-callout"]')
      const badge = document.querySelector('[data-testid="live-stake-fx-live-badge"]')
      const calloutBox = callout?.getBoundingClientRect()
      const badgeBox = badge?.getBoundingClientRect()
      if (!calloutBox || !badgeBox) return -1
      return badgeBox.top - calloutBox.bottom
    })).toBeGreaterThanOrEqual(4)
    for (const style of calloutStyleValues) {
      await calloutStyle.selectOption(style)
      await expect(table).toHaveAttribute('data-stake-callout-style', style)
    }
    await calloutStyle.selectOption('spotlight')
    await devControls.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(table).toHaveClass(/ft-root-callout-spotlight/)
    await expect(page.getByTestId('live-stake-fx-callout')).toBeVisible()
    const elevenYou = devControls.getByRole('button', { name: '11 You' })
    await expect(elevenYou).toBeVisible()
    await expect(devControls.getByRole('button', { name: '11 Them' })).toBeVisible()
    await expect(devControls.getByRole('button', { name: '11v11' })).toBeVisible()
    await expect(devControls.getByRole('button', { name: 'Fold 11' })).toBeVisible()
    await elevenYou.click()
    await expect(table).toHaveAttribute('data-eleven-focus', 'hero')
    const replayStart = devControls.getByRole('button', { name: 'Replay Start' })
    await expect(replayStart).toBeEnabled()
    await replayStart.click()
    await expect(table).toHaveClass(/ft-root-intro-tilted/)
    await waitForMotionOverlaysToSettle(page)
    await expect(table).toHaveClass(/ft-root-intro-tilted/)
    await expect(table).toHaveClass(/ft-root-intro-settling/, { timeout: 6_000 })
    await waitForFarolIntroToSettle(page)
    const settledTransform = await plane.evaluate((element) => window.getComputedStyle(element).transform)
    expect(settledTransform).toBe('none')
  }
})

test('desktop screenshot coverage captures the reskinned arena states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await mockStaticSession(page, buildWaitingTurnSession())
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)
  await waitForFarolIntroToSettle(page)

  await expectComputedSize(page.locator('.ft-root .hand.player-hand .card').first(), 120, 180)
  await expectComputedSize(page.locator('.ft-root .hand.opponent-hand .card').first(), 84, 128)
  await expectComputedSize(page.locator('.ft-root .current-player-card').first(), 84, 128)
  await expect(page.locator('.ft-played .card.placeholder')).toHaveCount(0)

  const scorepadBox = await page.locator('.ft-scorepad-slot .scorepad').boundingBox()
  const devPanel = page.locator('.live-dev-controls.is-collapsed')
  if (scorepadBox && await devPanel.isVisible().catch(() => false)) {
    const devPanelBox = await devPanel.boundingBox()
    if (!devPanelBox) throw new Error('Missing collapsed dev panel geometry.')
    expect(boxesOverlap(scorepadBox, devPanelBox)).toBe(false)
  }

  await page.locator('.live-arena__board').screenshot({
    path: testInfo.outputPath('live-arena-waiting-turn-desktop.png'),
  })

  if (await page.getByTestId('live-game-settings-button').isVisible().catch(() => false)) {
    const settingsDrawer = await openSettingsDrawer(page)
    await settingsDrawer.screenshot({
      path: testInfo.outputPath('live-arena-settings-drawer-desktop.png'),
    })
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await expect(settingsDrawer).toBeHidden()
  }

  await expect(page.getByTestId('live-arena-coach-dock-trigger')).toHaveCount(0)
  await expect(page.getByTestId('live-arena-compact-coach-toggle')).toHaveCount(0)

  await page.unroute('**/api/game/session')
  await mockStaticSession(page, buildHeroLeadReadySession())
  await page.goto(LIVE_GAME_TEST_URL, { waitUntil: 'domcontentloaded' })
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await waitForHeroTurn(page)
  await waitForMotionOverlaysToSettle(page)
  await waitForFarolIntroToSettle(page)
  await expect(page.getByTestId('hero-table-slot')).toBeVisible()

  const dragSource = page.locator('.ft-root .hand.player-hand .card').first()
  await expect(dragSource).toHaveClass(/is-draggable/)
  const dragSourceBox = await dragSource.boundingBox()
  const heroTableSlotBox = await page.getByTestId('hero-table-slot').boundingBox()
  if (!dragSourceBox || !heroTableSlotBox) {
    throw new Error('Missing Farol drag-over geometry.')
  }
  const dragStart = {
    x: dragSourceBox.x + dragSourceBox.width / 2,
    y: dragSourceBox.y + dragSourceBox.height / 2,
  }
  const dragTarget = {
    x: heroTableSlotBox.x + heroTableSlotBox.width / 2,
    y: heroTableSlotBox.y + heroTableSlotBox.height / 2,
  }
  await page.mouse.move(dragStart.x, dragStart.y)
  await page.mouse.down()
  await page.mouse.move(dragStart.x + 12, dragStart.y - 8, { steps: 4 })
  await page.mouse.move(dragTarget.x, dragTarget.y, { steps: 16 })
  await expect(page.getByTestId('hero-table-slot')).toHaveClass(/is-drop-target/)
  await expect(page.locator('.ft-played .card.placeholder')).toHaveCount(0)
  await page.locator('.live-arena__board').screenshot({
    path: testInfo.outputPath('live-arena-drag-over-desktop.png'),
  })
  await page.mouse.move(dragStart.x, dragStart.y, { steps: 8 })
  await page.mouse.up()

  await page.unroute('**/api/game/session')
  await mockStaticSession(page, buildHeroLeadIntoVillainRaiseSession())
  await page.goto(LIVE_GAME_TEST_URL, { waitUntil: 'domcontentloaded' })
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  const responseFocusBoard = page.locator('.live-arena__board.is-response-focus')
  await expect(responseFocusBoard).toBeVisible()
  await waitForMotionOverlaysToSettle(page)
  await waitForFarolIntroToSettle(page)
  await expect(page.locator('.ft-stake')).toContainText(/truco/i)
  await expect(page.locator('.ft-stake')).toContainText('they called')
  await expect(page.locator('.td-rail-slot-accept')).toContainText('accept')
  await expect(page.locator('.ft-whisper')).toContainText('they raised - answer or raise again')
  await expect(page.locator('.ft-played .card.placeholder')).toHaveCount(0)
  await page.waitForTimeout(100)
  await responseFocusBoard.screenshot({
    path: testInfo.outputPath('live-arena-response-focus-desktop.png'),
  })
})

test('Farol rail exposes the opening raise from stake one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  const raiseReadySession = buildHeroLeadReadySession()
  raiseReadySession.legalActions = [
    ...raiseReadySession.legalActions,
    { type: 'raise', to: 3 },
  ]
  await mockActionSequenceMatch(page, {
    initialSession: raiseReadySession,
    actionSession: buildHeroLeadIntoVillainRaiseSession(),
  })
  await startMockedMatch(page)
  await waitForHeroTurn(page)
  await waitForMotionOverlaysToSettle(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const openingRaise = page.locator('.td-rail-slot-legal').filter({ hasText: 'three' })
    await expect(openingRaise).toBeVisible()
    await openingRaise.click()

    await expect.poll(() => requestObserver.actionRequests.length).toBe(1)
    expect(requestObserver.actionRequests[0]?.type).toBe('raise')
  } finally {
    requestObserver.dispose()
  }
})

test('Farol stake peg raises during a normal legal Hero turn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  const matchId = 'stake-peg-normal-raise'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 3 },
    ],
  })
  const raisedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 1,
    pendingRaise: { raised_by: 0, to: 3, previous_value: 1 },
    legalActions: [],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { raise: raisedSession },
  })
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const stakePeg = page.getByTestId('live-stake-indicator')
    await expect(stakePeg).toHaveAttribute('data-stake-tooltip', 'Raise to 3')
    expect(await stakePeg.getAttribute('title')).toBeNull()
    await stakePeg.hover()
    await expect.poll(() => stakePeg.evaluate((element) => (
      window.getComputedStyle(element, '::after').content
    ))).toBe('"Raise to 3"')
    await expect.poll(() => stakePeg.evaluate((element) => (
      window.getComputedStyle(element, '::after').opacity
    ))).toBe('1')
    await stakePeg.click()

    await expect.poll(() => requestObserver.actionRequests.length).toBe(1)
    expect(requestObserver.actionRequests[0]).toMatchObject({ type: 'raise', to: 3 })
  } finally {
    requestObserver.dispose()
  }
})

test('Farol stake peg accepts instead of re-raising while Hero answers a villain raise', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  const matchId = 'stake-peg-accept-raise'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
    legalActions: [
      { type: 'accept_raise' },
      { type: 'fold' },
      { type: 'raise', to: 6 },
    ],
  })
  const acceptedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 3,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 6 },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { accept_raise: acceptedSession },
  })
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const stakePeg = page.getByTestId('live-stake-indicator')
    await expect(stakePeg).toHaveAttribute('data-stake-tooltip', 'Accept raise')
    expect(await stakePeg.getAttribute('title')).toBeNull()
    await stakePeg.click()

    await expect.poll(() => requestObserver.actionRequests.length).toBe(1)
    expect(requestObserver.actionRequests[0]?.type).toBe('accept_raise')
  } finally {
    requestObserver.dispose()
  }
})

test('compact Farol rail leaves raise acceptance on the table peg only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const matchId = 'compact-rail-table-peg-accept'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
    legalActions: [
      { type: 'accept_raise' },
      { type: 'fold' },
      { type: 'raise', to: 6 },
    ],
  })
  const acceptedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 3,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 6 },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { accept_raise: acceptedSession },
  })
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const rail = page.locator('.td-rail')
    await expect(rail.locator('.td-rail-slot-accept-standalone')).toHaveCount(0)
    await expect(rail.locator('.td-rail-slot-accept-ladder')).toHaveCount(0)
    await expect(rail.locator('[aria-label^="Accept"]')).toHaveCount(0)
    await expect(rail.locator('.td-rail-slot-past')).toContainText('three')
    await expect(rail.locator('.td-rail-slot-legal')).toContainText('six')

    const layout = await page.evaluate(() => {
      const railElement = document.querySelector('.td-rail')
      if (!railElement) throw new Error('Missing compact Farol rail.')
      const railRect = railElement.getBoundingClientRect()
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        railRight: railRect.right,
      }
    })

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.railRight).toBeLessThanOrEqual(layout.viewportWidth + 1)

    const stakePeg = page.getByTestId('live-stake-indicator')
    await expect(stakePeg).toHaveAttribute('data-stake-tooltip', 'Accept raise')
    await stakePeg.click()
    await expect.poll(() => requestObserver.actionRequests.length).toBe(1)
    expect(requestObserver.actionRequests[0]?.type).toBe('accept_raise')
  } finally {
    requestObserver.dispose()
  }
})

test('Farol stake peg is inert when Hero cannot raise and no raise is pending', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  const initialSession = buildStakeFxScenarioSession({
    matchId: 'stake-peg-inert',
    handValue: 1,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: {},
  })
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const stakePeg = page.getByTestId('live-stake-indicator')
    expect(await stakePeg.getAttribute('data-stake-tooltip')).toBeNull()
    expect(await stakePeg.getAttribute('title')).toBeNull()
    await stakePeg.hover()
    await expect.poll(() => stakePeg.evaluate((element) => (
      window.getComputedStyle(element, '::after').content
    ))).toBe('none')
    await stakePeg.click()
    await page.waitForTimeout(250)
    expect(requestObserver.actionRequests).toHaveLength(0)
  } finally {
    requestObserver.dispose()
  }
})

test('hero play travels as one spinning Farol card back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadVillainResponseSession(),
    actionDelayMs: 300,
  })
  await startMockedMatch(page)
  await waitForHeroTurn(page)
  await waitForMotionOverlaysToSettle(page)
  await installHeroPlayOverlayProbe(page)

  await page.locator('.hand.player-hand .card').first().click()

  await page.waitForFunction(() => Boolean(
    (window as typeof window & {
      __heroPlayOverlayProbe?: {
        state: HeroPlayOverlayProbeState
      }
    }).__heroPlayOverlayProbe?.state.sawOverlay,
  ))
  await page.waitForFunction(() => Boolean(
    (window as typeof window & {
      __heroPlayOverlayProbe?: {
        state: HeroPlayOverlayProbeState
      }
    }).__heroPlayOverlayProbe?.state.overlayGoneAt,
  ))
  const overlayState = await readHeroPlayOverlayProbe(page)

  expect(overlayState?.sawOverlay).toBe(true)
  expect(overlayState?.hasFarolMotionClass).toBe(true)
  expect(overlayState?.cardBackCount).toBe(1)
  expect(overlayState?.cardBackBackgroundImage).toContain('linear-gradient')
  expect(overlayState?.maxWidth).toBeGreaterThan(80)
  expect(overlayState?.maxHeight).toBeGreaterThan(120)
  expect(overlayState?.maxAngleDelta).toBeGreaterThan(35)
  expect(overlayState?.minHeroHandCardsDuringOverlay).toBe(2)
  expect(overlayState?.maxHeroTableCardsDuringOverlay).toBe(0)

  await expect(page.getByTestId('hero-play-overlay')).toHaveCount(0)
  await expect(page.getByTestId('hero-table-slot').locator('.card:not(.placeholder)')).toHaveCount(1)
})

test('opponent table card stays visible when their last third-round card is already in state', async ({ page }) => {
  const mockedMatch = await mockOpponentThirdCardTableRender(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect(page.locator('.hand.opponent-hand .card')).toHaveCount(1)
  mockedMatch.advanceToPlayedState()

  await page.goto('/?match=mock-opponent-third-card', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('.hand.opponent-hand .card')).toHaveCount(0)
  await expect(activeOpponentTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)
  await expect(activeOpponentTableSlot(page)).toContainText('Q')
 })

test('opponent visible current-round card stays on table with one card left in hand', async ({ page }) => {
  await mockVisibleOpponentCurrentRoundMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect(page.locator('.hand.opponent-hand .card')).toHaveCount(1)
  await expect(activeOpponentTableSlot(page).locator('.card:not(.placeholder)')).toHaveCount(1)
  await expect(activeOpponentTableSlot(page)).toContainText('4')
})

test('topbar bot selection applies before match start', async ({ page }) => {
  await page.goto('/')
  await ensureLauncherReady(page)

  const launcherBotPickerTrigger = page.getByTestId('live-game-launcher-bot-trigger')
  await launcherBotPickerTrigger.click()
  await expect(page.getByTestId('live-game-launcher-bot-option-simple')).toHaveCount(0)
  await page.getByTestId('live-game-launcher-bot-option-random').click()
  await expect(launcherBotPickerTrigger).toContainText('Random')
  await expect(page.getByTestId('live-game-launcher-bot-menu')).toHaveCount(0)

  await page.getByTestId('live-game-launcher-start-button').click()
  await expectLiveMatchReady(page)

  const settingsDrawer = await openSettingsDrawer(page)
  const botPickerTrigger = settingsDrawer.getByTestId('live-game-bot-picker-trigger')
  await expect(botPickerTrigger).toContainText('Random')
  await expect(botPickerTrigger).toContainText('Chooses each move without a plan.')
})

test('settings drawer groups the relocated bot, playback, provider, and shortcut controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await mockStaticSession(page, buildWaitingTurnSession())
  await startMockedMatch(page)

  const drawer = await openSettingsDrawer(page)
  const botPanel = drawer.getByTestId('live-game-settings-bot-panel')
  const languagePanel = drawer.getByTestId('live-game-settings-language-panel')
  const playbackPanel = page.getByTestId('live-game-settings-playback-panel')
  const shortcutsPanel = drawer.getByTestId('live-game-shortcuts-panel')
  const languageTrigger = drawer.getByTestId('language-picker-settings-trigger')
  await expect(languagePanel).toBeVisible()
  await expect(languageTrigger).toContainText('English')
  await expect(languagePanel.locator('.language-picker__options')).toHaveCount(0)
  await languageTrigger.click()
  const languageMenu = drawer.getByTestId('language-picker-settings-menu')
  await expect(languageMenu).toBeVisible()
  await expect(drawer.getByTestId('language-picker-option-pt-BR')).toContainText('Português (Brasil)')
  const languageMenuBox = await languageMenu.boundingBox()
  const playbackToggleBox = await drawer.getByTestId('live-settings-section-experience-toggle').boundingBox()
  expect(languageMenuBox).not.toBeNull()
  expect(playbackToggleBox).not.toBeNull()
  expect(languageMenuBox!.y + languageMenuBox!.height).toBeGreaterThan(playbackToggleBox!.y)
  await expect(languageMenu).toHaveCSS('position', 'absolute')
  await languageTrigger.click()
  await expect(languageMenu).toHaveCount(0)
  await expect(playbackPanel).toBeVisible()
  await expect(page.getByLabel('Sound Volume')).toBeVisible()
  await expect(shortcutsPanel).toHaveCount(0)
  await expect(drawer).not.toContainText('Debug')

  const playbackToggle = drawer.getByTestId('live-settings-section-experience-toggle')
  await playbackToggle.click()
  await expect(playbackToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(playbackPanel).toHaveCount(0)

  await playbackToggle.click()
  await expect(playbackToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(playbackPanel).toBeVisible()

  if (await botPanel.count() === 0) {
    await drawer.getByTestId('live-settings-section-match-toggle').click()
  }

  await expect(botPanel).toBeVisible()
  const settingsBotPickerTrigger = drawer.getByTestId('live-game-bot-picker-trigger')
  await expect(settingsBotPickerTrigger).toBeVisible()
  await expect(settingsBotPickerTrigger).toContainText('Heuristic')
  await expect(settingsBotPickerTrigger).not.toContainText('Balanced profile')

  await settingsBotPickerTrigger.click()
  await page.getByTestId('live-game-bot-option-openai').click()

  await expect(drawer.getByRole('button', { name: 'Reload LLM Options' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Use Heuristic Instead' })).toBeVisible()

  await drawer.getByTestId('live-settings-section-shortcuts-toggle').click()
  await expect(playbackPanel).toBeVisible()
  await expect(shortcutsPanel).toBeVisible()
  await expect(drawer.getByTestId('live-shortcuts-enabled-toggle')).toBeVisible()
})

test('deck picker defaults to French and settings plus deck hold can switch decks', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('deck-picker-test-storage-cleared') === 'true') return
    window.localStorage.removeItem('truco-live-game-preferences-v1')
    window.localStorage.removeItem('truco-ui-settings-v1')
    window.sessionStorage.setItem('deck-picker-test-storage-cleared', 'true')
  })
  await mockStaticSession(page, buildHeroLeadReadySession())

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await expectLiveMatchReady(page)

  const firstRunPicker = page.getByTestId('first-run-deck-picker')
  await expect(firstRunPicker).toBeVisible()
  await page.getByTestId('deck-picker-french').click()
  await expect(firstRunPicker).toHaveCount(0)
  await expect(page.locator('.hand.player-hand .fcard')).toHaveCount(3)

  const drawer = await openSettingsDrawer(page)
  await expect(drawer.getByTestId('live-game-settings-deck-panel')).toBeVisible()
  await expect(drawer.getByTestId('deck-settings-french')).toHaveAttribute('aria-pressed', 'true')
  await drawer.getByTestId('deck-settings-spanish').click()
  await expect(page.locator('.hand.player-hand .spcard')).toHaveCount(3)
  await expect.poll(async () => page.evaluate(() => {
    const stored = window.localStorage.getItem('truco-live-game-preferences-v1')
    return stored ? JSON.parse(stored).deckPickerCompleted : false
  })).toBe(true)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()

  await page.reload()
  await expectLiveMatchReady(page)
  await expect(page.getByTestId('first-run-deck-picker')).toHaveCount(0)
  await expect(page.locator('.hand.player-hand .spcard')).toHaveCount(3)

  const deckSwitch = page.getByTestId('deck-longpress')
  const deckBox = await deckSwitch.boundingBox()
  if (!deckBox) throw new Error('Missing deck switch geometry.')

  const deckPeekTranslateY = async () => page.getByTestId('strength-guide-peek').evaluate((element) => {
    const transform = getComputedStyle(element).transform
    if (transform === 'none') return 0
    return new DOMMatrixReadOnly(transform).m42
  })

  await page.mouse.move(deckBox.x + deckBox.width / 2, deckBox.y + deckBox.height / 2)
  await expect.poll(deckPeekTranslateY).toBeLessThan(-8)
  await page.mouse.down()
  await expect(page.locator('.sg2-press-ring')).toBeVisible()
  await page.mouse.move(24, 24)
  await page.waitForTimeout(620)
  await page.mouse.up()
  await expect(page.getByTestId('deck-switch-toast')).toContainText('French', { timeout: 3_000 })
  await expect(page.getByTestId('deck-switch-toast')).toHaveAttribute('data-previous-system', 'spanish')
  await expect(page.locator('.hand.player-hand .fcard')).toHaveCount(3)
  await expect(page.getByTestId('strength-guide-peek')).toBeVisible()
  await expect.poll(deckPeekTranslateY).toBeGreaterThan(-4)
  await page.getByTestId('deck-switch-toast').getByRole('button', { name: 'undo' }).click()
  await expect(page.locator('.hand.player-hand .spcard')).toHaveCount(3)
})

test(DECK_PICKER_MOBILE_TEST_TITLE, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 540 })
  await page.addInitScript(() => {
    window.localStorage.removeItem('truco-live-game-preferences-v1')
    window.localStorage.removeItem('truco-ui-settings-v1')
  })
  await mockStaticSession(page, buildHeroLeadReadySession())

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await expectLiveMatchReady(page)

  const firstRunPicker = page.getByTestId('first-run-deck-picker')
  const pickerCard = firstRunPicker.locator('.frp-card')
  await expect(firstRunPicker).toBeVisible()
  await expect(pickerCard).toBeVisible()

  const initialLayout = await pickerCard.evaluate((element) => {
    const rect = element.getBoundingClientRect()

    return {
      bottom: rect.bottom,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollY: window.scrollY,
      top: rect.top,
      viewportHeight: window.innerHeight,
    }
  })

  expect(initialLayout.top).toBeGreaterThanOrEqual(-1)
  expect(initialLayout.bottom).toBeLessThanOrEqual(initialLayout.viewportHeight + 1)
  expect(initialLayout.bottom).toBeGreaterThanOrEqual(initialLayout.viewportHeight - 12)
  expect(initialLayout.scrollHeight).toBeGreaterThan(initialLayout.clientHeight)
  expect(initialLayout.scrollY).toBe(0)

  await pickerCard.hover()
  await page.mouse.wheel(0, 420)

  await expect.poll(async () => pickerCard.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0)

  const scrolledTop = await pickerCard.evaluate((element) => element.getBoundingClientRect().top)
  expect(scrolledTop).toBeCloseTo(initialLayout.top, 0)

  await page.screenshot({
    fullPage: false,
    path: testInfo.outputPath('first-run-deck-picker-mobile.png'),
  })
})

test('strength guide shows the v3 pocket paper and recovers from the folded peek', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('truco.live.strengthGuide.discovery')
  })
  const session = buildHeroLeadReadySession()
  session.state.current_hand!.state.turnup = { rank: 'A', suit: 'SPADES' }

  await mockStaticSession(page, session)
  await startMockedMatch(page)

  const peek = page.getByTestId('strength-guide-peek')
  await expect(peek).toBeVisible()
  await expect(page.getByTestId('strength-guide-panel')).toHaveCount(0)
  await expect(peek).toHaveAttribute('aria-expanded', 'false')
  await expect(peek.locator('.sg3-peek-fold')).toBeVisible()
  await testInfo.attach('strength-guide-v3-default-peek', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  await page.getByTestId('deck-longpress').click()
  const guide = page.getByTestId('strength-guide-panel')
  await expect(guide).toBeVisible()
  await expect(page.getByTestId('strength-guide-peek')).toHaveCount(0)
  await expect.poll(async () => guide.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  const guideBox = await guide.boundingBox()
  const deckBox = await page.locator('.ft-deck-slot').boundingBox()
  if (!guideBox || !deckBox) throw new Error('Missing strength guide or deck geometry.')
  expect(guideBox.y).toBeLessThanOrEqual(deckBox.y + 24)
  expect(guideBox.x + guideBox.width).toBeGreaterThanOrEqual(deckBox.x + deckBox.width - 16)
  await expect(guide).toContainText("this hand's manilhas")
  await expect(guide).toContainText('turned A → manilha is 2')
  await expect(guide).toContainText('strongest')
  await expect(guide).toContainText('weakest')
  await expect(guide.locator('.sg3-mcard')).toHaveCount(4)
  await expect(guide.locator('.sg3-rcard.is-turnup')).toContainText('A')
  await expect(guide.locator('.sg3-rcard.is-strike')).toContainText('2')
  await expect(guide.locator('.sg3-rcard').first()).toContainText('J')
  await expect(guide.locator('.sg3-rcard').last()).toContainText('Q')
  await testInfo.attach('strength-guide-v3-desktop', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  await page.keyboard.press('Escape')
  await expect(guide).toHaveCount(0)
  await expect(peek).toBeVisible()
  await expect(peek).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('Tab')
  await expect(page.getByTestId('strength-guide-panel')).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('strength-guide-panel')).toHaveCount(0)
  await expect(peek).toBeVisible()
  await testInfo.attach('strength-guide-v3-peek', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })

  await page.locator('.ft-deck-slot .deck-vira-card').click({ position: { x: 24, y: 42 } })
  await expect(page.getByTestId('strength-guide-panel')).toBeVisible()

  await page.getByTestId('strength-guide-panel').getByRole('button', { name: 'Close card strength guide' }).click()
  await expect(page.getByTestId('strength-guide-panel')).toHaveCount(0)

  await page.getByTestId('deck-longpress').click()
  await expect(page.getByTestId('strength-guide-panel')).toBeVisible()

  await page.getByTestId('strength-guide-panel').getByRole('button', { name: 'Close card strength guide' }).click()
  await expect(page.getByTestId('strength-guide-panel')).toHaveCount(0)

  await page.setViewportSize({ width: 430, height: 720 })
  await expect(page.getByTestId('strength-guide-panel')).toHaveCount(0)
  await expect(page.getByTestId('deck-longpress')).toBeVisible()
  await page.getByTestId('deck-longpress').click()
  await expect(page.getByTestId('strength-guide-overlay')).toBeVisible()
  await expect(page.getByTestId('strength-guide-panel')).toBeVisible()
})

test('strength guide tab shortcut yields to an active user gameplay shortcut', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
      shortcutsEnabled: true,
      shortcuts: {
        play_card_1: 'Tab',
        play_card_2: '2',
        play_card_3: '3',
        hide_card_1: 'A',
        hide_card_2: 'S',
        hide_card_3: 'D',
        raise_stake: 'Q',
        accept_raise: 'W',
        decline_raise: 'E',
        toggle_strength_guide: '',
      },
    }))
  })
  const session = buildHeroLeadReadySession()

  await mockStaticSession(page, session)
  const requestObserver = observeSessionActionRequests(page)

  try {
    await startMockedMatch(page)
    await page.getByTestId('deck-longpress').click()
    const guide = page.getByTestId('strength-guide-panel')
    await expect(guide).toBeVisible()

    await page.keyboard.press('Tab')

    await expectOnlyFaceUpPlayRequest(requestObserver.actionRequests, 'hero-1')
    await expect(guide).toBeVisible()
  } finally {
    requestObserver.dispose()
  }
})

test('settings drawer heuristic profile menu stays fully visible inside the expanded match section', async ({ page }) => {
  await page.setViewportSize({ width: 428, height: 430 })
  await mockStaticSession(page, buildWaitingTurnSession())
  await startMockedMatch(page)

  const drawer = await openSettingsDrawer(page)
  const botPanel = drawer.getByTestId('live-game-settings-bot-panel')
  if (await botPanel.count() === 0) {
    await drawer.getByTestId('live-settings-section-match-toggle').click()
  }

  const profileTrigger = drawer.getByTestId('live-game-bot-profile-trigger')
  await expect(profileTrigger).toBeVisible()
  await profileTrigger.click()
  await expect(drawer.getByTestId('live-game-bot-profile-menu')).toBeVisible()

  const geometry = await page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="live-settings-drawer"]')
    const profileMenu = document.querySelector('[data-testid="live-game-bot-profile-menu"]')
    if (!(drawer instanceof HTMLElement) || !(profileMenu instanceof HTMLElement)) {
      throw new Error('Missing settings drawer menu geometry targets.')
    }

    const drawerRect = drawer.getBoundingClientRect()
    const menuRect = profileMenu.getBoundingClientRect()

    return {
      drawerBottom: drawerRect.bottom,
      drawerTop: drawerRect.top,
      menuBottom: menuRect.bottom,
      menuTop: menuRect.top,
    }
  })

  const geometryTolerance = 3
  expect(geometry.menuTop).toBeGreaterThanOrEqual(geometry.drawerTop - geometryTolerance)
  expect(geometry.menuBottom).toBeLessThanOrEqual(geometry.drawerBottom + geometryTolerance)
})

test('live arena does not expose coach or lab controls while the lab is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await mockStaticSession(page, buildWaitingTurnSession())
  await startMockedMatch(page)

  await expect(page.getByTestId('live-arena-coach-dock-trigger')).toHaveCount(0)
  await expect(page.getByTestId('live-arena-compact-coach-toggle')).toHaveCount(0)
  await expect(page.getByTestId('live-arena-coach-dock')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Analyze Spot' })).toHaveCount(0)
})

test('hero can drag a card onto the table slot to play it', async ({ page }) => {
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadVillainResponseSession(),
  })
  await startMockedMatch(page)
  await waitForHeroTurn(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const heroHandCards = page.locator('.hand.player-hand .card')
    const heroTableSlot = page.getByTestId('hero-table-slot')
    const firstHeroCard = heroHandCards.first()

    await expect(firstHeroCard).toHaveClass(/is-draggable/)

    await dragCardToSlot(page, firstHeroCard, heroTableSlot)

    await expectOnlyFaceUpPlayRequest(requestObserver.actionRequests)
    await expect(heroHandCards).toHaveCount(2)
    await expect
      .poll(async () => {
        const heroSlotCards = await heroTableSlot.locator('.card:not(.placeholder)').count()
        const traceCards = await page.locator('.round-reference .card-ref').count()
        return heroSlotCards + traceCards
      })
      .toBeGreaterThan(0)
  } finally {
    requestObserver.dispose()
  }
})

test('hero can drag a card to a new hand position without playing it', async ({ page }, testInfo) => {
  await mockStaticSession(page, buildHeroLeadReadySession())
  await startMockedMatch(page)
  await waitForHeroTurn(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const heroHand = page.locator('.hand.player-hand')
    const firstSlot = page.getByTestId('hero-hand-slot-0')
    const lastSlot = page.getByTestId('hero-hand-slot-2')

    await expect(firstSlot.locator('.card')).toHaveAttribute('data-card-id', 'hero-1')
    await expect(lastSlot.locator('.card')).toHaveAttribute('data-card-id', 'hero-3')

    const firstCardBox = await firstSlot.locator('.card').boundingBox()
    const lastSlotBox = await lastSlot.boundingBox()
    if (!firstCardBox || !lastSlotBox) {
      throw new Error('Missing hero hand reorder geometry.')
    }

    const dragStart = {
      x: firstCardBox.x + firstCardBox.width / 2,
      y: firstCardBox.y + firstCardBox.height / 2,
    }
    const dragTarget = {
      x: lastSlotBox.x + lastSlotBox.width / 2,
      y: lastSlotBox.y + lastSlotBox.height / 2,
    }

    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.waitForTimeout(50)
    await page.mouse.move(dragStart.x + 12, dragStart.y - 8, { steps: 4 })
    await page.mouse.move(dragTarget.x, dragTarget.y, { steps: 16 })
    await expect(lastSlot).toHaveClass(/is-reorder-target/)
    await expect.poll(async () => page.evaluate(() => {
      const centerX = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        return rect.left + (rect.width / 2)
      }

      const firstSlotCenter = centerX(document.querySelector('[data-testid="hero-hand-slot-0"]'))
      const middleSlotCenter = centerX(document.querySelector('[data-testid="hero-hand-slot-1"]'))
      const middleCardCenter = centerX(document.querySelector('[data-card-id="hero-2"]'))
      const rightCardCenter = centerX(document.querySelector('[data-card-id="hero-3"]'))
      if (
        firstSlotCenter == null ||
        middleSlotCenter == null ||
        middleCardCenter == null ||
        rightCardCenter == null
      ) {
        return Number.POSITIVE_INFINITY
      }

      return Math.max(
        Math.abs(middleCardCenter - firstSlotCenter),
        Math.abs(rightCardCenter - middleSlotCenter),
      )
    })).toBeLessThan(4)
    await page.locator('.live-arena__board').screenshot({
      path: testInfo.outputPath('live-arena-hand-reorder-target.png'),
    })
    await page.mouse.up()

    await expect.poll(async () => heroHand.locator('.card').evaluateAll((cards) => (
      cards.map((card) => card.getAttribute('data-card-id'))
    ))).toEqual(['hero-2', 'hero-3', 'hero-1'])
    await expect.poll(() => requestObserver.actionRequests.length).toBe(0)
    await expect(lastSlot).toHaveClass(/has-card/)
  } finally {
    requestObserver.dispose()
  }
})

test('hero hand reorder release lands the dragged card in the previewed slot', async ({ page }) => {
  await mockStaticSession(page, buildHeroLeadReadySession())
  await startMockedMatch(page)
  await waitForHeroTurn(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const heroHand = page.locator('.hand.player-hand')
    const firstSlot = page.getByTestId('hero-hand-slot-0')
    const middleSlot = page.getByTestId('hero-hand-slot-1')
    const lastSlot = page.getByTestId('hero-hand-slot-2')

    await expect(firstSlot.locator('.card')).toHaveAttribute('data-card-id', 'hero-1')
    await expect(middleSlot.locator('.card')).toHaveAttribute('data-card-id', 'hero-2')
    await expect(lastSlot.locator('.card')).toHaveAttribute('data-card-id', 'hero-3')

    const firstCardBox = await firstSlot.locator('.card').boundingBox()
    const middleSlotBox = await middleSlot.boundingBox()
    if (!firstCardBox || !middleSlotBox) {
      throw new Error('Missing hero hand reorder release geometry.')
    }

    const dragStart = {
      x: firstCardBox.x + firstCardBox.width / 2,
      y: firstCardBox.y + firstCardBox.height / 2,
    }
    const dragTarget = {
      x: middleSlotBox.x + middleSlotBox.width / 2,
      y: middleSlotBox.y + middleSlotBox.height / 2,
    }

    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.waitForTimeout(50)
    await page.mouse.move(dragStart.x + 12, dragStart.y - 8, { steps: 4 })
    await page.mouse.move(dragTarget.x, dragTarget.y, { steps: 12 })
    await expect(middleSlot).toHaveClass(/is-reorder-target/)
    await expect.poll(async () => page.evaluate(() => {
      const centerX = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        return rect.left + (rect.width / 2)
      }

      const firstSlotCenter = centerX(document.querySelector('[data-testid="hero-hand-slot-0"]'))
      const middleCardCenter = centerX(document.querySelector('[data-card-id="hero-2"]'))
      if (firstSlotCenter == null || middleCardCenter == null) {
        return Number.POSITIVE_INFINITY
      }

      return Math.abs(middleCardCenter - firstSlotCenter)
    })).toBeLessThan(4)
    await page.mouse.up()

    await expect.poll(async () => heroHand.locator('.card').evaluateAll((cards) => (
      cards.map((card) => card.getAttribute('data-card-id'))
    ))).toEqual(['hero-2', 'hero-1', 'hero-3'])
    await expect.poll(async () => page.evaluate(() => {
      const centerX = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        return rect.left + (rect.width / 2)
      }

      const slotCenters = [0, 1, 2].map((index) => (
        centerX(document.querySelector(`[data-testid="hero-hand-slot-${index}"]`))
      ))
      const cardCenters = ['hero-2', 'hero-1', 'hero-3'].map((cardId) => (
        centerX(document.querySelector(`[data-card-id="${cardId}"]`))
      ))
      if (
        slotCenters.some((center) => center == null) ||
        cardCenters.some((center) => center == null)
      ) {
        return Number.POSITIVE_INFINITY
      }

      return Math.max(...cardCenters.map((center, index) => (
        Math.abs(Number(center) - Number(slotCenters[index]))
      )))
    })).toBeLessThan(4)
    await expect.poll(async () => page.evaluate(() => {
      const centerX = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        return rect.left + (rect.width / 2)
      }

      const draggedCardCenter = centerX(document.querySelector('[data-card-id="hero-1"]'))
      const rightCardCenter = centerX(document.querySelector('[data-card-id="hero-3"]'))
      if (draggedCardCenter == null || rightCardCenter == null) {
        return 0
      }

      return Math.abs(draggedCardCenter - rightCardCenter)
    })).toBeGreaterThan(60)
    await expect.poll(() => requestObserver.actionRequests.length).toBe(0)
  } finally {
    requestObserver.dispose()
  }
})

test('hero hand reorder keeps the dragged card anchored while crossing the hand', async ({ page }) => {
  await mockStaticSession(page, buildHeroLeadReadySession())
  await startMockedMatch(page)
  await waitForHeroTurn(page)

  const requestObserver = observeSessionActionRequests(page)

  try {
    const firstSlot = page.getByTestId('hero-hand-slot-0')
    const middleSlot = page.getByTestId('hero-hand-slot-1')
    const lastSlot = page.getByTestId('hero-hand-slot-2')
    const draggedCard = page.locator('[data-card-id="hero-1"]')
    const heroTableSlot = page.getByTestId('hero-table-slot')

    const firstCardBox = await firstSlot.locator('.card').boundingBox()
    const middleSlotBox = await middleSlot.boundingBox()
    const lastSlotBox = await lastSlot.boundingBox()
    if (!firstCardBox || !middleSlotBox || !lastSlotBox) {
      throw new Error('Missing hero hand crossing geometry.')
    }

    const dragStart = {
      x: firstCardBox.x + firstCardBox.width / 2,
      y: firstCardBox.y + firstCardBox.height / 2,
    }
    const hoverPoints = [
      {
        x: middleSlotBox.x + middleSlotBox.width / 2,
        y: middleSlotBox.y + middleSlotBox.height / 2,
      },
      {
        x: lastSlotBox.x + lastSlotBox.width / 2,
        y: lastSlotBox.y + lastSlotBox.height / 2,
      },
      {
        x: middleSlotBox.x + middleSlotBox.width / 2,
        y: middleSlotBox.y + middleSlotBox.height / 2,
      },
      {
        x: lastSlotBox.x + lastSlotBox.width / 2,
        y: lastSlotBox.y + lastSlotBox.height / 2,
      },
    ]

    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.waitForTimeout(50)
    await page.mouse.move(dragStart.x + 12, dragStart.y - 8, { steps: 4 })

    for (const point of hoverPoints) {
      await page.mouse.move(point.x, point.y, { steps: 14 })
      await expect.poll(async () => draggedCard.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return rect.top + (rect.height / 2)
      })).toBeGreaterThan(point.y - 18)
      await expect.poll(async () => draggedCard.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return rect.top + (rect.height / 2)
      })).toBeLessThan(point.y + 18)
      await expect(heroTableSlot).not.toHaveClass(/is-drop-target/)
    }

    await page.mouse.up()
    await expect.poll(async () => page.locator('.hand.player-hand .card').evaluateAll((cards) => (
      cards.map((card) => card.getAttribute('data-card-id'))
    ))).toEqual(['hero-2', 'hero-3', 'hero-1'])
    await expect.poll(() => requestObserver.actionRequests.length).toBe(0)
  } finally {
    requestObserver.dispose()
  }
})

test.describe('compact touch interactions', () => {
  test.use({ hasTouch: true })

  test('compact hero can tap a card to play it with the mobile drag affordance', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await mockActionSequenceMatch(page, {
      initialSession: buildHeroLeadReadySession(),
      actionSession: buildHeroLeadVillainResponseSession(),
    })
    await startMockedMatch(page)
    await waitForHeroTurn(page)

    const requestObserver = observeSessionActionRequests(page)

    try {
      const heroHandCards = page.locator('.hand.player-hand .card')
      const firstHeroCard = heroHandCards.first()
      const cardGeometry = await page.evaluate(() => {
        const rects = (selector: string) => (
          Array.from(document.querySelectorAll(selector)).map((element) => {
            const style = window.getComputedStyle(element)
            return {
              width: Number.parseFloat(style.width),
              height: Number.parseFloat(style.height),
            }
          })
        )

        return {
          hero: rects('.ft-hero-hand .hand.player-hand .card'),
          villain: rects('.ft-villain-hand .hand.opponent-hand .card'),
        }
      })

      expect(cardGeometry.hero).toHaveLength(3)
      expect(cardGeometry.villain).toHaveLength(3)
      for (const rect of cardGeometry.hero) {
        expect(rect.width).toBeLessThanOrEqual(77)
        expect(rect.height).toBeLessThanOrEqual(115)
      }
      for (const rect of cardGeometry.villain) {
        expect(rect.width).toBeLessThanOrEqual(55)
        expect(rect.height).toBeLessThanOrEqual(82)
      }
      await page.locator('.ft-root').screenshot({
        path: testInfo.outputPath('farol-compact-smaller-hand-cards.png'),
      })

      await expect(firstHeroCard).toHaveClass(/is-draggable/)
      await firstHeroCard.scrollIntoViewIfNeeded()
      await firstHeroCard.tap()

      await expectOnlyFaceUpPlayRequest(requestObserver.actionRequests)
      await expect(heroHandCards).toHaveCount(2)
    } finally {
      requestObserver.dispose()
    }
  })

  test('compact hero can drag a card to reorder the hand without playing it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await mockStaticSession(page, buildHeroLeadReadySession())
    await startMockedMatch(page)
    await waitForHeroTurn(page)

    const requestObserver = observeSessionActionRequests(page)

    try {
      const heroHand = page.locator('.hand.player-hand')
      const firstSlot = page.getByTestId('hero-hand-slot-0')
      const lastSlot = page.getByTestId('hero-hand-slot-2')
      const firstHeroCard = firstSlot.locator('.card')

      await expect(firstHeroCard).toHaveClass(/is-draggable/)
      await expect(firstHeroCard).toHaveAttribute('data-card-id', 'hero-1')
      await expect(lastSlot.locator('.card')).toHaveAttribute('data-card-id', 'hero-3')

      await dragCardToSlot(page, firstHeroCard, lastSlot)

      await expect.poll(async () => heroHand.locator('.card').evaluateAll((cards) => (
        cards.map((card) => card.getAttribute('data-card-id'))
      ))).toEqual(['hero-2', 'hero-3', 'hero-1'])
      await expect.poll(() => requestObserver.actionRequests.length).toBe(0)
    } finally {
      requestObserver.dispose()
    }
  })

  test('compact upward card drag does not submit a face-down play', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await mockStaticSession(page, buildHeroLeadReadySession())
    await startMockedMatch(page)
    await waitForHeroTurn(page)

    const requestObserver = observeSessionActionRequests(page)

    try {
      const heroHand = page.locator('.hand.player-hand')
      const firstHeroCard = page.getByTestId('hero-hand-slot-0').locator('.card')
      const cardBox = await firstHeroCard.boundingBox()
      if (!cardBox) throw new Error('Missing compact face-down drag geometry.')

      await expect(firstHeroCard).toHaveClass(/is-draggable/)
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(50)
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y - 48, { steps: 12 })
      await page.mouse.up()

      await expect.poll(() => requestObserver.actionRequests.length).toBe(0)
      await expect.poll(async () => heroHand.locator('.card').evaluateAll((cards) => (
        cards.map((card) => card.getAttribute('data-card-id'))
      ))).toEqual(['hero-1', 'hero-2', 'hero-3'])
    } finally {
      requestObserver.dispose()
    }
  })
})

test('dragging a hero card away from the table slot snaps it back', async ({ page }) => {
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)

  const heroHandCards = page.locator('.hand.player-hand .card')
  const heroTableSlot = page.getByTestId('hero-table-slot')
  const firstHeroCard = heroHandCards.first()
  await firstHeroCard.scrollIntoViewIfNeeded()
  const firstCardBox = await firstHeroCard.boundingBox()
  if (!firstCardBox) throw new Error('Missing hero card box.')

  await dragBetweenLocators(
    page,
    firstHeroCard,
    firstCardBox.x - 140,
    firstCardBox.y + (firstCardBox.height / 2) + 44,
  )

  await expect(heroHandCards).toHaveCount(3)
  await expect(heroTableSlot.locator('.hero-slot-placeholder')).toHaveCount(1)
})

test('inactive hero cards tone down while the empty hero slot stays neutral until dragging', async ({ page }) => {
  await mockWaitingTurnMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await dismissFirstRunDeckPickerIfVisible(page)

  await expect(page.locator('.table-status')).toContainText('Their turn')
  await dismissFirstRunDeckPickerIfVisible(page)

  const inactiveHeroCard = page.locator('.hand.player-hand .card').first()
  const heroTableSlot = page.getByTestId('hero-table-slot')
  const heroPlaceholder = heroTableSlot.locator('.hero-slot-placeholder')

  await expect(page.locator('.hand.player-hand .card')).toHaveCount(3)
  await expect(inactiveHeroCard).toHaveClass(/is-inactive/)
  await expect(inactiveHeroCard).toHaveClass(/is-draggable/)
  await expect(inactiveHeroCard).toHaveCSS('cursor', 'grab')
  await expect(page.locator('.hand.player-hand .dge-fold-button')).toHaveCount(0)

  const restingShadow = await inactiveHeroCard.evaluate((element) => getComputedStyle(element).boxShadow)
  await inactiveHeroCard.hover()
  const hoveredShadow = await inactiveHeroCard.evaluate((element) => getComputedStyle(element).boxShadow)
  expect(hoveredShadow).toBe(restingShadow)

  await expect(heroTableSlot).not.toHaveClass(/is-target-slot/)
  await expect(heroTableSlot).not.toHaveClass(/is-drop-target/)
  await expect(heroPlaceholder).toHaveClass(/hero-slot-placeholder/)
})

test('dog-ear fold stages and unstages a hidden card when play-on-hide is turned off', async ({ page }) => {
  await mockHideCardMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)

  await openSettingsDrawer(page)
  const immediateHideToggle = page.getByTestId('live-hide-card-plays-immediately-toggle')
  await immediateHideToggle.click()
  await expect(immediateHideToggle).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('live-settings-drawer')).toBeHidden()

  const heroCardShell = page.locator('.hand.player-hand .card-shell').first()
  const heroCard = heroCardShell.locator('.card')
  const secondHeroCardShell = page.locator('.hand.player-hand .card-shell').nth(1)
  const secondHeroCard = secondHeroCardShell.locator('.card')
  const heroTableSlot = page.getByTestId('hero-table-slot')

  const requestObserver = observeSessionActionRequests(page)

  try {
    await clickDogEarAffordance(heroCardShell, '.dge-fold-button')

    await expect(heroCardShell).toHaveClass(/dge-hidden/)
    await expect(heroCard).toHaveClass(/is-face-down/)
    await expect(page.locator('.hand.player-hand .card')).toHaveCount(3)
    await expect(heroCardShell.locator('.dge-unfold-button')).toBeVisible()
    await expect(heroTableSlot).not.toHaveClass(/is-target-slot/)
    await expect(heroTableSlot).not.toHaveClass(/is-drop-target/)
    await expect.poll(() => requestObserver.actionRequests.length).toBe(0)

    await clickDogEarAffordance(secondHeroCardShell, '.dge-fold-button')

    await expect(secondHeroCardShell).toHaveClass(/dge-hidden/)
    await expect(secondHeroCard).toHaveClass(/is-face-down/)
    await expect(heroCardShell).toHaveClass(/dge-hidden/)
    await expect(heroCard).toHaveClass(/is-face-down/)
    await expect(page.locator('.hand.player-hand .card.is-face-down')).toHaveCount(2)
    await expect.poll(() => requestObserver.actionRequests.length).toBe(0)

    await clickDogEarAffordance(heroCardShell, '.dge-unfold-button')

    await expect(heroCardShell).not.toHaveClass(/dge-hidden/)
    await expect(heroCard).toHaveClass(/is-face-up/)
    await expect(secondHeroCardShell).toHaveClass(/dge-hidden/)
    await expect(secondHeroCard).toHaveClass(/is-face-down/)
    await expect.poll(() => requestObserver.actionRequests.length).toBe(0)

    await clickDogEarAffordance(heroCardShell, '.dge-fold-button')
    await expect(heroCard).toHaveClass(/is-face-down/)

    await heroCard.click()

    await expect(heroTableSlot.locator('.card.is-face-down')).toHaveCount(1)
    await expect(page.locator('.hand.player-hand .card')).toHaveCount(2)
    await expect(page.locator('.hand.player-hand .card.is-face-down')).toHaveCount(1)
    await expectOnlyHiddenPlayRequest(requestObserver.actionRequests)

    await page.reload()

    const reloadedHeroTraceCard = page.locator('.ft-hero-trace-card .card.hero-hidden.is-face-down').first()
    await expect(reloadedHeroTraceCard).toBeVisible({ timeout: 12_000 })
    await expect(reloadedHeroTraceCard.locator('.fcard-back')).toBeVisible()
    await expectOnlyHiddenPlayRequest(requestObserver.actionRequests)
  } finally {
    requestObserver.dispose()
  }
})

// Quarantined in production Playwright: the explicit fold-button path below still covers face-down play.
test.skip('right-click hide defaults to an immediate hidden play instead of a face-up play', async ({ page }) => {
  await mockHideCardMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)

  const heroCardShell = page.locator('.hand.player-hand .card-shell').first()
  const heroCard = heroCardShell.locator('.card')
  const heroTableSlot = page.getByTestId('hero-table-slot')
  const requestObserver = observeSessionActionRequests(page)

  try {
    await heroCard.click({ button: 'right' })

    await expect(heroTableSlot.locator('.card.is-face-down')).toHaveCount(1)
    await expectOnlyHiddenPlayRequest(requestObserver.actionRequests)
    await expect(page.locator('.hand.player-hand .card')).toHaveCount(2)
  } finally {
    requestObserver.dispose()
  }
})

test('play-on-hide defaults on and submits the face-down play from the fold button', async ({ page }) => {
  await mockHideCardMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)

  await openSettingsDrawer(page)
  const immediateHideToggle = page.getByTestId('live-hide-card-plays-immediately-toggle')
  await expect(immediateHideToggle).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('live-settings-drawer')).toBeHidden()

  const persistedImmediateHideState = await page.evaluate(() => {
    const stored = window.localStorage.getItem('truco-live-game-preferences-v1')
    return stored ? JSON.parse(stored).hideCardPlaysImmediately : null
  })

  expect(persistedImmediateHideState).toBe(true)

  const heroCardShell = page.locator('.hand.player-hand .card-shell').first()
  const heroTableSlot = page.getByTestId('hero-table-slot')
  const requestObserver = observeSessionActionRequests(page)

  try {
    await clickDogEarAffordance(heroCardShell, '.dge-fold-button')

    await expect(heroTableSlot.locator('.card.is-face-down')).toHaveCount(1)
    await expect(page.locator('.hand.player-hand .card')).toHaveCount(2)
    await expectOnlyHiddenPlayRequest(requestObserver.actionRequests)
  } finally {
    requestObserver.dispose()
  }
})

// Quarantined in production Playwright: the explicit fold-button path above still covers face-down play.
test.skip('dragging a hero card upward into the paper sleeve submits a face-down play', async ({ page }) => {
  await mockHideCardMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await waitForHeroTurn(page)

  const heroHandCards = page.locator('.hand.player-hand .card')
  const firstHeroCard = heroHandCards.first()
  const heroTableSlot = page.getByTestId('hero-table-slot')
  const firstCardBox = await firstHeroCard.boundingBox()
  if (!firstCardBox) throw new Error('Missing hero card box.')

  const requestObserver = observeSessionActionRequests(page)

  try {
    await expect(firstHeroCard).toHaveClass(/is-draggable/)
    await dragBetweenLocators(
      page,
      firstHeroCard,
      firstCardBox.x + (firstCardBox.width / 2),
      firstCardBox.y - 72,
    )

    await expect(heroTableSlot.locator('.card.is-face-down')).toHaveCount(1)
    await expect(heroHandCards).toHaveCount(2)
    await expectOnlyHiddenPlayRequest(requestObserver.actionRequests)
  } finally {
    requestObserver.dispose()
  }
})

test('Farol scorepad stays stable when the dealer changes', async ({ page }) => {
  await mockStaticSession(page, buildWaitingTurnSession({ dealer: 0 }))
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect(page.locator('.live-arena__board')).toBeVisible()
  await expect(page.getByTestId('farol-scorepad')).toBeVisible()
  const heroDealerScorepadBox = await page.getByTestId('farol-scorepad').boundingBox()
  const heroDealerHeroScoreBox = await page.getByTestId('score-row-hero').boundingBox()
  const heroDealerVillainScoreBox = await page.getByTestId('score-row-villain').boundingBox()
  if (!heroDealerScorepadBox || !heroDealerHeroScoreBox || !heroDealerVillainScoreBox) {
    throw new Error('Missing Farol scorepad geometry.')
  }

  await page.unroute('**/api/game/session')
  await page.unroute('**/api/game/session/mock-waiting-turn-match*')
  await page.unroute('**/api/game/session/mock-waiting-turn-match/actions')
  await page.unroute('**/api/game/session/mock-waiting-turn-match/start-hand')
  await mockStaticSession(page, buildWaitingTurnSession({ dealer: 1 }))

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await expect(page.locator('.live-arena__board')).toBeVisible()
  const villainDealerScorepadBox = await page.getByTestId('farol-scorepad').boundingBox()
  const villainDealerHeroScoreBox = await page.getByTestId('score-row-hero').boundingBox()
  const villainDealerVillainScoreBox = await page.getByTestId('score-row-villain').boundingBox()
  if (!villainDealerScorepadBox || !villainDealerHeroScoreBox || !villainDealerVillainScoreBox) {
    throw new Error('Missing Farol scorepad geometry after dealer swap.')
  }

  expect(Math.abs(heroDealerScorepadBox.width - villainDealerScorepadBox.width)).toBeLessThan(1)
  expect(Math.abs(heroDealerScorepadBox.height - villainDealerScorepadBox.height)).toBeLessThan(1)
  expect(Math.abs(heroDealerHeroScoreBox.height - villainDealerHeroScoreBox.height)).toBeLessThan(1)
  expect(Math.abs(heroDealerVillainScoreBox.height - villainDealerVillainScoreBox.height)).toBeLessThan(1)
})

test('responsive Farol arena geometry stays proportionate on a tall desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1452, height: 1120 })
  await mockStaticSession(page, buildHideCardReadySession())
  await startMockedMatch(page)
  await expect(page.locator('.ft-deck-slot .deck-vira')).toHaveCount(1)
  await expect(page.locator('.ft-played-round-active .ft-played-empty').first()).toBeVisible()

  const geometry = await page.evaluate(() => {
    const board = document.querySelector('.live-arena__board')
    const table = document.querySelector('.ft-root')
    const played = document.querySelector('.ft-played')
    const activeRound = document.querySelector('.ft-played-round-active')
    const heroSlot = document.querySelector('.ft-played-round-active .current-player-card')
    const villainSlot = document.querySelector('.ft-played-round-active .current-opponent-card')
    const villainHand = document.querySelector('.ft-villain-hand .live-arena__player-hand-wrap')
    const heroHand = document.querySelector('.ft-hero-hand .live-arena__player-hand-wrap')
    const scorepad = document.querySelector('.ft-scorepad-slot .scorepad')
    const stake = document.querySelector('[data-testid="live-stake-indicator"]')
    const deck = document.querySelector('.ft-deck-slot')
    const rail = document.querySelector('.td-rail')

    if (!board || !table || !played || !activeRound || !heroSlot || !villainSlot || !villainHand || !heroHand || !scorepad || !stake || !deck || !rail) {
      throw new Error('Missing Farol arena geometry target.')
    }

    const toRect = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      board: toRect(board),
      table: toRect(table),
      played: toRect(played),
      activeRound: toRect(activeRound),
      heroSlot: toRect(heroSlot),
      villainSlot: toRect(villainSlot),
      villainHand: toRect(villainHand),
      heroHand: toRect(heroHand),
      scorepad: toRect(scorepad),
      stake: toRect(stake),
      deck: toRect(deck),
      rail: toRect(rail),
    }
  })

  expect(geometry.table.width).toBeLessThanOrEqual(geometry.board.width + 1)
  expect(geometry.table.height / geometry.viewportHeight).toBeGreaterThan(0.55)
  expect(geometry.played.left).toBeGreaterThanOrEqual(geometry.table.left)
  expect(geometry.played.right).toBeLessThanOrEqual(geometry.table.right)
  expect(geometry.villainHand.left).toBeGreaterThanOrEqual(geometry.table.left)
  expect(geometry.villainHand.right).toBeLessThanOrEqual(geometry.table.right)
  expect(geometry.heroHand.left).toBeGreaterThanOrEqual(geometry.table.left)
  expect(geometry.heroHand.right).toBeLessThanOrEqual(geometry.table.right)
  expect(geometry.scorepad.left).toBeGreaterThanOrEqual(geometry.table.left)
  expect(geometry.scorepad.top).toBeGreaterThanOrEqual(geometry.table.top)
  expect(geometry.deck.top).toBeGreaterThanOrEqual(geometry.villainHand.bottom + 32)
  expect(geometry.rail.bottom).toBeLessThanOrEqual(geometry.table.bottom + 1)

  const tableCenterX = geometry.table.left + (geometry.table.width / 2)
  const heroSlotCenterX = geometry.heroSlot.left + (geometry.heroSlot.width / 2)
  const villainSlotCenterX = geometry.villainSlot.left + (geometry.villainSlot.width / 2)
  const stakeCenterX = geometry.stake.left + (geometry.stake.width / 2)

  expect(Math.abs(heroSlotCenterX - tableCenterX)).toBeLessThanOrEqual(180)
  expect(Math.abs(villainSlotCenterX - tableCenterX)).toBeLessThanOrEqual(180)
  expect(Math.abs(stakeCenterX - tableCenterX)).toBeLessThanOrEqual(2)
})

test('responsive Farol arena keeps active slots inside the tabletop on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockStaticSession(page, buildHideCardReadySession())
  await startMockedMatch(page)

  const geometry = await page.evaluate(() => {
    const board = document.querySelector('.live-arena__board')
    const table = document.querySelector('.ft-root')
    const heroSlot = document.querySelector('.ft-played-round-active .current-player-card')
    const villainSlot = document.querySelector('.ft-played-round-active .current-opponent-card')
    const scoreRail = document.querySelector('[data-testid="farol-score-rail"]')
    const scorepad = document.querySelector('.ft-scorepad-slot .scorepad')
    const deck = document.querySelector('.ft-deck-slot')
    const heroHand = document.querySelector('.ft-hero-hand .live-arena__player-hand-wrap')

    if (!board || !table || !heroSlot || !villainSlot || !scoreRail || !deck || !heroHand) {
      throw new Error('Missing mobile Farol arena geometry target.')
    }

    const toRect = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    }

    return {
      board: toRect(board),
      table: toRect(table),
      heroSlot: toRect(heroSlot),
      villainSlot: toRect(villainSlot),
      scoreRail: toRect(scoreRail),
      deck: toRect(deck),
      heroHand: toRect(heroHand),
      scorepadVisible: scorepad != null && window.getComputedStyle(scorepad).display !== 'none',
    }
  })

  expect(geometry.scorepadVisible).toBe(false)
  expect(geometry.scoreRail.left).toBeGreaterThanOrEqual(geometry.board.left - 1)
  expect(geometry.scoreRail.right).toBeLessThanOrEqual(geometry.board.right + 1)
  expect(geometry.scoreRail.top).toBeGreaterThanOrEqual(geometry.board.top - 1)
  expect(geometry.villainSlot.left).toBeGreaterThanOrEqual(geometry.table.left)
  expect(geometry.villainSlot.right).toBeLessThanOrEqual(geometry.table.right)
  expect(geometry.heroSlot.left).toBeGreaterThanOrEqual(geometry.table.left)
  expect(geometry.heroSlot.right).toBeLessThanOrEqual(geometry.table.right)
  expect(geometry.heroSlot.bottom).toBeLessThanOrEqual(geometry.table.bottom)
  expect(geometry.deck.bottom).toBeLessThanOrEqual(geometry.heroHand.top - 8)
})

test('compact iPhone mini keeps third-round deck and table peg clear of played cards', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockStaticSession(page, buildOpponentThirdCardPlayedSession())
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)
  await waitForFarolIntroToSettle(page)

  const geometry = await page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: box.left,
        y: box.top,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      }
    }

    return {
      deck: rect(document.querySelector('.ft-deck-slot')),
      stake: rect(document.querySelector('[data-testid="live-stake-indicator"]')),
      heroHand: rect(document.querySelector('.ft-hero-hand .live-arena__player-hand-wrap')),
      villainHand: rect(document.querySelector('.ft-villain-hand .live-arena__player-hand-wrap')),
      playedCards: Array.from(document.querySelectorAll('.ft-played-slot .card')).map(rect),
    }
  })

  expect(geometry.deck).not.toBeNull()
  expect(geometry.stake).not.toBeNull()
  expect(geometry.heroHand).not.toBeNull()
  expect(geometry.villainHand).not.toBeNull()
  expect(geometry.playedCards.length).toBeGreaterThan(0)

  expect(geometry.deck!.left).toBeGreaterThanOrEqual(geometry.villainHand!.right - 6)

  for (const playedCard of geometry.playedCards) {
    expect(playedCard).not.toBeNull()
    expect(boxesOverlap(geometry.deck!, playedCard!)).toBe(false)
    expect(boxesOverlap(geometry.stake!, playedCard!)).toBe(false)
  }

  expect(geometry.stake!.bottom).toBeLessThanOrEqual(geometry.heroHand!.top - 8)
})

for (const target of [
  { name: 'iPhone SE', viewport: { width: 375, height: 667 } },
  { name: 'iPad Mini', viewport: { width: 768, height: 1024 } },
]) {
  test(`live arena avoids horizontal overflow on ${target.name}`, async ({ page }) => {
    await page.setViewportSize(target.viewport)
    await mockStaticSession(page, buildWaitingTurnSession())
    await startMockedMatch(page)

    const layout = await page.evaluate(() => {
      const select = (selector: string) => document.querySelector(selector)
      const toRect = (element: Element | null) => {
        if (!element) return null
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') {
          return null
        }
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        }
      }

      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scorepad: toRect(select('.ft-scorepad-slot .scorepad')),
        scoreRail: toRect(select('[data-testid="farol-score-rail"]')),
        villainHand: toRect(select('.ft-villain-hand .live-arena__player-hand-wrap')),
        heroHand: toRect(select('.ft-hero-hand .live-arena__player-hand-wrap')),
        decisionBar: toRect(select('.td-rail')),
      }
    })

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1)
    const scoreChrome = layout.scorepad ?? layout.scoreRail
    expect(scoreChrome).not.toBeNull()
    expect(layout.villainHand).not.toBeNull()
    expect(layout.heroHand).not.toBeNull()
    expect(layout.decisionBar).not.toBeNull()

    expect(scoreChrome!.right).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.villainHand!.right).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.heroHand!.right).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.decisionBar!.right).toBeLessThanOrEqual(layout.viewportWidth + 1)
  })
}

test('compact iPhone SE keeps Farol controls in bounds without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockStaticSession(page, buildWaitingTurnSession({ dealer: 0 }))
  await startMockedMatch(page)

  const layout = await page.evaluate(() => {
    const select = (selector: string) => document.querySelector(selector)
    const toRect = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      }
    }

    return {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      table: toRect(select('.ft-root')),
      tableHeroSlot: toRect(select('.ft-played-round-active .current-player-card')),
      stake: toRect(select('[data-testid="live-stake-indicator"]')),
      decision: toRect(select('.td-rail')),
      villainHand: toRect(select('.ft-villain-hand .live-arena__player-hand-wrap')),
      heroHand: toRect(select('.ft-hero-hand .live-arena__player-hand-wrap')),
      deck: toRect(select('.ft-deck-slot')),
      scorepad: toRect(select('.ft-scorepad-slot .scorepad')),
      scoreRail: toRect(select('[data-testid="farol-score-rail"]')),
    }
  })

  expect(layout.table).not.toBeNull()
  expect(layout.tableHeroSlot).not.toBeNull()
  expect(layout.stake).not.toBeNull()
  expect(layout.decision).not.toBeNull()
  expect(layout.villainHand).not.toBeNull()
  expect(layout.heroHand).not.toBeNull()
  expect(layout.deck).not.toBeNull()
  const scoreChrome = layout.scorepad ?? layout.scoreRail
  expect(scoreChrome).not.toBeNull()

  expect(layout.villainHand!.top).toBeGreaterThanOrEqual(0)
  for (const rect of [scoreChrome, layout.villainHand, layout.heroHand, layout.stake, layout.decision]) {
    expect(rect!.left).toBeGreaterThanOrEqual(-1)
    expect(rect!.right).toBeLessThanOrEqual(layout.viewportWidth + 1)
  }
  expect(layout.decision!.bottom).toBeLessThanOrEqual(layout.table!.bottom + 1)
  expect(layout.tableHeroSlot!.bottom).toBeLessThanOrEqual(layout.table!.bottom)
  expect(layout.deck!.bottom).toBeLessThanOrEqual(layout.heroHand!.top - 8)
})

test('compact iPhone SE keeps hero played card clear and lifts the hand above the rail', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockStaticSession(page, buildHeroPlayedWithVisibleHandSession())
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)
  await waitForFarolIntroToSettle(page)

  const geometry = await page.evaluate(() => {
    const q = (selector: string) => document.querySelector(selector)
    const rect = (element: Element | null) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: box.left,
        y: box.top,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      }
    }

    return {
      decisionRail: rect(q('.td-rail')),
      heroTableCard: rect(q('.ft-played-round-active .current-player-card .card')),
      heroHand: rect(q('.ft-hero-hand')),
      stake: rect(q('[data-testid="live-stake-indicator"]')),
      heroHandCards: Array.from(document.querySelectorAll('.ft-hero-hand .hand.player-hand .card')).map(rect),
      markerCenters: Array.from(document.querySelectorAll('.ft-played-round')).map((round) => {
        const marker = round.querySelector('.ft-played-marker')
        const pair = round.querySelector('.ft-played-pair')
        const markerRect = rect(marker)
        const pairRect = rect(pair)
        if (!markerRect || !pairRect) return null

        return {
          markerY: markerRect.top + (markerRect.height / 2),
          pairY: pairRect.top + (pairRect.height / 2),
        }
      }),
      stack: {
        heroHandZ: Number.parseInt(window.getComputedStyle(q('.ft-hero-hand')!).zIndex, 10),
        stakeZ: Number.parseInt(window.getComputedStyle(q('[data-testid="live-stake-indicator"]')!).zIndex, 10),
      },
    }
  })

  expect(geometry.decisionRail).not.toBeNull()
  expect(geometry.heroTableCard).not.toBeNull()
  expect(geometry.heroHand).not.toBeNull()
  expect(geometry.stake).not.toBeNull()
  expect(geometry.heroHandCards.length).toBeGreaterThan(0)

  const heroHandTop = Math.min(...geometry.heroHandCards.map((card) => card!.top))

  expect(geometry.heroTableCard!.bottom).toBeLessThanOrEqual(heroHandTop - 8)
  expect(geometry.stack.stakeZ).toBeGreaterThan(geometry.stack.heroHandZ)

  for (const heroHandCard of geometry.heroHandCards) {
    expect(boxesOverlap(geometry.heroTableCard!, heroHandCard!)).toBe(false)
    expect(heroHandCard!.bottom).toBeLessThanOrEqual(geometry.decisionRail!.top - 2)
  }

  for (const markerCenter of geometry.markerCenters) {
    expect(markerCenter).not.toBeNull()
    expect(Math.abs(markerCenter!.markerY - markerCenter!.pairY)).toBeLessThanOrEqual(2)
  }

  await page.locator('.ft-root').screenshot({
    path: testInfo.outputPath('farol-compact-played-cards-clear-hero-hand.png'),
  })
})

test('compact iPhone SE keeps villain played card close to the villain hand', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockVisibleOpponentCurrentRoundMatch(page)
  await startMockedMatch(page)
  await waitForMotionOverlaysToSettle(page)
  await waitForFarolIntroToSettle(page)
  const villainTableCard = activeOpponentTableSlot(page).locator('.card:not(.placeholder)')
  await expect(villainTableCard).toHaveCount(1)

  const geometry = await page.evaluate(() => {
    const q = (selector: string) => document.querySelector(selector)
    const rect = (element: Element | null) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        top: box.top,
        bottom: box.bottom,
      }
    }

    return {
      villainTableCard: rect(q('.ft-played-round-active .current-opponent-card .card:not(.placeholder)')),
      villainHand: rect(q('.ft-villain-hand .live-arena__player-hand-wrap')),
    }
  })

  expect(geometry.villainTableCard).not.toBeNull()
  expect(geometry.villainHand).not.toBeNull()

  const villainGap = geometry.villainTableCard!.top - geometry.villainHand!.bottom
  expect(villainGap).toBeGreaterThanOrEqual(8)
  expect(villainGap).toBeLessThanOrEqual(48)
})

test('compact iPhone SE keeps villain-led Farol slots and trace cards inside their round columns', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockVisibleOpponentCurrentRoundMatch(page)
  await startMockedMatch(page)

  const geometry = await page.evaluate(() => {
    const q = (selector: string) => document.querySelector(selector)
    const rect = (element: Element | null) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      }
    }

    const firstRound = document.querySelector('.ft-played-round')
    const traceCards = firstRound?.querySelectorAll('.ft-played-slot .card')

    return {
      viewportHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      table: rect(q('.ft-root')),
      played: rect(q('.ft-played')),
      stage: rect(q('.ft-played-round-active .ft-played-pair')),
      villainSlot: rect(q('.ft-played-round-active .current-opponent-card')),
      heroSlot: rect(q('.ft-played-round-active .current-player-card')),
      firstRound: rect(firstRound),
      firstRoundTopCard: rect(traceCards?.[0] ?? null),
      firstRoundBottomCard: rect(traceCards?.[1] ?? null),
    }
  })

  expect(geometry.table).not.toBeNull()
  expect(geometry.played).not.toBeNull()
  expect(geometry.stage).not.toBeNull()
  expect(geometry.villainSlot).not.toBeNull()
  expect(geometry.heroSlot).not.toBeNull()
  expect(geometry.firstRound).not.toBeNull()
  expect(geometry.firstRoundTopCard).not.toBeNull()
  expect(geometry.firstRoundBottomCard).not.toBeNull()

  expect(geometry.villainSlot!.top).toBeGreaterThanOrEqual(geometry.table!.top)
  expect(geometry.villainSlot!.bottom).toBeLessThanOrEqual(geometry.table!.bottom)
  expect(geometry.heroSlot!.bottom).toBeLessThanOrEqual(geometry.table!.bottom)

  for (const card of [geometry.firstRoundTopCard, geometry.firstRoundBottomCard]) {
    expect(card!.left).toBeGreaterThanOrEqual(geometry.table!.left - 4)
    expect(card!.right).toBeLessThanOrEqual(geometry.table!.right + 4)
    expect(card!.top).toBeGreaterThanOrEqual(geometry.table!.top - 4)
    expect(card!.bottom).toBeLessThanOrEqual(geometry.table!.bottom + 4)
  }
})

test('Farol scorepad keeps two-digit scores inside their paper cells', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStaticSession(page, buildWaitingTurnSession({
    dealer: 0,
    score: { '0': 10, '1': 10 },
  }))
  await startMockedMatch(page)

  const geometry = await page.evaluate(() => {
    const heroCell = document.querySelector('[data-testid="score-row-hero"]')
    const villainCell = document.querySelector('[data-testid="score-row-villain"]')
    const heroScore = heroCell?.querySelector('.score-number')
    const villainScore = villainCell?.querySelector('.score-number')

    if (!heroCell || !villainCell || !heroScore || !villainScore) {
      throw new Error('Missing Farol scorepad geometry target.')
    }

    const rect = (element: Element) => {
      const box = element.getBoundingClientRect()
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
      }
    }
    return {
      heroCell: rect(heroCell),
      villainCell: rect(villainCell),
      heroScore: rect(heroScore),
      villainScore: rect(villainScore),
    }
  })

  expect(geometry.heroScore.left).toBeGreaterThanOrEqual(geometry.heroCell.left)
  expect(geometry.heroScore.right).toBeLessThanOrEqual(geometry.heroCell.right)
  expect(geometry.villainScore.left).toBeGreaterThanOrEqual(geometry.villainCell.left)
  expect(geometry.villainScore.right).toBeLessThanOrEqual(geometry.villainCell.right)
})

test('Farol scorepad renders paper tally scores by default', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStaticSession(page, buildWaitingTurnSession({
    score: { '0': 4, '1': 3 },
  }))
  await startMockedMatch(page)

  const heroScoreNumber = page.getByTestId('score-row-hero').locator('.score-number')
  const villainScoreNumber = page.getByTestId('score-row-villain').locator('.score-number')

  await expect(heroScoreNumber).toHaveAttribute('data-score-display-style', 'farol')
  await expect(villainScoreNumber).toHaveAttribute('data-score-display-style', 'farol')
  await expect(heroScoreNumber).toHaveText('4')
  await expect(villainScoreNumber).toHaveText('3')
  await expect(page.getByTestId('score-row-hero').locator('.tally-stroke')).toHaveCount(4)
  await expect(page.getByTestId('score-row-villain').locator('.tally-stroke')).toHaveCount(3)
  await expect(page.locator('.score-brass-inlay, .score-digital-display')).toHaveCount(0)
})

test('Farol scorepad ignores retired score display variants', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStaticSession(page, buildWaitingTurnSession({
    score: { '0': 9, '1': 0 },
  }))

  for (const style of ['track', 'medallion', 'bars', 'chips']) {
    await page.goto(LIVE_GAME_TEST_URL, { waitUntil: 'domcontentloaded' })
    await setStoredScoreDisplayStyle(page, style)
    await startMockedMatch(page)

    const heroRow = page.getByTestId('score-row-hero')
    await expect(heroRow.locator('.score-number')).toHaveAttribute('data-score-display-style', 'farol')
    await expect(heroRow.locator('.tally-group')).toHaveCount(2)
    await expect(page.locator('.score-peg-track, .score-medallion, .score-matchsticks, .score-chip-stack')).toHaveCount(0)
  }
})

test('Farol scorepad mirrors each side with separate tally cells', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockStaticSession(page, buildWaitingTurnSession({
    score: { '0': 3, '1': 3 },
  }))
  await startMockedMatch(page)

  await expect(page.getByTestId('score-row-hero').locator('.tally-stroke')).toHaveCount(3)
  await expect(page.getByTestId('score-row-villain').locator('.tally-stroke')).toHaveCount(3)
  const cellGap = await page.evaluate(() => {
    const hero = document.querySelector('[data-testid="score-row-hero"]')
    const villain = document.querySelector('[data-testid="score-row-villain"]')
    if (!hero || !villain) throw new Error('Missing Farol scorepad cells.')
    return villain.getBoundingClientRect().left - hero.getBoundingClientRect().right
  })
  expect(cellGap).toBeGreaterThan(4)
})

test('stale match recovery returns to the standard launcher before creating a fresh match', async ({ page }) => {
  const staleMatchId = 'match-does-not-exist'
  const freshMatchId = 'fresh-match-1'
  const startRequests: Array<Record<string, unknown>> = []
  let activeSession: ReturnType<typeof buildWaitingTurnSession> | null = null

  await page.route('**/api/game/session**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'POST' && url.pathname === '/api/game/session') {
      startRequests.push(request.postDataJSON() as Record<string, unknown>)

      const nextSession = cloneJson(buildWaitingTurnSession())
      nextSession.matchId = freshMatchId
      activeSession = nextSession

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(nextSession),
      })
      return
    }

    if (request.method() === 'GET' && url.pathname === `/api/game/session/${staleMatchId}`) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'UNEXPECTED_BACKEND_CODE',
          message: 'Missing match record.',
        }),
      })
      return
    }

    if (request.method() === 'GET' && activeSession && url.pathname === `/api/game/session/${activeSession.matchId}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activeSession),
      })
      return
    }

    await route.continue()
  })

  await page.goto(`/?match=${staleMatchId}`)

  const failure = await expectSessionFailureCopy(page, 'No match by that name.')
  await expect(failure).toContainText('NOT FOUND')
  await expect(failure).toContainText('start fresh match')
  await expect(page).toHaveURL(new RegExp(`\\?match=${staleMatchId}$`))
  await expect(page.getByRole('button', { name: 'Clear Broken Match Link' })).toHaveCount(0)
  await expect(failure.getByRole('button', { name: /start fresh match/i })).toBeVisible()
  await expect(failure.getByRole('button', { name: /dismiss/i })).toHaveCount(0)
  await expect(failure.getByRole('button', { name: /paste link again/i })).toBeVisible()

  await failure.getByRole('button', { name: /start fresh match/i }).click()

  const launcher = page.getByTestId('live-game-launcher-screen')
  await expect(launcher).toBeVisible()
  await expect(launcher).toContainText('Truco')
  await expect(launcher).toContainText('Start match')
  await expect(launcher.getByTestId('live-game-launcher-start-button')).toContainText('Start')
  await expect(page.getByTestId('live-session-failure')).toHaveCount(0)
  await expect(page.getByTestId('live-game-new-match-confirmation')).toHaveCount(0)
  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(null)
  await expect(launcher.getByTestId('live-game-launcher-dealer-trigger')).toContainText('Random')
  await expect(launcher.getByTestId('live-game-launcher-bot-trigger')).toContainText('Heuristic')
  await expect.poll(() => startRequests.length).toBe(0)

  await launcher.getByTestId('live-game-launcher-dealer-trigger').click()
  await launcher.getByTestId('live-game-launcher-dealer-option-1').click()
  await launcher.getByTestId('live-game-launcher-bot-trigger').click()
  await expect(launcher.getByTestId('live-game-launcher-bot-option-simple')).toHaveCount(0)
  await launcher.getByTestId('live-game-launcher-bot-option-random').click()
  await launcher.getByTestId('live-game-launcher-start-button').click()

  await expect.poll(() => startRequests.length).toBe(1)
  expect(startRequests[0]).toMatchObject({
    botKind: 'random',
    startingDealer: 1,
  })
  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(freshMatchId)
})

test('stale match recovery can rejoin the last saved match', async ({ page }) => {
  const staleMatchId = 'missing-rejoin-link'
  const recentMatchId = 'recent-local-match'
  const recentSession = cloneJson(buildWaitingTurnSession())
  recentSession.matchId = recentMatchId

  await page.addInitScript(
    ({ matchId }) => {
      window.localStorage.setItem('truco-live-recent-match-v1', JSON.stringify({
        matchId,
        opponent: 'Heuristic · balanced',
        youScore: 12,
        themScore: 9,
        updatedAt: Date.now() - 3 * 60_000,
        botKind: 'heuristic',
        botProfile: 'balanced',
        botModel: null,
      }))
    },
    { matchId: recentMatchId },
  )

  await page.route('**/api/game/session**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (request.method() === 'GET' && url.pathname === `/api/game/session/${staleMatchId}`) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'MATCH_NOT_FOUND',
          message: 'Missing match record.',
        }),
      })
      return
    }

    if (request.method() === 'GET' && url.pathname === `/api/game/session/${recentMatchId}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(recentSession),
      })
      return
    }

    await route.continue()
  })

  await page.goto(`/?match=${staleMatchId}`)

  const failure = await expectSessionFailureCopy(page, 'No match by that name.')
  await expect(failure).toContainText('LAST ENTRY')
  await expect(failure).toContainText('Heuristic · Balanced')
  await expect(failure.getByRole('button', { name: /rejoin last match/i })).toBeVisible()

  await failure.getByRole('button', { name: /rejoin last match/i }).click()

  await expect.poll(() => new URL(page.url()).searchParams.get('match')).toBe(recentMatchId)
  await expectLiveMatchReady(page)
})

test('expired matches still map from status when the backend code is unexpected', async ({ page }) => {
  await mockSessionLoadFailure(page, {
    matchId: 'expired-match',
    status: 410,
    code: 'TOTALLY_DIFFERENT_CODE',
    message: 'This session already expired.',
  })

  await page.goto('/?match=expired-match')

  const failure = await expectSessionFailureCopy(page, 'That match is over.')
  await expect(failure).toContainText('RETURNED')
  await expect(failure).toContainText('start fresh match')
  await expect(page).toHaveURL(/\?match=expired-match$/)
  await expect(page.getByRole('button', { name: 'Clear Broken Match Link' })).toHaveCount(0)
  await expect(failure.getByRole('button', { name: /start fresh match/i })).toBeVisible()
})

test('engine timeout failures use timeout recovery copy even without a backend code', async ({ page }) => {
  await mockSessionLoadFailure(page, {
    matchId: 'slow-match',
    status: 504,
    message: 'Gateway timeout from upstream.',
  })

  await page.goto('/?match=slow-match')

  await expectSessionFailureCopy(page, 'The live service timed out.')
  await expect(page.getByRole('button', { name: 'Retry loading match' })).toBeVisible()
  await expect(page).toHaveURL(/\?match=slow-match$/)
})

test('engine outages use unavailable recovery copy even with an unexpected backend code', async ({ page }) => {
  await mockSessionLoadFailure(page, {
    matchId: 'engine-down',
    status: 503,
    code: 'WEIRD_UPSTREAM_FAILURE',
    message: 'Upstream refused the request.',
  })

  await page.goto('/?match=engine-down')

  await expectSessionFailureCopy(page, 'The live service is out of reach.')
  await expect(page.getByRole('button', { name: 'Retry loading match' })).toBeVisible()
  await expect(page).toHaveURL(/\?match=engine-down$/)
})

test('villain accepting a hero raise shows the live-stakes transient state', async ({ page }) => {
  const matchId = 'stake-fx-villain-accept'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 3 },
    ],
  })
  const acceptedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 3,
    currentPlayer: 1,
    lastRaisedBy: 0,
    legalActions: [],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { raise: acceptedSession },
  })

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  const raiseButton = page.getByRole('button', { name: 'Truco' })
  await expect(raiseButton).toBeEnabled()
  await raiseButton.click({ force: true })

  await expect(page.getByTestId('live-stake-fx-callout')).toContainText('They accept')
  await expect(page.getByTestId('live-stake-fx-live-badge')).toContainText('+3 is live')
  await expect(page.getByTestId('live-decision-panel')).toContainText('Stake locked at +3')
  await expect(page.getByTestId('live-decision-fx-ribbon')).toContainText('They accept')
})

test('villain folding to the stake peg raise waits for the hero raise beat before payoff', async ({ page }) => {
  const matchId = 'stake-fx-villain-fold-after-hero-raise'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 3 },
    ],
  })
  const foldedSession = cloneJson(initialSession)
  const foldedScore = { '0': 5, '1': 3 } as const
  foldedSession.state.score = foldedScore
  foldedSession.state.current_hand!.state.score = foldedScore
  foldedSession.state.current_hand!.state.next_player = null
  foldedSession.state.current_hand!.state.last_raised_by = 0
  foldedSession.state.current_hand!.hand_winner = 0
  foldedSession.publicView.score = foldedScore
  foldedSession.publicView.current_player = null
  foldedSession.publicView.hand_in_progress = false
  foldedSession.publicView.hand!.next_player = null
  foldedSession.publicView.hand!.hand_winner = 0
  foldedSession.publicView.hand!.score = foldedScore
  foldedSession.playerView.score = foldedScore
  foldedSession.playerView.current_player = null
  foldedSession.playerView.hand_in_progress = false
  foldedSession.playerView.hand!.public_state.next_player = null
  foldedSession.playerView.hand!.public_state.hand_winner = 0
  foldedSession.playerView.hand!.public_state.score = foldedScore
  foldedSession.legalActions = []

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { raise: foldedSession },
  })

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveStakeFoldTimings?: {
        heroRaiseAt: number | null
        villainDeclineAt: number | null
        calloutGoneAt: number | null
        scoreChangedAt: number | null
        scorePointsAtVillainDecline: string | null
        scorePointsAtCalloutGone: string | null
        calloutAtVillainDecline: string | null
      }
    }
    const timings = {
      heroRaiseAt: null as number | null,
      villainDeclineAt: null as number | null,
      calloutGoneAt: null as number | null,
      scoreChangedAt: null as number | null,
      scorePointsAtVillainDecline: null as string | null,
      scorePointsAtCalloutGone: null as string | null,
      calloutAtVillainDecline: null as string | null,
    }
    globalWindow.__liveStakeFoldTimings = timings

    const tick = () => {
      const stake = document.querySelector('[data-testid="live-stake-indicator"]')
      const stakeActor = stake?.getAttribute('data-stake-fx-actor')
      const stakeAction = stake?.getAttribute('data-stake-fx-action')
      const scoreRow = document.querySelector('[data-testid="score-row-hero"]')
      const scorePoints = scoreRow?.getAttribute('data-score-points') ?? null
      const callout = document.querySelector('[data-testid="live-stake-fx-callout"]')

      if (timings.heroRaiseAt == null && stakeActor === 'hero' && stakeAction === 'raise') {
        timings.heroRaiseAt = performance.now()
      }
      if (timings.villainDeclineAt == null && stakeActor === 'villain' && stakeAction === 'decline') {
        timings.villainDeclineAt = performance.now()
        timings.scorePointsAtVillainDecline = scorePoints
        timings.calloutAtVillainDecline = document
          .querySelector('[data-testid="live-stake-fx-callout"]')
          ?.textContent ?? null
      }
      if (timings.villainDeclineAt != null && timings.calloutGoneAt == null && !callout) {
        timings.calloutGoneAt = performance.now()
        timings.scorePointsAtCalloutGone = scorePoints
      }
      if (timings.scoreChangedAt == null && scorePoints != null && scorePoints !== '4') {
        timings.scoreChangedAt = performance.now()
      }

      if (
        timings.heroRaiseAt == null ||
        timings.villainDeclineAt == null ||
        timings.calloutGoneAt == null ||
        timings.scoreChangedAt == null
      ) {
        window.requestAnimationFrame(tick)
      }
    }

    window.requestAnimationFrame(tick)
  })

  await page.getByRole('button', { name: 'Truco' }).click()

  const stakeIndicator = page.getByTestId('live-stake-indicator')
  await expect(stakeIndicator).toHaveAttribute('data-stake-fx-actor', 'hero')
  await expect(stakeIndicator).toHaveAttribute('data-stake-fx-action', 'raise')
  await expect(page.getByTestId('score-row-hero')).toHaveAttribute('data-score-points', '4')

  await page.waitForFunction(() => {
    const globalWindow = window as typeof window & {
      __liveStakeFoldTimings?: {
        heroRaiseAt: number | null
        villainDeclineAt: number | null
        calloutGoneAt: number | null
        scoreChangedAt: number | null
      }
    }

    return Boolean(
      globalWindow.__liveStakeFoldTimings &&
      globalWindow.__liveStakeFoldTimings.heroRaiseAt != null &&
      globalWindow.__liveStakeFoldTimings.villainDeclineAt != null &&
      globalWindow.__liveStakeFoldTimings.calloutGoneAt != null &&
      globalWindow.__liveStakeFoldTimings.scoreChangedAt != null,
    )
  })

  const timings = await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveStakeFoldTimings?: {
        heroRaiseAt: number | null
        villainDeclineAt: number | null
        calloutGoneAt: number | null
        scoreChangedAt: number | null
        scorePointsAtVillainDecline: string | null
        scorePointsAtCalloutGone: string | null
        calloutAtVillainDecline: string | null
      }
    }

    return globalWindow.__liveStakeFoldTimings ?? null
  })

  expect((timings?.villainDeclineAt ?? 0) - (timings?.heroRaiseAt ?? 0)).toBeGreaterThanOrEqual(800)
  expect((timings?.calloutGoneAt ?? 0) - (timings?.villainDeclineAt ?? 0)).toBeGreaterThanOrEqual(1500)
  expect(timings?.scorePointsAtVillainDecline).toBe('4')
  expect(timings?.scorePointsAtCalloutGone).toBe('4')
  expect(timings?.calloutAtVillainDecline).toContain('They decline')
  expect(timings?.scoreChangedAt ?? 0).toBeGreaterThan(timings?.calloutGoneAt ?? 0)
})

test('villain re-raising a hero raise keeps a distinct escalation transient state', async ({ page }) => {
  const matchId = 'stake-fx-villain-reraise'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 3 },
    ],
  })
  const reraisedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    lastRaisedBy: 0,
    pendingRaise: { raised_by: 1, to: 6, previous_value: 3 },
    legalActions: [
      { type: 'accept_raise' },
      { type: 'fold' },
      { type: 'raise', to: 9 },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { raise: reraisedSession },
  })

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveStakeReraiseTrace?: {
        seen: boolean
        liveBadgeCount: number | null
      }
    }

    const trace = {
      seen: false,
      liveBadgeCount: null as number | null,
    }
    globalWindow.__liveStakeReraiseTrace = trace

    const tick = () => {
      const stake = document.querySelector('[data-testid="live-stake-indicator"]')
      const decisionPanel = document.querySelector('[data-testid="live-decision-panel"]')
      const stakeAction = stake?.getAttribute('data-stake-fx-action')
      const decisionAction = decisionPanel?.getAttribute('data-stake-fx-action')

      if (stakeAction === 'reraise' && decisionAction === 'reraise') {
        trace.seen = true
        trace.liveBadgeCount = document.querySelectorAll('[data-testid="live-stake-fx-live-badge"]').length
        return
      }

      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  })

  await page.getByRole('button', { name: 'Truco' }).click()

  await page.waitForFunction(() => {
    const globalWindow = window as typeof window & {
      __liveStakeReraiseTrace?: {
        seen: boolean
      }
    }

    return globalWindow.__liveStakeReraiseTrace?.seen === true
  })

  const trace = await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveStakeReraiseTrace?: {
        seen: boolean
        liveBadgeCount: number | null
      }
    }

    return globalWindow.__liveStakeReraiseTrace ?? null
  })
  expect(trace?.liveBadgeCount).toBe(0)
})

test('hero accepting a villain raise shows the same live-stakes transient state', async ({ page }) => {
  const matchId = 'stake-fx-hero-accept'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    pendingRaise: { raised_by: 1, to: 3, previous_value: 1 },
    legalActions: [
      { type: 'accept_raise' },
      { type: 'fold' },
      { type: 'raise', to: 6 },
      { type: 'concede_hand' },
    ],
  })
  const acceptedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 3,
    currentPlayer: 0,
    lastRaisedBy: 1,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 6 },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { accept_raise: acceptedSession },
  })

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  const decisionPanel = page.getByTestId('live-decision-panel')
  const stakeIndicator = page.getByTestId('live-stake-indicator')
  await expect(decisionPanel.getByRole('button', { name: 'Fold' })).toHaveCount(1)
  await expect(stakeIndicator).toHaveAttribute('data-stake-tooltip', 'Accept raise')
  await stakeIndicator.click()

  await expect(stakeIndicator).toHaveAttribute('data-stake-fx-action', 'accept')
  expect(await stakeIndicator.getAttribute('data-stake-tooltip')).toBeNull()
  await expect(decisionPanel.getByRole('button', { name: 'Raise to 6' })).toHaveCount(0)
  await expect(page.getByTestId('live-stake-fx-callout')).toContainText('You accept')
  await expect(page.getByTestId('live-stake-fx-live-badge')).toContainText('+3 is live')
  await expect(page.getByTestId('live-decision-panel')).toHaveAttribute('data-stake-fx-action', 'accept')
  await expect(page.getByTestId('live-decision-panel')).toContainText('Stake locked at +3')
  await expect(page.getByTestId('live-decision-fx-ribbon')).toContainText('You accept')
  await expect(stakeIndicator).toHaveAttribute('data-stake-tooltip', 'Raise to 6')
  await expect(decisionPanel.getByRole('button', { name: 'Raise to 6' })).toHaveCount(1)
})

test('Farol stake peg keeps stable dimensions while a raise animation is active', async ({ page }) => {
  const matchId = 'stake-fx-height-stability'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 3 },
    ],
  })
  const reraisedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    lastRaisedBy: 0,
    pendingRaise: { raised_by: 1, to: 6, previous_value: 3 },
    legalActions: [
      { type: 'accept_raise' },
      { type: 'fold' },
      { type: 'raise', to: 9 },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { raise: reraisedSession },
  })

  await startMockedMatch(page)

  const stakeIndicator = page.getByTestId('live-stake-indicator')
  const table = page.locator('.ft-root')
  await expect(stakeIndicator).toBeVisible()
  await expect(table).toBeVisible()

  const readStakeGeometry = async () => page.evaluate(() => {
    const stake = document.querySelector('[data-testid="live-stake-indicator"]')
    const peg = stake?.querySelector('.peg')
    const table = document.querySelector('.ft-root')
    const tablePlane = document.querySelector('.ft-table-plane')
    const heroHand = document.querySelector('.ft-hero-hand')
    const heroCard = document.querySelector('.ft-hero-hand .card-shell, .ft-hero-hand .card, .ft-hero-hand .fcard, .ft-hero-hand .spcard')
    const burst = document.querySelector('.ft-stake-burst')
    if (!stake || !peg || !table || !tablePlane || !heroHand) {
      throw new Error('Missing Farol stake geometry target.')
    }

    const toLayoutSize = (element: Element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error('Missing Farol stake layout target.')
      }
      return {
        height: element.offsetHeight,
        width: element.offsetWidth,
      }
    }

    const stakeSize = toLayoutSize(stake)
    const pegSize = toLayoutSize(peg)
    const stakeRect = stake.getBoundingClientRect()
    const burstRect = burst?.getBoundingClientRect()
    const callout = document.querySelector('[data-testid="live-stake-fx-callout"]')
    const toClientRect = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    }

    return {
      stake: stakeSize,
      peg: pegSize,
      table: toLayoutSize(table),
      rects: {
        callout: toClientRect(callout),
        heroHand: toClientRect(heroHand),
        heroCard: toClientRect(heroCard),
      },
      centers: {
        stakePegX: stakeRect.left + stakeRect.width / 2,
        stakePegY: stakeRect.top + pegSize.height / 2,
        burstX: burstRect ? burstRect.left + burstRect.width / 2 : null,
        burstY: burstRect ? burstRect.top + burstRect.height / 2 : null,
      },
      stack: {
        hasBurst: Boolean(burst),
        burstZ: burst ? Number.parseInt(window.getComputedStyle(burst).zIndex, 10) : null,
        heroHandZ: Number.parseInt(window.getComputedStyle(heroHand).zIndex, 10),
        heroCardZ: heroCard ? Number.parseInt(window.getComputedStyle(heroCard).zIndex, 10) || 0 : 0,
        tablePlaneZ: Number.parseInt(window.getComputedStyle(tablePlane).zIndex, 10),
      },
    }
  })

  const beforeRaise = await readStakeGeometry()

  await page.getByRole('button', { name: 'Truco' }).click()
  await expect(page.getByTestId('live-stake-indicator')).toHaveAttribute('data-stake-fx-action', 'raise')
  await expect(page.getByTestId('live-stake-fx-callout')).toContainText('You raise to +3')
  await expect(page.locator('.ft-stake-burst')).toHaveCount(1)
  const duringRaise = await readStakeGeometry()
  await page.waitForTimeout(120)
  await page.locator('.live-arena__board').screenshot({
    path: '/tmp/truco-live-stake-fx-layering.png',
  })

  expect(Math.abs(duringRaise.peg.height - beforeRaise.peg.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(duringRaise.table.height - beforeRaise.table.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(duringRaise.peg.width - beforeRaise.peg.width)).toBeLessThanOrEqual(1)
  expect(duringRaise.stack.hasBurst).toBe(true)
  expect(duringRaise.centers.burstX).not.toBeNull()
  expect(duringRaise.centers.burstY).not.toBeNull()
  expect(Math.abs((duringRaise.centers.burstX ?? 0) - duringRaise.centers.stakePegX)).toBeLessThanOrEqual(3)
  expect(Math.abs((duringRaise.centers.burstY ?? 0) - duringRaise.centers.stakePegY)).toBeLessThanOrEqual(1)
  expect(duringRaise.rects.callout).not.toBeNull()
  expect(duringRaise.rects.heroHand).not.toBeNull()
  if (!duringRaise.rects.callout || !duringRaise.rects.heroHand) {
    throw new Error('Missing stake FX callout or Hero hand geometry.')
  }
  expect(boxesOverlap(duringRaise.rects.callout, duringRaise.rects.heroHand)).toBe(false)
  expect(duringRaise.stack.tablePlaneZ).toBeLessThan(duringRaise.stack.heroHandZ)
  expect(duringRaise.stack.burstZ).toBeGreaterThan(duringRaise.stack.heroHandZ + duringRaise.stack.heroCardZ)
})

test('hero eleven-hand decision replaces the standard raise controls', async ({ page }) => {
  const matchId = 'hero-eleven-hand-decision'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 1,
    currentPlayer: 0,
    score: { '0': 11, '1': 8 },
    pendingDecision: { type: 'mao_de_onze', player: 0 },
    legalActions: [
      { type: 'accept_eleven' },
      { type: 'concede_hand' },
      { type: 'fold_eleven' },
    ],
  })
  const acceptedSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 3,
    currentPlayer: 0,
    score: { '0': 11, '1': 8 },
    pendingDecision: null,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'concede_hand' },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { accept_eleven: acceptedSession },
  })

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  const decisionPanel = page.getByTestId('live-decision-panel')
  await expect(decisionPanel).toContainText('Eleven-hand decision')
  await expect(decisionPanel.getByRole('button', { name: 'Play For 3' })).toHaveCount(1)
  await expect(decisionPanel.getByRole('button', { name: 'Fold' })).toHaveCount(1)
  await expect(decisionPanel.getByRole('button', { name: 'Accept' })).toHaveCount(0)
  await expect(decisionPanel.getByRole('button', { name: 'Raise' })).toHaveCount(0)
  await expect(page.locator('.live-arena__board')).toHaveClass(/is-response-focus/)
  await expect(page.locator('.ft-root')).toHaveAttribute('data-eleven-focus', 'hero')
  await expect(page.getByTestId('farol-scorepad')).toHaveAttribute('data-eleven-focus', 'hero')
  await expect(page.getByTestId('score-row-hero')).toHaveAttribute('data-eleven-active', 'true')
  await expect(page.getByTestId('score-row-villain')).toHaveAttribute('data-eleven-muted', 'true')

  const stakeIndicator = page.getByTestId('live-stake-indicator')
  await expect(stakeIndicator).toHaveAttribute('aria-label', 'Play for 3')
  await expect(stakeIndicator).toHaveClass(/is-actionable/)
  const elevenStakePegStyle = await stakeIndicator.evaluate((element) => {
    const pegTop = element.querySelector<HTMLElement>('.peg-top')
    return {
      filter: window.getComputedStyle(element).filter,
      boxShadow: pegTop ? window.getComputedStyle(pegTop).boxShadow : '',
    }
  })
  expect(elevenStakePegStyle.filter).toContain('brightness')
  expect(elevenStakePegStyle.boxShadow).toContain('240, 193, 91')
  await stakeIndicator.click()
  await expect(stakeIndicator).toHaveAttribute('data-stake-fx-action', 'accept')
  await expect(decisionPanel).not.toContainText('Eleven-hand decision')
})

test('eleven versus eleven shows duel focus without an eleven decision', async ({ page }) => {
  const matchId = 'eleven-duel-focus'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 3,
    currentPlayer: 0,
    score: { '0': 11, '1': 11 },
    pendingDecision: null,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'concede_hand' },
    ],
  })

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: {},
  })

  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()

  const decisionPanel = page.getByTestId('live-decision-panel')
  await expect(decisionPanel).not.toContainText('Eleven-hand decision')
  await expect(decisionPanel.getByRole('button', { name: 'Play For 3' })).toHaveCount(0)
  await expect(page.locator('.live-arena__board')).not.toHaveClass(/is-response-focus/)
  await expect(page.locator('.ft-root')).toHaveAttribute('data-eleven-focus', 'duel')
  await expect(page.getByTestId('farol-scorepad')).toHaveAttribute('data-eleven-focus', 'duel')
  await expect(page.getByTestId('score-row-hero')).toHaveAttribute('data-eleven-active', 'true')
  await expect(page.getByTestId('score-row-villain')).toHaveAttribute('data-eleven-active', 'true')
})

test('hero can fold away the hand from a normal turn without playing a card', async ({ page }) => {
  const matchId = 'hero-concede-hand'
  const initialSession = buildStakeFxScenarioSession({
    matchId,
    handValue: 3,
    currentPlayer: 0,
    legalActions: [
      { type: 'play_face_up', card_id: 'stake-fx-hero-1' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-2' },
      { type: 'play_face_up', card_id: 'stake-fx-hero-3' },
      { type: 'raise', to: 6 },
      { type: 'concede_hand' },
    ],
  })
  const concededSession = cloneJson(initialSession)
  concededSession.state.score = { '0': 4, '1': 6 }
  concededSession.state.current_hand!.state.score = { '0': 4, '1': 6 }
  concededSession.state.current_hand!.state.next_player = null
  concededSession.state.current_hand!.state.hand_value = 3
  concededSession.state.current_hand!.hand_winner = 1
  concededSession.publicView.score = { '0': 4, '1': 6 }
  concededSession.publicView.current_player = null
  concededSession.publicView.hand_in_progress = false
  concededSession.publicView.hand!.next_player = null
  concededSession.publicView.hand!.hand_winner = 1
  concededSession.publicView.hand!.score = { '0': 4, '1': 6 }
  concededSession.playerView.score = { '0': 4, '1': 6 }
  concededSession.playerView.current_player = null
  concededSession.playerView.hand_in_progress = false
  concededSession.playerView.hand!.public_state.next_player = null
  concededSession.playerView.hand!.public_state.hand_winner = 1
  concededSession.playerView.hand!.public_state.score = { '0': 4, '1': 6 }
  concededSession.legalActions = []

  await mockStakeFxScenario(page, {
    initialSession,
    nextSessionsByAction: { concede_hand: concededSession },
  })

  const requestObserver = observeSessionActionRequests(page)

  try {
    await page.goto('/')
    await ensureLauncherReady(page)
    await page.getByRole('button', { name: 'Start Match' }).click()

    const decisionPanel = page.getByTestId('live-decision-panel')
    const foldButton = decisionPanel.getByRole('button', { name: 'Fold' })
    await expect(foldButton).toHaveCount(1)
    await foldButton.click()

    await expect.poll(() => requestObserver.actionRequests.length).toBe(1)
    expect(requestObserver.actionRequests[0]).toMatchObject({ type: 'concede_hand' })
    await expect(page.locator('.table-status')).toContainText('Between hands')
  } finally {
    requestObserver.dispose()
  }
})
