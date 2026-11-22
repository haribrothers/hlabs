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

## Port an app

```sh
pnpm store:port <id> --from runtipi:<id>                 # from Runtipi's app store (GPL-3.0)
pnpm store:port <id> --from casaos:<Name>                # from CasaOS's app store (Apache-2.0), e.g. casaos:Jellyfin
pnpm store:port <id> --from https://…/docker-compose.yml # from the project's own compose file
                     [--web <service>:<port>]           # its web page, when the compose file has several ports
```

It drafts `store/apps/<id>/`: the manifest, a compose file under the store's rules with every image pinned by tag and digest, the logo when the source has an SVG or PNG, and for Runtipi or CasaOS a `NOTICE` and a row in `store/ATTRIBUTION.md`. What it can't decide (the description, whether the app has its own login, which folders are the person's, what extra ports are for) is left as a value starting `TODO`, and it lists them. `pnpm store:lint` fails until every one is resolved. It never reads Umbrel's catalogue, which has no licence. Set `GITHUB_TOKEN` if GitHub's limit for anonymous requests runs out.

## Keep apps up to date

```sh
pnpm store:updates                 # which apps have a newer release
pnpm store:updates --apps immich   # just these
pnpm store:updates --write         # edit the files here
```

An app's images follow its version when their tag is the version (with or without a `v`, and with a suffix like `-apache`); databases and caches in the same app are left as they are. It offers the newest tag of the same shape that isn't a pre-release and still runs on every platform the app lists, sets `version` and `revision: 1`, and pins each image's new tag and digest. To keep an app where it is, list it under `hold` in `store/curation.yml` and say why.

`store-updates.yml` runs it every day with `--pr`: one pull request per app on `store-update/<id>`, labelled `store-update` (and `store-update-major` when it looks like a major version). Nothing is merged automatically. For its checks to run like any pull request's, add a repository secret `STORE_UPDATES_TOKEN`: a fine-grained token for this repository with Contents and Pull requests set to read and write. Without it the bot starts the store matrix for each branch itself, but the other checks wait until someone pushes to the branch.

## Install it for real

`pnpm store:matrix <id> [<id>…]` installs each app with its defaults, opens it through Caddy at `https://<id>.hlabs.local`, restarts it and uninstalls it with its data. It needs Docker and `pnpm fetch-binaries`. It starts its own daemon (data in `.matrix-data`, daemon port 7674, Caddy on 9443 and 9080, containers named `hlabs-matrix-…`), so it never touches a hlabs you're running. With no ids it does every app, which takes a long time.

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
