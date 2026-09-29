# Built-in store

One folder per app in `apps/<appId>/`: `hlabs-app.yml` (docs/prd/06-app-manifest.md), `docker-compose.yml`, `logo.svg` and optional `screenshots/` and `README.md`.

- `pnpm store:lint` validates every app (manifest schema, compose rules, images pinned by tag and digest).
- `pnpm store:build` writes `index.json`.

Logos are the apps' own, from their upstream repositories; they belong to their projects. A logo that isn't square or runs to its edges is kept unchanged inside a square `logo.svg` with room around it (the upstream file embedded as an image), so it sits well on the app tile's gradient.

Some apps need a starting configuration to work behind hlabs: Home Assistant is told to trust the proxy, and AdGuard Home skips its setup wizard (which would move its web page to another port). Their compose files write that file on the first start and leave an existing one alone.

Screenshots (`screenshots/1.webp`, 2, 3: three per app, so the details page's row is full; at most 5, 16:10, 1440×900) are taken by hlabs from each app running its pinned image with sample data: an example account called Alex, example logins, monitors, recipes, files and documents with invented companies, photos from picsum.photos (Unsplash licence), Blender open films and public-domain classics, and audiobook covers drawn for the purpose. They show nothing personal. Retake them when an app's look changes noticeably.
