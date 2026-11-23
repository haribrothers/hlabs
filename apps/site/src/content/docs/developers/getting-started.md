---
title: Getting started
description: What to install, and running hlabs from its source code.
---

## What you need

- **macOS** (Apple silicon or Intel) or **Linux**. The menu-bar app runs on macOS for now; Linux gets it later.
- **Node.js 22.23.4 or newer** (the website's Astro needs it; `nvm install 22` gets the newest 22, and the repository's `.nvmrc` makes `nvm use` pick it) and **pnpm 9** (`corepack enable` gives you the version `package.json` names).
- **A container engine**: OrbStack, Docker Desktop or Colima on a Mac; Docker Engine on Linux. hlabs runs apps in it.
- For the menu-bar app: **Rust** 1.80 or later (`rustup`) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (on a Mac, the Xcode Command Line Tools).

## First time

```sh
git clone <your fork>
cd hlabs
pnpm install
pnpm fetch-binaries   # Caddy, docker compose and restic into .bin/, checked against pinned checksums
```

## Run it

| Command | What runs |
| --- | --- |
| `pnpm dev` | hlabsd on `127.0.0.1:7474` and the dashboard on `http://127.0.0.1:5173`. No web proxy, no `.local` names. Enough for most work. |
| `pnpm dev:full` | The same, plus Caddy on ports 443 and 80 and the `.local` names, so the dashboard is at `https://hlabs.local` as it is for people using hlabs. |
| `pnpm dev:full:built` | Like `pnpm dev:full`, but the dashboard is built first and served by hlabs itself, as in a release, instead of by Vite: no hot reload. Use it to try what only exists in builds, such as installing hlabs as an app from Chrome (its web manifest and service worker). Rebuild by running it again. |
| `pnpm dev:tray` | The menu-bar app, talking to whichever hlabs runs on 7474. See [the menu-bar app](/developers/menu-bar-app/). |
| `pnpm dev:site` | This website, on http://localhost:4321. In development the dashboard's help links open it there (set `HLABS_HELP_URL` for another address), since the public site isn't published yet. |

Development keeps its data in `.dev-data/` at the root of the repository; delete that folder to start again from setup. In development every request counts as an admin's (`HLABS_DEV_ANONYMOUS_ADMIN`), so you don't need to log in to try things.

**Only one hlabs can run on a computer at a time.** An installed hlabs (from the app in Applications) uses the same ports as `pnpm dev`: stop it first (`launchctl bootout gui/$(id -u)/dev.hlabs.daemon`); see [Troubleshooting](/developers/troubleshooting/).

### Tailscale in development

`pnpm dev` uses a pretend Tailscale, so it never changes the Tailscale on your computer. To try remote access for real:

```sh
HLABS_DEV_FAKE_TAILSCALE=0 pnpm dev:full
```

It then adds Tailscale Serve entries to your real Tailscale. Remove them when you're done (`tailscale serve reset`), or they'll get in the way of an installed hlabs later.

### Network drives in development

Files' **+ Connect a drive** uses the drives on your real network. To try it without a NAS, start with a pretend one:

```sh
HLABS_DEV_FAKE_NAS=1 pnpm dev
```

It shows as **NAS** at `nas.local` with the SMB shares Media, Photos and Backups; its password is `nas-password`. The e2e tests always use it.

## Check your work

```sh
pnpm lint        # ESLint and the package boundaries
pnpm typecheck
pnpm test        # every package's unit tests (Vitest)
pnpm test:e2e    # the dashboard in a real browser (Playwright, with axe)
```

Each unit test run keeps what its tests write (a daemon's data per test, fake stores and drives) in one `hlabs-test-…` folder in the system temp folder, and removes it when the run ends. That's `/tmp` under `pnpm test`, because Turborepo doesn't pass `TMPDIR` on. A run that's stopped part-way leaves its folder behind; a later run removes it once it's a day old, along with the module copies Vitest leaves there.

The end-to-end tests run their own hlabs on other ports (7574 for hlabs, 5273 for the dashboard) with their own data, so they never touch your development hlabs. The installable dashboard's tests (the `pwa` project) also build the dashboard into `apps/web/dist-pwa` and serve it on 5373, because its web manifest and service worker only exist in builds. The first run needs the browsers: `pnpm --filter @hlabs/web exec playwright install chromium`. The first-run instances (daemons on 7480 and up, one per worker, each with its own `.e2e-data-first-run-<n>` folder and secrets file) are started again when hlabsd exits with code 75, as launchd and systemd do, so Restart hlabs and the factory reset are tested there and nowhere else.

For the menu-bar app's Rust code: `cd apps/tray/src-tauri && cargo test`.

## The website and help

`pnpm dev:site` serves the site with its help at `http://localhost:4321`. After changing help, run `pnpm site:build && pnpm site:check`. The check fails when a shipped P1 or P2 feature has no help page listing it in its `features` front matter, when a `helpUrl()` slug has no page, when a page doesn't start by saying who it's for, when a link inside the site is broken, when release notes use sections other than New, Improved, Fixed and Before you update, or when the app catalogue names the store's groups differently from the dashboard. The error pages (`/help/errors/<code>/`) use the dashboard's own words: after changing `apps/web/src/copy/errors.ts`, run `pnpm --filter @hlabs/web errors:export` and commit `apps/site/src/data/errors.json`, or the check fails.

`pnpm site:build` first reads the latest releases from GitHub (`scripts/site-releases.ts`, with `GITHUB_TOKEN` if it's set) into `apps/site/src/data/releases.json`, and copies the latest stable release's `install.sh`, `install.sh.sig` and `install.sh.sha256` into `apps/site/public/`. Those files aren't committed. After the Astro build it adds the Content-Security-Policy to the built `_headers`, with the hash of each inline script (`scripts/site-headers.ts`). How the site is published: [Publishing the website](../publishing-the-website/). Offline, the site builds with what it had, or says there's no release yet. To see the download page with releases before there are any, build with the test fixtures: `HLABS_SITE_RELEASES_FIXTURE=apps/site/e2e/fixtures/releases node scripts/site-releases.ts`, then `pnpm --filter @hlabs/site site:build` (run `node scripts/site-releases.ts` again afterwards to go back).

`pnpm site:e2e` builds the site from fixtures into `apps/site/dist-e2e` (releases and release notes from `apps/site/e2e/fixtures`, and a copy of `store/`) and runs the website's stories in Playwright on port 4521: axe in both themes, the Content-Security-Policy and other headers from `_headers` (the tests' server applies them as Cloudflare does), and Lighthouse accessibility on three pages. It never reaches the internet. The first run needs the browser: `pnpm --filter @hlabs/site exec playwright install chromium`.

