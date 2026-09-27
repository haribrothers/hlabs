# Built-in store

One folder per app in `apps/<appId>/`: `hlabs-app.yml` (docs/prd/06-app-manifest.md), `docker-compose.yml`, `logo.svg` and optional `screenshots/` and `README.md`.

- `pnpm store:lint` validates every app (manifest schema, compose rules, images pinned by tag and digest).
- `pnpm store:build` writes `index.json`.

Logos are the apps' own, from their upstream repositories; they belong to their projects.
