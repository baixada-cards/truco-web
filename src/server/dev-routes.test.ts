import assert from 'node:assert/strict'
import test from 'node:test'

import { areDevRoutesEnabled } from './dev-routes.ts'

test('dev routes default on outside production', () => {
  assert.equal(areDevRoutesEnabled({ NODE_ENV: 'development' }), true)
})

test('dev routes are always disabled in production', () => {
  assert.equal(areDevRoutesEnabled({ NODE_ENV: 'production' }), false)
  assert.equal(
    areDevRoutesEnabled({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SHOW_DEV_CONTROLS: 'true',
      TRUCO_ENABLE_DEV_ROUTES: 'true',
    }),
    false,
  )
})

test('dev routes can be disabled outside production', () => {
  assert.equal(
    areDevRoutesEnabled({
      NODE_ENV: 'development',
      TRUCO_ENABLE_DEV_ROUTES: 'false',
      NEXT_PUBLIC_SHOW_DEV_CONTROLS: 'true',
    }),
    false,
  )
  assert.equal(
    areDevRoutesEnabled({
      NODE_ENV: 'development',
      NEXT_PUBLIC_SHOW_DEV_CONTROLS: 'false',
    }),
    false,
  )
})
