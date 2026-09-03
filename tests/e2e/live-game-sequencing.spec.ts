import { expect, test, type Page } from '@playwright/test'

const BOT_ELEVEN_DECISION_OBSERVED_MIN_DELAY_MS = 200

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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function buildWaitingTurnSession() {
  const score = { '0': 4, '1': 3 } as const

  return {
    matchId: 'mock-hero-response-sequencing',
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
          turnup: { rank: 'K', suit: 'CLUBS' },
          completed_rounds: [],
          current_round: {
            leader: 0,
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
        completed_rounds: [],
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
          completed_rounds: [],
          current_round: {
            leader: 0,
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

function buildHeroLeadReadySession() {
  const session = cloneJson(buildWaitingTurnSession())

  session.state.current_hand.state.next_player = 0
  session.publicView.current_player = 0
  session.publicView.hand.next_player = 0
  session.playerView.current_player = 0
  session.playerView.hand.public_state.next_player = 0
  session.legalActions = session.playerView.hand.hand.map((card: { id: string }) => ({
    type: 'play_face_up' as const,
    card_id: card.id,
  }))

  return session
}

function buildHeroLeadVillainResponseSession() {
  const session = buildHeroLeadReadySession()
  const [heroCard, ...remainingHeroCards] = session.playerView.hand.hand

  session.playerView.hand.hand = remainingHeroCards
  session.state.current_hand.state.next_player = null
  session.publicView.current_player = null
  session.publicView.hand.next_player = null
  session.playerView.current_player = null
  session.playerView.hand.public_state.next_player = null
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
  session.publicView.hand.current_round = {
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
  session.playerView.hand.public_state.current_round = {
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

function buildOpeningVillainLeadSession() {
  const session = cloneJson(buildWaitingTurnSession())

  session.matchId = 'mock-opening-villain-lead-delay'
  session.state.current_hand.state.next_player = 0
  session.state.current_hand.state.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { id: 'p1c0', rank: '6', suit: 'DIAMONDS' },
      },
    ],
  }
  session.publicView.current_player = 0
  session.publicView.hand.next_player = 0
  session.publicView.hand.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { rank: '6', suit: 'DIAMONDS' },
      },
    ],
  }
  session.playerView.current_player = 0
  session.playerView.hand.public_state.next_player = 0
  session.playerView.hand.public_state.current_round = {
    leader: 1,
    plays: [
      {
        player: 1,
        visibility: 'up',
        card: { rank: '6', suit: 'DIAMONDS' },
      },
    ],
  }
  session.legalActions = session.playerView.hand.hand.map((card: { id: string }) => ({
    type: 'play_face_up' as const,
    card_id: card.id,
  }))

  return session
}

function buildOpeningVillainRaiseSession() {
  const session = cloneJson(buildWaitingTurnSession())
  const pendingRaise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  } as const

  session.matchId = 'mock-opening-villain-raise-delay'
  session.state.current_hand.state.next_player = 0
  session.state.current_hand.state.current_round = {
    leader: 1,
    plays: [],
  }
  session.state.current_hand.state.pending_raise = pendingRaise
  session.publicView.current_player = 0
  session.publicView.hand.next_player = 0
  session.publicView.hand.current_round = {
    leader: 1,
    plays: [],
  }
  session.publicView.hand.pending_raise = pendingRaise
  session.playerView.current_player = 0
  session.playerView.hand.public_state.next_player = 0
  session.playerView.hand.public_state.current_round = {
    leader: 1,
    plays: [],
  }
  session.playerView.hand.public_state.pending_raise = pendingRaise
  session.legalActions = [
    { type: 'accept_raise' as const },
    { type: 'fold' as const },
    { type: 'raise' as const, to: 6 },
  ]

  return session
}

