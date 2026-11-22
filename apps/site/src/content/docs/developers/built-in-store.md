---
title: The built-in store
description: How the App Store's built-in apps are checked and tested, locally and in CI.
---

The built-in App Store is the `store/` folder: one folder per app in `store/apps/<id>/` with its `hlabs-app.yml`, `docker-compose.yml`, logo and screenshots. `store/README.md` describes the files; the manifest format is in the spec (`docs/prd/06-app-manifest.md`).

## Check an app

```sh
pnpm store:lint          # every manifest and compose file follows the store's rules
pnpm store:build         # writes store/index.json
```

## Install it for real

`node scripts/store-matrix.ts <id> [<id>…]` installs each app with its defaults, opens it through Caddy at `https://<id>.hlabs.local`, restarts it and uninstalls it with its data. It needs Docker and `pnpm fetch-binaries`. It starts its own daemon (data in `.matrix-data`, daemon port 7674, Caddy on 9443 and 9080, containers named `hlabs-matrix-…`), so it never touches a hlabs you're running. With no ids it does every app, which takes a long time.

- `--results <file>` also writes each app's result as JSON.
- `--prune-images` removes every unused image on the machine after each app. It's for CI runners; don't use it on your own computer.

## In CI

`store.yml` runs the matrix with real Docker on Linux. Which apps it installs (`scripts/store-select.ts`):

| When | Apps |
| --- | --- |
| A pull request that changes `store/` | the apps it changes, plus the smoke set (Uptime Kuma and Vaultwarden) |
| A pull request that changes the install path (`packages/app-manifest`, the daemon's apps, Caddy or engine code, the store scripts or `store.yml`) | the smoke set and 10 apps that change every day |
| Every night | every app, five to a runner |
| By hand (Run workflow) | the ids you give, or every app |

Afterwards, the run's summary shows the install rate (the store's target is 98 % or more) and what failed. The nightly run also opens an issue labelled `store-matrix` for each app that fails, or adds a comment to the one already open for it. Close the issue when the app passes again.
