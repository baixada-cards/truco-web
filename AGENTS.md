# Agent Instructions

## Repository purpose

This repository owns Baixada Truco's Next.js product surface: live play, the
study lab and guide, browser interaction state, BFF routes, localization,
brand presentation, and browser tests.

## Boundaries

- `baixada-cards/truco-spec` owns rules, schemas, and executable fixtures.
- `baixada-cards/truco-engine` owns gameplay semantics.
- `baixada-cards/truco-bots` owns bot behavior and provider integrations.
- `baixada-cards/truco-server` owns the HTTP API and hosted-session lifecycle.
- CFR training, solver experiments, live infrastructure inventory,
  credentials, private policies, commercial media, and other games do not
  belong here.
- Do not add a second gameplay engine to the web repository.

## Workflow

- Use `sfw` for public-registry dependency fetches.
- Preserve the seven-day pnpm release-age gate and frozen lockfile installs.
- Run `make check` before wrapping up a change.
- Run Playwright and inspect screenshots for user-visible changes.
- Never start agent-owned servers on port 3000. Playwright owns 3002 and 4000.
- Shut down any server process you start.
- Sign commits.

## Security and operations

- Never commit `.env` files, provider keys, cookie secrets, cloud identifiers,
  deployment inventories, or commercially licensed media.
- `private-audio.lock.json` is a checksum contract, not permission to publish
  the listed media. Materialize it only from authorized private storage.
- Keep dev-only routes and controls disabled in production.
- Document changes to session ownership, expiry, quotas, provider-key handling,
  study-data publication, or licensed-asset delivery.
