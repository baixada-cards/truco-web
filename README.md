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
- `TRUCO_ENGINE_SERVICE_AUDIENCE` optionally enables Google-signed
  service-to-service authentication for an IAM-protected Cloud Run server.
  It must be the server's canonical `run.app` URL and remains unset locally.
- `TRUCO_ANON_COOKIE_SECRET` signs anonymous live-session cookies. Production
  requires a secret of at least 32 characters; generate one with a secure
  random source and store it in the deployment's secret manager. The
  compatibility alias `TRUCO_LIVE_COOKIE_SECRET` remains supported.
- `TRUCO_SITE_URL` is the public origin used to build absolute URLs in
  `sitemap.xml` and `robots.txt`. It defaults to `https://truco.baixada.cards`
  and nothing else in the app reads it.
- `STUDY_LAB_MODE=off|stealth|public` controls the study route at request time.
  Only `off` changes behavior: it makes the routes 404. `stealth` and `public`
  are the same request-time path, and both are reachable by anyone with a URL.
- `STUDY_MANIFEST_URL` pins an immutable public study-data release.
- `NEXT_PUBLIC_STUDY_LAB_LINKS=true` exposes study links in a production build.

Production study data is public derived output in object storage. The study
lab is a public surface: production links to it and search engines may index
it. The one exception is `guide/print`, which stays `noindex` because it
duplicates the routed chapters. `sitemap.xml` lists every locale of the home
page, the lab and the guide chapters, cross-linked by hreflang, and omits
`guide/print` for the same reason. Both it and `robots.txt` render per request
because they depend on `STUDY_LAB_MODE`, which the image build never sees.

Provider keys are server-side configuration. A player-supplied key is held in
memory for the match and transits the BFF to the server; it is not persisted.
Dev-only mutation and private-view routes are always disabled in production.

## Container

The production image is built by the stack integration repository after it
materializes licensed runtime audio. It uses Next.js standalone output, runs
as the unprivileged `node` user, listens on Cloud Run's port `8080`, and
contains no build toolchain or dependency cache.

Client-visible study and developer flags are build-time inputs. Production
passes `NEXT_PUBLIC_STUDY_MANIFEST_URL`, `NEXT_PUBLIC_STUDY_LAB_LINKS=false`,
and `NEXT_PUBLIC_SHOW_DEV_CONTROLS=false` as Docker build arguments.

## The field guide

The Study field guide lives at `/[locale]/lab/study/guide`. Its prose is in
`messages/<locale>.json` under `Study.guide`; its structure and figures are in
`src/guide/chapters/`. Chapters are grouped into Part I (reading the solve),
Part II (the player's handbook), and lettered appendices (the solver's own
documentation and the glossary) by `src/guide/chapters.ts`.

**Published locales.** While the English text is being rewritten the guide
is English-only: `src/guide/guide-locales.ts` lists the locales that carry
it, and every other locale's guide route redirects to the English edition,
the lab's guide links point there, and the sitemap lists only those locales.
Add a locale to that list once its translation lands.

**Books.** `/[locale]/lab/study/guide/print` renders the whole guide on one
page, and that route is what the PDF and EPUB are built from—same catalog,
same chapter components, so the books cannot drift from the site:

```bash
pnpm book --locale en
```

(The builder refuses a locale the guide is not published in.)

Output goes to `public/downloads/` (git-ignored—build the binaries, never
commit them). The guide's landing page links whatever formats it finds there
for the current locale, so a deploy without the files simply shows no
downloads. The dev server must be running; point elsewhere with `--base`.

The PDF is paginated by [Paged.js](https://pagedjs.org) (a development
dependency the build injects into the page—the app never ships it), which is
what gives the book its real page furniture: 176 × 250 mm pages, running
heads that name the current chapter, folios, chapters opening on a recto, and
a contents that resolves `target-counter()` into actual page numbers. Those
`@page` rules live in `scripts/build_guide_book.mjs`, not in
`guide.module.css`, because Turbopack's CSS parser rejects named pages and
margin boxes; they select through the book's `data-*` hooks. The EPUB is
packed from the same DOM, with the cover captured as its cover image.

**Copy editor (development only).** Double-click any paragraph, heading, or
list item in the guide to edit its raw catalog string in place, with Vim
bindings—`fd` or Escape leaves insert mode, `:w` writes it back into
`messages/<locale>.json`, `C-c C-c` writes and closes, and `:q` closes.

A **blank line inside a string splits it into two paragraphs** (single
newlines are just whitespace, as in HTML), so prose can be re-cut without
touching a component. The inline tags the guide renders are `<b>`, `<i>`,
`<em>` and `<code>`; the **card notation** `<card>K</card>` for one card and
`<hand>5♣ Q 7</hand>` for a holding, which splits its text on whitespace into
one token per card and works over an ICU placeholder too
(`<hand>{strongestWorstHand}</hand>`) — a card whose text is a bare suit
(`<card>♣</card>`) or an m and a suit (`<card>m♣</card>`) is the **manilha of
that suit**, drawn with the suit large and a small m in the corner, and reads
as `m♣` either way; the **figures** `<pts>3</pts>` for
points and stakes and `<score>11 × 11</score>` for a match score, which sets
its two halves around a multiplication sign however the catalog writes them
(`11x11`, `11 x 11`, `11 × 11`) and never breaks across a line, while lab
notation inside `<code>` (`11x11 v4`) is left exactly as written; and one **cross-reference tag per
chapter**, named after that chapter's id, as in `<ranges>the ranges
chapter</ranges>`, `<numbers>Appendix B</numbers>`, or `<leads>the opening
leads chapter</leads>`. A cross-reference links to
`/<locale>/lab/study/guide/<id>` and reads as ordinary prose under a hairline
rule; in the printed book it prints as plain text. The names live in
`src/guide/rich-tags.ts`, with the chapter ones derived from
`GUIDE_CHAPTERS`, so a new chapter gets its tag for free; see
`src/guide/rich.tsx` for what each one renders. The editor refuses to write
anything else, because an unknown tag makes next-intl throw at render and
blanks the whole paragraph. A string that gains a tag has to be rendered with
`t.rich(key, rich)` rather than `t(key)`.

The editor is disabled in production twice over: the write API sits behind
the same switch as the other dev routes
(`TRUCO_ENABLE_DEV_ROUTES=false` turns it off in development too), and
production builds alias the editor module to a no-op stub.

**Review comments (development only).** For reading rather than rewriting,
the same pages take Google-Docs-style margin comments. Select text inside a
paragraph and a small `Comment` button appears by the selection; `Alt+C` does
the same from the keyboard, and with nothing selected it comments on the
paragraph the caret last landed in. `Alt+click` comments on a whole element,
with no quote. The box is the copy editor's textarea with the same Vim
keymap, opened in insert mode: `:w` saves, `C-c C-c` saves and closes, `:q`
closes. Every commented element gets a numbered marker in the right margin;
clicking it opens the thread, where a comment can be resolved, edited, or
deleted. A pill at the bottom right counts the open comments on the page and
reveals the resolved ones.

Comments are stored in `src/guide/review/comments.json`, a sorted JSON array
of `{id, locale, key, quote, body, createdAt, resolved}` records, so that a
coding agent can read the file afterwards and act on them: `key` is the
dotted path under `Study.guide`, which is all it needs to find the string.
The store is read and written through `/api/dev/guide-comments`, gated like
the copy editor, and `src/guide/ReviewComments.tsx` is aliased to a no-op in
production builds.

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
