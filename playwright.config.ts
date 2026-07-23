import { defineConfig } from '@playwright/test'
import path from 'node:path'

const configDir = path.dirname(new URL(import.meta.url).pathname)

function positiveInteger(value: string | undefined) {
  if (!value) return undefined

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const workers = positiveInteger(process.env.PLAYWRIGHT_WORKERS) ?? 2

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/__tmp_*.spec.ts'],
  timeout: 60_000,
  workers,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'python3 scripts/run_test_server.py',
      cwd: configDir,
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec next build && pnpm exec next start --port 3002',
      cwd: configDir,
      url: 'http://127.0.0.1:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
