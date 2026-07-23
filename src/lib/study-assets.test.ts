import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveStudyAssetUrl, resolveStudyManifestUrl } from './study-assets.ts'

test('resolves the legacy same-origin manifest', () => {
  const origin = 'https://truco.baixada.cards/en'
  assert.equal(
    resolveStudyManifestUrl('/study/manifest.json', origin),
    'https://truco.baixada.cards/study/manifest.json',
  )
  assert.equal(
    resolveStudyAssetUrl('11x10.json.gz', '/study/manifest.json', origin),
    'https://truco.baixada.cards/study/11x10.json.gz',
  )
})

test('resolves immutable release assets beside a remote GCS manifest', () => {
  const manifest = 'https://storage.googleapis.com/truco-study-artifacts/releases/r1/manifest.json'
  assert.equal(
    resolveStudyAssetUrl('11x10.json.gz', manifest, 'https://truco.baixada.cards'),
    'https://storage.googleapis.com/truco-study-artifacts/releases/r1/11x10.json.gz',
  )
})

test('preserves an absolute artifact URL', () => {
  assert.equal(
    resolveStudyAssetUrl(
      'https://cdn.example.test/data/chart.json',
      'https://storage.googleapis.com/example/manifest.json',
      'https://truco.baixada.cards',
    ),
    'https://cdn.example.test/data/chart.json',
  )
})
