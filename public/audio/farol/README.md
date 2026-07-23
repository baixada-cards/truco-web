# Farol sound samples

This directory contains redistributable runtime samples used by the Farol
table sound themes. Source and license details live in the repository-root
`THIRD_PARTY_NOTICES.md`.

Five additional Pro Sound Effects derivatives are part of the production
soundscape but are not redistributable source assets. Their expected names and
checksums live in `private-audio.lock.json`; authorized deploys fetch them from
private object storage with `pnpm audio:sync-private`.

Never add those five files to Git, a public release, or a public CI artifact.
The exact paths are also denied by `.gitignore`.
