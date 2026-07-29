import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

type StudyGuideFixture = {
  docs: Record<string, unknown>
}

const guideFixture = JSON.parse(gunzipSync(readFileSync(new URL(
  '../../src/guide/fixtures/study-guide-data.json.gz',
  import.meta.url,
))).toString('utf8')) as StudyGuideFixture
const chartFixture = guideFixture.docs['11x11-tc0-d0.json']
const STUDY_LAB_TEST_URL = process.env.STUDY_LAB_BASE_URL ?? '/en/lab/study'

test('Study Lab route loads a deterministic solution fixture', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('truco-study-tour-v2', '1')
  })
  await page.route('**/study/manifest.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        format: 'study-manifest/v1',
        spots: [{
          score: [11, 11],
          tc: 0,
          dealer: 0,
          file: 'study-e2e-chart.json',
        }],
        queued: [],
      }),
    })
  })
  await page.route('**/study/study-e2e-chart.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(chartFixture),
    })
  })
  await page.goto(STUDY_LAB_TEST_URL)

  await expect(page.getByRole('heading', { name: 'Solution charts' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Spot selector' })).toBeVisible()
  const labBackground = await page.getByTestId('study-lab-page').evaluate((labPage) => {
    const style = window.getComputedStyle(labPage)
    return {
      image: style.backgroundImage,
      attachment: style.backgroundAttachment,
    }
  })
  expect(labBackground.image).not.toContain('rich-walnut.webp')
  expect(labBackground.image).toContain('linear-gradient')
  expect(labBackground.attachment.split(', ')).toEqual(Array(3).fill('scroll'))

  // The lab can resume the viewed position as a live match; with no draft the
  // engine deals unspecified cards, so the action is available immediately.
  await page.getByRole('button', { name: 'Help: tour & guide' }).click()
  const playHand = page.getByTestId('study-lab-play-hand-button')
  await expect(playHand).toBeVisible()
  await expect(playHand).toBeEnabled()
})

test('rules plate moves compact raise actions clear of the stake peg', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 900 })
  await page.goto('/en/lab/study/guide/rules')

  const openRaise = page.locator('button:visible').filter({ hasText: 'Raise 1 → 3' })
  await expect(openRaise).toHaveCount(1)
  await openRaise.click()

  const actions = page.locator('[role="menu"]:visible button')
  await expect(actions).toHaveCount(3)
  const peg = page.getByLabel('3 point(s) at stake')
  const pegBox = await peg.boundingBox()
  if (!pegBox) throw new Error('Missing compact raise-table stake peg.')

  const actionBoxes = await actions.evaluateAll((buttons) => buttons.map((button) => {
    const { bottom, left, right, top } = button.getBoundingClientRect()
    return { bottom, left, right, top }
  }))

  for (const actionBox of actionBoxes) {
    const overlapsPeg = actionBox.left < pegBox.x + pegBox.width &&
      actionBox.right > pegBox.x &&
      actionBox.top < pegBox.y + pegBox.height &&
      actionBox.bottom > pegBox.y
    expect(overlapsPeg).toBe(false)
  }

  const screenshotPath = testInfo.outputPath('guide-compact-raise-actions.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach('guide-compact-raise-actions', {
    path: screenshotPath,
    contentType: 'image/png',
  })
})

test('rules plate preserves a manilha arc without crossing into the rank rail', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/en/lab/study/guide/rules')

  const plate = page.getByRole('group', { name: 'Choose the turn-up rank' })
  await plate.scrollIntoViewIfNeeded()
  const cards = plate.locator('button')
  await expect(cards).toHaveCount(12)

  async function expectIsolatedArc() {
    const boxes = await cards.evaluateAll((buttons) => {
      const cardBox = (button: Element) => {
        const { bottom, left, right, top } = button.getBoundingClientRect()
        return { bottom, left, right, top }
      }
      return {
        rail: buttons.slice(0, -4).map(cardBox),
        fan: buttons.slice(-4).map(cardBox),
      }
    })

    for (const fanCard of boxes.fan) {
      for (const railCard of boxes.rail) {
        const crossesRail = fanCard.left < railCard.right && fanCard.right > railCard.left &&
          fanCard.top < railCard.bottom && fanCard.bottom > railCard.top
        expect(crossesRail).toBe(false)
      }
    }

    const fanHasIntentionalArcOverlap = boxes.fan.some((card, index) => boxes.fan.slice(index + 1).some((next) => (
      card.left < next.right && card.right > next.left && card.top < next.bottom && card.bottom > next.top
    )))
    expect(fanHasIntentionalArcOverlap).toBe(true)
    return boxes
  }

  await plate.evaluate((element) => { element.style.width = '760px' })
  await page.waitForTimeout(100)
  const compactBoxes = await expectIsolatedArc()
  expect(Math.min(...compactBoxes.fan.map((card) => card.top))).toBeGreaterThan(
    Math.max(...compactBoxes.rail.map((card) => card.bottom)),
  )
  const compactOverflow = await plate.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  expect(compactOverflow.scrollHeight).toBeLessThanOrEqual(compactOverflow.clientHeight + 1)
  const compactScreenshotPath = testInfo.outputPath('guide-manilha-arc-compact.png')
  await plate.screenshot({ path: compactScreenshotPath })
  await testInfo.attach('guide-manilha-arc-compact', {
    path: compactScreenshotPath,
    contentType: 'image/png',
  })

  await plate.evaluate((element) => { element.style.width = '830px' })
  await page.waitForTimeout(100)
  const wideBoxes = await expectIsolatedArc()
  expect(Math.min(...wideBoxes.fan.map((card) => card.top))).toBeLessThan(
    Math.max(...wideBoxes.rail.map((card) => card.bottom)),
  )
  await plate.getByRole('button', { name: 'Make A the turn-up' }).click()
  await expect(plate.getByRole('button', { name: 'Make 2 the turn-up' })).toHaveCount(4)
  await page.waitForTimeout(120)
  const movingScreenshotPath = testInfo.outputPath('guide-manilha-arc-moving.png')
  await plate.screenshot({ path: movingScreenshotPath })
  await testInfo.attach('guide-manilha-arc-moving', {
    path: movingScreenshotPath,
    contentType: 'image/png',
  })
  await page.waitForTimeout(900)
  await expectIsolatedArc()

  const screenshotPath = testInfo.outputPath('guide-manilha-arc.png')
  await plate.screenshot({ path: screenshotPath })
  await testInfo.attach('guide-manilha-arc', {
    path: screenshotPath,
    contentType: 'image/png',
  })
})