function buildThirdRoundHeroAcceptPendingSession() {
  const session = cloneJson(buildWaitingTurnSession())
  const score = { '0': 4, '1': 3 } as const
  const pendingRaise = {
    raised_by: 1,
    to: 3,
    previous_value: 1,
  } as const

  session.matchId = 'mock-third-round-accept-villain-final-card'
  session.state.next_dealer = 0
  session.state.score = score
  session.state.current_hand.state.dealer = 0
  session.state.current_hand.state.next_player = 0
  session.state.current_hand.state.score = score
  session.state.current_hand.state.hand_value = 1
  session.state.current_hand.state.completed_rounds = [
    {
      leader: 0,
      winner: 0,
      plays: [
        { player: 0, visibility: 'up', card: { id: 'p0c0', rank: '4', suit: 'HEARTS' } },
        { player: 1, visibility: 'up', card: { id: 'p1c0', rank: '5', suit: 'CLUBS' } },
      ],
    },
    {
      leader: 0,
      winner: 1,
      plays: [
        { player: 0, visibility: 'up', card: { id: 'p0c1', rank: '6', suit: 'DIAMONDS' } },
        { player: 1, visibility: 'up', card: { id: 'p1c1', rank: '7', suit: 'SPADES' } },
      ],
    },
  ]
  session.state.current_hand.state.current_round = {
    leader: 0,
    plays: [
      { player: 0, visibility: 'up', card: { id: 'p0c2', rank: 'A', suit: 'CLUBS' } },
    ],
  }
  session.state.current_hand.state.last_raised_by = 1
  session.state.current_hand.state.pending_raise = pendingRaise

  session.publicView.score = score
  session.publicView.next_dealer = 0
  session.publicView.current_player = 0
  session.publicView.hand_in_progress = true
  session.publicView.hand.score = score
  session.publicView.hand.next_player = 0
  session.publicView.hand.hand_value = 1
  session.publicView.hand.completed_rounds = [
    { leader: 0, winner: 0 },
    { leader: 0, winner: 1 },
  ]
  session.publicView.hand.current_round = {
    leader: 0,
    plays: [
      { player: 0, visibility: 'up', card: { rank: 'A', suit: 'CLUBS' } },
    ],
  }
  session.publicView.hand.pending_raise = pendingRaise

  session.playerView.score = score
  session.playerView.next_dealer = 0
  session.playerView.current_player = 0
  session.playerView.hand_in_progress = true
  session.playerView.hand.public_state.score = score
  session.playerView.hand.public_state.next_player = 0
  session.playerView.hand.public_state.hand_value = 1
  session.playerView.hand.public_state.completed_rounds = [
    { leader: 0, winner: 0 },
    { leader: 0, winner: 1 },
  ]
  session.playerView.hand.public_state.current_round = {
    leader: 0,
    plays: [
      { player: 0, visibility: 'up', card: { rank: 'A', suit: 'CLUBS' } },
    ],
  }
  session.playerView.hand.public_state.pending_raise = pendingRaise
  session.playerView.hand.hand = []
  session.legalActions = [
    { type: 'accept_raise' as const },
    { type: 'fold' as const },
    { type: 'raise' as const, to: 6 },
  ]

  return session
}

function buildThirdRoundAcceptedVillainFinalCardSession() {
  const session = buildThirdRoundHeroAcceptPendingSession()
  const score = { '0': 4, '1': 6 } as const

  session.state.next_dealer = 1
  session.state.score = score
  session.state.current_hand.state.next_player = null
  session.state.current_hand.state.score = score
  session.state.current_hand.state.hand_value = 3
  session.state.current_hand.state.completed_rounds = [
    ...session.state.current_hand.state.completed_rounds,
    {
      leader: 0,
      winner: 1,
      plays: [
        { player: 0, visibility: 'up', card: { id: 'p0c2', rank: 'A', suit: 'CLUBS' } },
        { player: 1, visibility: 'up', card: { id: 'p1c2', rank: 'K', suit: 'SPADES' } },
      ],
    },
  ]
  session.state.current_hand.state.current_round = {
    leader: 1,
    plays: [],
  }
  session.state.current_hand.state.pending_raise = null
  session.state.current_hand.hand_winner = 1

  session.publicView.score = score
  session.publicView.next_dealer = 1
  session.publicView.current_player = null
  session.publicView.hand_in_progress = false
  session.publicView.hand.score = score
  session.publicView.hand.next_player = null
  session.publicView.hand.hand_value = 3
  session.publicView.hand.hand_winner = 1
  session.publicView.hand.completed_rounds = [
    ...session.publicView.hand.completed_rounds,
    { leader: 0, winner: 1 },
  ]
  session.publicView.hand.current_round = {
    leader: 1,
    plays: [],
  }
  session.publicView.hand.pending_raise = null

  session.playerView.score = score
  session.playerView.next_dealer = 1
  session.playerView.current_player = null
  session.playerView.hand_in_progress = false
  session.playerView.hand.public_state.score = score
  session.playerView.hand.public_state.next_player = null
  session.playerView.hand.public_state.hand_value = 3
  session.playerView.hand.public_state.hand_winner = 1
  session.playerView.hand.public_state.completed_rounds = [
    ...session.playerView.hand.public_state.completed_rounds,
    { leader: 0, winner: 1 },
  ]
  session.playerView.hand.public_state.current_round = {
    leader: 1,
    plays: [],
  }
  session.playerView.hand.public_state.pending_raise = null
  session.playerView.hand.hand = []
  session.legalActions = []

  return session
}

