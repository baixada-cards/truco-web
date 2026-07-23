import assert from 'node:assert/strict'
import test from 'node:test'

import {
  studyLabMode,
  studyLabRouteEnabled,
  studyManifestUrl,
} from './study-lab-config.ts'

test('Study Lab defaults public in development and off in production', () => {
  assert.equal(studyLabMode({ NODE_ENV: 'development' }), 'public')
  assert.equal(studyLabMode({ NODE_ENV: 'production' }), 'off')
})

test('stealth enables the route without declaring a public launch', () => {
  const env = { NODE_ENV: 'production', STUDY_LAB_MODE: 'stealth' }
  assert.equal(studyLabMode(env), 'stealth')
  assert.equal(studyLabRouteEnabled(env), true)
})

test('legacy route flag remains compatible', () => {
  assert.equal(studyLabMode({ NEXT_PUBLIC_ENABLE_LAB: 'true' }), 'public')
  assert.equal(studyLabMode({ NEXT_PUBLIC_ENABLE_LAB: 'false' }), 'off')
})

test('manifest URL is runtime-configurable', () => {
  assert.equal(studyManifestUrl({}), '/study/manifest.json')
  assert.equal(
    studyManifestUrl({ STUDY_MANIFEST_URL: 'https://storage.googleapis.com/example/release/manifest.json' }),
    'https://storage.googleapis.com/example/release/manifest.json',
  )
})
