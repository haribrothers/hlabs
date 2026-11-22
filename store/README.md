# Built-in store

One folder per app in `apps/<appId>/`: `hlabs-app.yml` (docs/prd/06-app-manifest.md), `docker-compose.yml`, `logo.svg` and optional `screenshots/` and `README.md`.

- `pnpm store:lint` validates every app (manifest schema, compose rules, images pinned by tag and digest).
- `pnpm store:build` writes `index.json`.
- `pnpm store:updates` lists apps with a newer release (`--write` edits them); `store-updates.yml` opens a pull request for each every day. Apps under `hold` in `curation.yml` are left alone.
- `pnpm store:port <id> --from runtipi:<id> | casaos:<Name> | <compose URL>` drafts a new app; resolve its `TODO`s, then `pnpm store:lint` and `pnpm store:matrix <id>`. Apps drafted from Runtipi or CasaOS keep a `NOTICE` and a row in `ATTRIBUTION.md`.

Logos are the apps' own, from their upstream repositories; they belong to their projects. A logo that isn't square or runs to its edges is kept unchanged inside a square `logo.svg` with room around it (the upstream file embedded as an image), so it sits well on the app tile's gradient.

Some apps need a starting configuration to work behind hlabs: Home Assistant is told to trust the proxy, and AdGuard Home skips its setup wizard (which would move its web page to another port). Their compose files write that file on the first start and leave an existing one alone.

Screenshots (`screenshots/1.webp`, 2, 3: three per app, so the details page's row is full; at most 5, 16:10, 1440×900) are taken by hlabs from each app running its pinned image with sample data: an example account called Alex, example logins, monitors, recipes, files and documents with invented companies, photos from picsum.photos (Unsplash licence), Blender open films and public-domain classics, and audiobook covers drawn for the purpose. They show nothing personal. Retake them when an app's look changes noticeably.

Testing: `node scripts/store-matrix.ts <id>` installs, opens, restarts and uninstalls an app with the real engine. CI (`store.yml`) installs the apps a pull request changes plus the smoke set, and every app nightly (US-STORE-26); see the developer guide "The built-in store".
