---
title: Developers
description: Build, run and change hlabs from its source code.
---

These pages are for people working on hlabs itself: running it from source, building the Mac app, signing your own updates and finding your way around when something doesn't work. If you use hlabs, the [Help](/help/) is what you're after.

hlabs is a pnpm and Turborepo monorepo:

| Folder | What it is |
| --- | --- |
| `apps/daemon` | hlabsd, the background service (Node, Fastify and tRPC, SQLite) |
| `apps/web` | the dashboard (React, Vite) |
| `apps/tray` | the menu-bar app (Tauri 2: Rust and React) |
| `apps/cli` | the `hlabs` command |
| `apps/site` | this website and the help |
| `packages/*` | the API contract, database, app manifest, UI kit, icons and shared code |
| `store/` | the built-in App Store's apps |
| `scripts/` | fetching binaries, building the app, installing |
| `docs/` | the product spec: stories, API, data model and decisions |

The product spec in `docs/` is the source of truth for what hlabs does; these pages are about how to work on it.

- [Getting started](/developers/getting-started/): what to install, and running hlabs from source.
- [The menu-bar app](/developers/menu-bar-app/): running and changing it.
- [Building the app](/developers/building/): a Mac app with hlabs inside, and where an installed hlabs keeps things.
- [Updates and signing](/developers/updates-and-signing/): your own signing key, and testing an update end to end.
- [Troubleshooting](/developers/troubleshooting/): the problems you're most likely to meet, and their fixes.
