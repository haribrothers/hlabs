# Built-in store

One folder per app in `apps/<appId>/`: `hlabs-app.yml` (docs/prd/06-app-manifest.md), `docker-compose.yml`, `logo.svg` and optional `screenshots/` and `README.md`.

- `pnpm store:lint` validates every app (manifest schema, compose rules, images pinned by tag and digest).
- `pnpm store:build` writes `index.json`.

Logos are the apps' own, from their upstream repositories; they belong to their projects.

Screenshots (`screenshots/1.webp`, …, at most 5, 16:10, 1440×900) are taken by hlabs from each app running its pinned image with sample data: an example account, example logins and monitors, and photos from picsum.photos (Unsplash licence). They show nothing personal. Retake them when an app's look changes noticeably.