function buildBotElevenPendingSession() {
  const session = cloneJson(buildWaitingTurnSession())
  const score = { '0': 4, '1': 11 } as const
  const pendingDecision = { type: 'mao_de_onze', player: 1 } as const

  session.matchId = 'mock-bot-eleven-deferred'
  session.state.next_dealer = 1
  session.state.score = score
  session.state.current_hand.state.score = score
  session.state.current_hand.state.next_player = 1
  session.state.current_hand.state.pending_decision = pendingDecision
  session.publicView.score = score
  session.publicView.next_dealer = 1
  session.publicView.current_player = 1
  session.publicView.hand.score = score
  session.publicView.hand.next_player = 1
  session.publicView.hand.pending_decision = pendingDecision
  session.playerView.score = score
  session.playerView.next_dealer = 1
  session.playerView.current_player = 1
  session.playerView.hand.public_state.score = score
  session.playerView.hand.public_state.next_player = 1
  session.playerView.hand.public_state.pending_decision = pendingDecision
  session.legalActions = []

  return session
}

function buildBotElevenFoldedSession() {
  const session = buildBotElevenPendingSession()
  const score = { '0': 5, '1': 11 } as const

  session.state.next_dealer = 1
  session.state.score = score
  session.state.current_hand.hand_winner = 0
  session.state.current_hand.state.score = score
  session.state.current_hand.state.next_player = null
  session.state.current_hand.state.pending_decision = null
  session.publicView.score = score
  session.publicView.next_dealer = 1
  session.publicView.current_player = null
  session.publicView.hand_in_progress = false
  session.publicView.hand.score = score
  session.publicView.hand.next_player = null
  session.publicView.hand.hand_winner = 0
  session.publicView.hand.pending_decision = null
  session.playerView.score = score
  session.playerView.next_dealer = 1
  session.playerView.current_player = null
  session.playerView.hand_in_progress = false
  session.playerView.hand.public_state.score = score
  session.playerView.hand.public_state.next_player = null
  session.playerView.hand.public_state.hand_winner = 0
  session.playerView.hand.public_state.pending_decision = null
  session.legalActions = []

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

async function installOpeningVillainActionProbe(page: Page) {
  await page.evaluate(() => {
    const timings = {
      dealDoneAt: null as number | null,
      opponentOverlayAt: null as number | null,
      stakeFxAt: null as number | null,
      heroActionableBeforeVillainAction: false,
    }
    let sawDealing = false

    const record = () => {
      const statusText = document.querySelector('.table-status')?.textContent ?? ''
      if (/Dealing/i.test(statusText)) {
        sawDealing = true
      } else if (sawDealing && timings.dealDoneAt == null) {
        timings.dealDoneAt = performance.now()
      }

      if (timings.opponentOverlayAt == null && document.querySelector('[data-testid="opponent-play-overlay"]')) {
        timings.opponentOverlayAt = performance.now()
      }

      if (timings.stakeFxAt == null && document.querySelector('[data-testid="live-stake-fx-callout"]')) {
        timings.stakeFxAt = performance.now()
      }

      if (
        timings.dealDoneAt != null &&
        timings.opponentOverlayAt == null &&
        timings.stakeFxAt == null &&
        document.querySelector('.hand.player-hand .card.is-playable')
      ) {
        timings.heroActionableBeforeVillainAction = true
      }
    }

    const observer = new MutationObserver(record)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-stake-fx-action'],
    })
    const intervalId = window.setInterval(record, 16)
    record()

    ;(window as typeof window & {
      __liveOpeningVillainActionProbe?: {
        observer: MutationObserver
        intervalId: number
        timings: typeof timings
      }
    }).__liveOpeningVillainActionProbe = { observer, intervalId, timings }
  })
}

async function readOpeningVillainActionTimings(page: Page) {
  return page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveOpeningVillainActionProbe?: {
        observer: MutationObserver
        intervalId: number
        timings: {
          dealDoneAt: number | null
          opponentOverlayAt: number | null
          stakeFxAt: number | null
          heroActionableBeforeVillainAction: boolean
        }
      }
    }
    const probe = globalWindow.__liveOpeningVillainActionProbe
    if (!probe) return null

    probe.observer.disconnect()
    window.clearInterval(probe.intervalId)
    return probe.timings
  })
}

