---
title: Getting started
description: What to install, and running hlabs from its source code.
---

## What you need

- **macOS** (Apple silicon or Intel) or **Linux**. The menu-bar app runs on macOS for now; Linux gets it later.
- **Node.js 22** (the repository's `.nvmrc` says which; `nvm use` picks it up) and **pnpm 9** (`corepack enable` gives you the version `package.json` names).
- **A container engine**: OrbStack, Docker Desktop or Colima on a Mac; Docker Engine on Linux. hlabs runs apps in it.
- For the menu-bar app: **Rust** 1.80 or later (`rustup`) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (on a Mac, the Xcode Command Line Tools).

## First time

```sh
git clone <your fork>
cd hlabs
pnpm install
pnpm fetch-binaries   # Caddy and docker compose into .bin/, checked against pinned checksums
```

## Run it

| Command | What runs |
| --- | --- |
| `pnpm dev` | hlabsd on `127.0.0.1:7474` and the dashboard on `http://127.0.0.1:5173`. No web proxy, no `.local` names. Enough for most work. |
| `pnpm dev:full` | The same, plus Caddy on ports 443 and 80 and the `.local` names, so the dashboard is at `https://hlabs.local` as it is for people using hlabs. |
| `pnpm dev:tray` | The menu-bar app, talking to whichever hlabs runs on 7474. See [the menu-bar app](/developers/menu-bar-app/). |
| `pnpm dev:site` | This website. |

Development keeps its data in `.dev-data/` at the root of the repository; delete that folder to start again from setup. In development every request counts as an admin's (`HLABS_DEV_ANONYMOUS_ADMIN`), so you don't need to log in to try things.

**Only one hlabs can run on a computer at a time.** An installed hlabs (from the app in Applications) uses the same ports as `pnpm dev`: stop it first (`launchctl bootout gui/$(id -u)/dev.hlabs.daemon`); see [Troubleshooting](/developers/troubleshooting/).

### Tailscale in development

`pnpm dev` uses a pretend Tailscale, so it never changes the Tailscale on your computer. To try remote access for real:

```sh
HLABS_DEV_FAKE_TAILSCALE=0 pnpm dev:full
```

It then adds Tailscale Serve entries to your real Tailscale. Remove them when you're done (`tailscale serve reset`), or they'll get in the way of an installed hlabs later.

## Check your work

```sh
pnpm lint        # ESLint and the package boundaries
pnpm typecheck
pnpm test        # every package's unit tests (Vitest)
pnpm test:e2e    # the dashboard in a real browser (Playwright, with axe)
```

The end-to-end tests run their own hlabs on other ports (7574 for hlabs, 5273 for the dashboard) with their own data, so they never touch your development hlabs. The first run needs the browsers: `pnpm --filter @hlabs/web exec playwright install chromium`.

For the menu-bar app's Rust code: `cd apps/tray/src-tauri && cargo test`.
