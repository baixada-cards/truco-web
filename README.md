# Baixada Truco — web

The public Next.js product surface for [Baixada Truco](https://truco.baixada.cards):
live play, the solved-strategy study lab, the study guide, and the BFF that
connects the browser to `truco-server`.

## Repository boundary

| Repository | Responsibility |
|---|---|
| [`truco-spec`](https://github.com/baixada-cards/truco-spec) | Rules, schemas, and executable fixtures |
| [`truco-engine`](https://github.com/baixada-cards/truco-engine) | Authoritative gameplay semantics |
| [`truco-bots`](https://github.com/baixada-cards/truco-bots) | Runtime bot behavior and provider integrations |
| [`truco-server`](https://github.com/baixada-cards/truco-server) | HTTP API and hosted match lifecycle |
| **`truco-web`** | Product UI, BFF routes, browser state, and presentation |

This repository does not contain a second rules engine, CFR training code,
live infrastructure inventory, credentials, or commercially licensed media.
Escopa and future games have their own rooms and repositories.

## Development

Use Node 24 and pnpm 10. Public-registry installs go through
[Socket Firewall](https://docs.socket.dev/docs/socket-firewall-free):

```bash
sfw pnpm install --frozen-lockfile
pnpm dev
```

The app expects `truco-server` at `http://127.0.0.1:4000` by default. Copy
`.env.example` to `.env.local` for local overrides; never commit that file.
The committed `.env.development` contains localhost-only, non-secret defaults.

Run the complete non-browser check:

```bash
make check
```

Run the browser suite:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright materializes the exact `truco-server` revision in
`dependencies.lock.json`, starts it on port 4000, builds the web app, and
serves it on port 3002. Set `TRUCO_SERVER_CHECKOUT` to an existing checkout at
that exact revision to avoid a second clone.

## Runtime configuration

- `TRUCO_ENGINE_SERVICE_URL` points the BFF to `truco-server`.
- `TRUCO_ANON_COOKIE_SECRET` signs anonymous live-session cookies. The
  compatibility alias `TRUCO_LIVE_COOKIE_SECRET` remains supported.
- `STUDY_LAB_MODE=off|stealth|public` controls the study route at request time.
- `STUDY_MANIFEST_URL` pins an immutable public study-data release.
- `NEXT_PUBLIC_STUDY_LAB_LINKS=true` exposes study links in a production build.

Production study data is public derived output in object storage. Stealth mode
is routing, not authentication; study routes emit `noindex` metadata and
headers.

Provider keys are server-side configuration. A player-supplied key is held in
memory for the match and transits the BFF to the server; it is not persisted.
Dev-only mutation and private-view routes are always disabled in production.

## Licensed audio boundary

The five Pro Sound Effects derivatives used by the full production soundscape
are intentionally absent from Git and listed in `private-audio.lock.json` by
filename, byte length, and SHA-256. The public app builds and runs without
them; missing samples fall back to the remaining public/synthesized sound
layers.

Authorized environments materialize them just in time:

```bash
BAIXADA_PRIVATE_AUDIO_GCS_URI=gs://PRIVATE_BUCKET/PREFIX \
  pnpm audio:sync-private
```

The command uses the caller's existing `gcloud` identity, downloads each
object to a temporary file, verifies it against the public lock, and only then
moves it into `public/audio/farol/`. In GitHub Actions, authenticate to Google
Cloud with short-lived OIDC credentials first. Keep bucket names, project
IDs, service-account identities, deployment targets, and IAM policy in the
private `baixada-ops` repository. Do not upload a build artifact containing
these samples to a public release or Actions artifact.

Public audio provenance and licenses are recorded in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

## Product notes

- `/` is the real playable page, not the legacy prototype in `src/App.tsx`.
- `/lab/study` is the solved-spot browser and study surface.
- `NEXT_PUBLIC_SHOW_DEV_CONTROLS=true` enables the routed dev panel outside
  production; production builds alias it to no-op modules.
- Match URLs are locators, not credentials. Ownership is bound to an anonymous
  `HttpOnly` cookie.

Baixada's shared visual system is maintained separately from this product
implementation. `dependencies.lock.json` and `package.json` pin the exact
reviewed [`design-system`](https://github.com/baixada-cards/design-system)
commit that supplies the canonical production tokens. Do not copy shared
tokens or marks back into this repository.