async function mockDeferredBotElevenMatch(page: Page) {
  const initialSession = buildBotElevenPendingSession()
  const foldedSession = buildBotElevenFoldedSession()
  let currentSession = cloneJson(initialSession)
  const botTurnsRequests: Array<{
    at: number
    dealDoneAt: number | null
    dealOverlayVisible: boolean
    statusText: string
  }> = []

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

  await page.route(`**/api/game/session/${initialSession.matchId}/bot-turns`, async (route) => {
    const observed = await page.evaluate(() => {
      const probe = (window as typeof window & {
        __liveOpeningVillainActionProbe?: {
          timings: {
            dealDoneAt: number | null
          }
        }
      }).__liveOpeningVillainActionProbe

      return {
        at: performance.now(),
        dealDoneAt: probe?.timings.dealDoneAt ?? null,
        dealOverlayVisible: Boolean(document.querySelector('[data-testid="deal-overlay-card"]')),
        statusText: document.querySelector('.table-status')?.textContent ?? '',
      }
    })

    botTurnsRequests.push(observed)
    currentSession = cloneJson(foldedSession)

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

  return { botTurnsRequests }
}

async function mockActionSequenceMatch(page: Page, options: {
  initialSession: ReturnType<typeof buildWaitingTurnSession>
  actionSession: ReturnType<typeof buildWaitingTurnSession>
}) {
  const { initialSession, actionSession } = options
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

test('villain opening lead waits after the deal finishes before playing a card', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
    }))
  })
  await mockStaticSession(page, buildOpeningVillainLeadSession())
  await page.goto('/')
  await ensureLauncherReady(page)
  await installOpeningVillainActionProbe(page)

  await page.getByRole('button', { name: 'Start Match' }).click()
  await dismissFirstRunDeckPickerIfVisible(page)

  await page.waitForFunction(() => {
    const timings = (window as typeof window & {
      __liveOpeningVillainActionProbe?: {
        timings: {
          dealDoneAt: number | null
          opponentOverlayAt: number | null
        }
      }
    }).__liveOpeningVillainActionProbe?.timings

    return Boolean(timings?.dealDoneAt != null && timings.opponentOverlayAt != null)
  })

  const timings = await readOpeningVillainActionTimings(page)
  expect(timings?.dealDoneAt).not.toBeNull()
  expect(timings?.opponentOverlayAt).not.toBeNull()
  expect(timings?.heroActionableBeforeVillainAction).toBe(false)
  expect((timings?.opponentOverlayAt ?? 0) - (timings?.dealDoneAt ?? 0)).toBeGreaterThanOrEqual(450)
})

test('villain opening raise waits after the deal finishes before showing stake fx', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
    }))
  })
  await mockStaticSession(page, buildOpeningVillainRaiseSession())
  await page.goto('/')
  await ensureLauncherReady(page)
  await installOpeningVillainActionProbe(page)

  await page.getByRole('button', { name: 'Start Match' }).click()
  await dismissFirstRunDeckPickerIfVisible(page)

  await page.waitForFunction(() => {
    const timings = (window as typeof window & {
      __liveOpeningVillainActionProbe?: {
        timings: {
          dealDoneAt: number | null
          stakeFxAt: number | null
        }
      }
    }).__liveOpeningVillainActionProbe?.timings

    return Boolean(timings?.dealDoneAt != null && timings.stakeFxAt != null)
  })

  await expect(page.getByTestId('live-stake-fx-callout')).toContainText('They raise to +3')
  const timings = await readOpeningVillainActionTimings(page)
  expect(timings?.dealDoneAt).not.toBeNull()
  expect(timings?.stakeFxAt).not.toBeNull()
  expect(timings?.heroActionableBeforeVillainAction).toBe(false)
  expect((timings?.stakeFxAt ?? 0) - (timings?.dealDoneAt ?? 0)).toBeGreaterThanOrEqual(450)
})

test('bot eleven-hand decision resumes after the deal and a short read beat', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
    }))
  })
  const { botTurnsRequests } = await mockDeferredBotElevenMatch(page)
  await page.goto('/')
  await ensureLauncherReady(page)
  await installOpeningVillainActionProbe(page)

  await page.getByRole('button', { name: 'Start Match' }).click()
  await dismissFirstRunDeckPickerIfVisible(page)

  await expect(page.getByTestId('deal-overlay-card')).toBeVisible()
  await expect.poll(() => botTurnsRequests.length, { timeout: 6_000 }).toBe(1)

  const [request] = botTurnsRequests
  expect(request.dealDoneAt).not.toBeNull()
  expect(request.dealOverlayVisible).toBe(false)
  expect(request.statusText).not.toMatch(/Dealing/i)
  expect(request.at - (request.dealDoneAt ?? 0)).toBeGreaterThanOrEqual(
    BOT_ELEVEN_DECISION_OBSERVED_MIN_DELAY_MS,
  )
  await readOpeningVillainActionTimings(page)
})

test('villain response overlay starts only after the hero card settles on the table', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
    }))
  })
  await mockActionSequenceMatch(page, {
    initialSession: buildHeroLeadReadySession(),
    actionSession: buildHeroLeadVillainResponseSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await dismissFirstRunDeckPickerIfVisible(page)

  await expect(page.locator('.table-status')).toContainText('Your turn')

  await page.evaluate(() => {
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

    ;(window as typeof window & {
      __liveSequencingObserver?: MutationObserver
      __liveSequencingTimings?: typeof timings
    }).__liveSequencingObserver = observer
    ;(window as typeof window & {
      __liveSequencingObserver?: MutationObserver
      __liveSequencingTimings?: typeof timings
    }).__liveSequencingTimings = timings
  })

  await page.locator('.hand.player-hand .card').first().click()

  await expect(page.locator('.current-player-card .card:not(.placeholder)')).toHaveCount(1)
  await expect.poll(async () => (
    page.locator('.current-opponent-card .card:not(.placeholder)').count()
  )).toBe(1)

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

test('villain final card animates after hero accepts a third-round raise', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-live-game-preferences-v1', JSON.stringify({
      deckPickerCompleted: true,
    }))
  })
  await mockActionSequenceMatch(page, {
    initialSession: buildThirdRoundHeroAcceptPendingSession(),
    actionSession: buildThirdRoundAcceptedVillainFinalCardSession(),
  })
  await page.goto('/')
  await ensureLauncherReady(page)
  await page.getByRole('button', { name: 'Start Match' }).click()
  await dismissFirstRunDeckPickerIfVisible(page)

  await expect(page.getByRole('button', { name: /^Accept\b/ })).toBeVisible()
  await expect(page.locator('.current-player-card .card:not(.placeholder)')).toHaveCount(1)
  await expect(page.locator('.current-opponent-card .card:not(.placeholder)')).toHaveCount(0)
  await expect(page.locator('.hand.opponent-hand .card')).toHaveCount(1)

  await page.evaluate(() => {
    const timings = {
      opponentOverlayAt: null as number | null,
      opponentTableVisibleAt: null as number | null,
    }

    const record = () => {
      if (timings.opponentOverlayAt == null && document.querySelector('[data-testid="opponent-play-overlay"]')) {
        timings.opponentOverlayAt = performance.now()
      }
      if (
        timings.opponentTableVisibleAt == null &&
        document.querySelector('.current-opponent-card .card:not(.placeholder)')
      ) {
        timings.opponentTableVisibleAt = performance.now()
      }
    }

    const observer = new MutationObserver(record)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    })
    const intervalId = window.setInterval(record, 16)
    record()

    ;(window as typeof window & {
      __liveAcceptRevealProbe?: {
        observer: MutationObserver
        intervalId: number
        timings: typeof timings
      }
    }).__liveAcceptRevealProbe = { observer, intervalId, timings }
  })

  await page.getByRole('button', { name: /^Accept\b/ }).click()

  await expect.poll(async () => (
    page.locator('.current-opponent-card .card:not(.placeholder)').count()
  )).toBe(1)

  const timings = await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __liveAcceptRevealProbe?: {
        observer: MutationObserver
        intervalId: number
        timings: {
          opponentOverlayAt: number | null
          opponentTableVisibleAt: number | null
        }
      }
    }
    const probe = globalWindow.__liveAcceptRevealProbe
    probe?.observer.disconnect()
    if (probe) window.clearInterval(probe.intervalId)
    return probe?.timings ?? null
  })

  expect(timings?.opponentOverlayAt).not.toBeNull()
  expect(timings?.opponentTableVisibleAt).not.toBeNull()
  expect((timings?.opponentTableVisibleAt ?? 0) - (timings?.opponentOverlayAt ?? 0)).toBeGreaterThanOrEqual(0)
})
