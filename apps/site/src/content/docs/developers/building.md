---
title: Building the app
description: Building the Mac app and the Linux server download, and where an installed hlabs keeps things.
---

## Build it

```sh
pnpm build:tray                  # this version (0.0.0)
pnpm build:tray --version 0.0.1  # a version of your choice
```

It builds the dashboard and hlabsd, puts them together with a Node.js runtime, Caddy and docker compose into the app, and builds the menu-bar app around them. The result is `apps/tray/src-tauri/target/release/bundle/macos/hlabs.app`; copy it to Applications and open it. The app isn't signed with an Apple certificate yet, so the first time macOS may ask you to confirm you want to open it.

## What it installs

On first launch the app sets up hlabs as a background service for your user:

| What | Where |
| --- | --- |
| The background service | `~/Library/LaunchAgents/dev.hlabs.daemon.plist` (label `dev.hlabs.daemon`), running `hlabs.app/Contents/Resources/daemon/hlabsd.mjs` |
| Its data | `~/Library/Application Support/hlabs` (the database `hlabs.db`, `caddy/`, `run/`) |
| Its logs | `~/Library/Application Support/hlabs/logs/hlabsd.1.log` (newest first) and `launchd.log` |
| The menu-bar app's token | the keychain, service `dev.hlabs`, account `tray-token` |

This is separate from development (`.dev-data/`): the installed hlabs has its own users, apps and settings.

## Stop it, start it, remove it

```sh
launchctl bootout gui/$(id -u)/dev.hlabs.daemon             # stop it (until you open the app again)
launchctl kickstart -k gui/$(id -u)/dev.hlabs.daemon        # restart it
curl http://127.0.0.1:7474/healthz                          # is it up, and which version
```

"Quit hlabs" in the menu bar stops hlabs and every app it runs; opening the app starts them again.

To remove a test install completely: stop it as above, then delete `~/Library/LaunchAgents/dev.hlabs.daemon.plist`, `/Applications/hlabs.app` and, if you want its data gone too, `~/Library/Application Support/hlabs`. Remove the keychain item `dev.hlabs` with Keychain Access.

Each build ships a new, unsigned copy of Node.js, so macOS asks once per build whether it may read the keychain item: choose **Always Allow**.

## The Linux server download

On a Linux computer (x86_64 or arm64, the one it's for):

```sh
pnpm build:linux                        # this version (0.0.0)
pnpm build:linux --version 0.0.1        # a version of your choice
```

It puts hlabsd, Node.js, Caddy, restic, docker compose, the `hlabs` command and the systemd unit into `dist/linux/hlabs-<version>-linux-<arch>.tar.gz`, and writes `SHA256SUMS`, `install.sh` and a signature for each. It signs with `TAURI_SIGNING_PRIVATE_KEY` (and `HLABS_UPDATE_PUBLIC_KEY`, its public half) when they're set. Otherwise it makes a key for this build (`dist/linux/build.key`) and writes its public half into that `install.sh`, so the install still checks a real signature.

Install it on that computer, or on a test machine that can read `dist/linux`:

```sh
sudo HLABS_TARBALL=dist/linux/hlabs-0.0.0-linux-x86_64.tar.gz sh dist/linux/install.sh
```

| What | Where |
| --- | --- |
| hlabs | `/opt/hlabs/<version>`, with `/opt/hlabs/current` pointing at the one that runs |
| The service | `/etc/systemd/system/hlabsd.service`, running as the `hlabs` user |
| Its data | `/var/lib/hlabs` (`hlabs.db`, `storage/`, `tray.token`, `secret.key`) |
| Its logs | `/var/lib/hlabs/logs/hlabsd.log`, and `journalctl -u hlabsd` |
| The install's own log | `/var/log/hlabs-install.log` |
| The `hlabs` command | `/usr/local/bin/hlabs` |
| What it may run as root | `/usr/lib/hlabs/hlabs-priv`, allowed by `/etc/sudoers.d/hlabs` |

`pnpm --filter @hlabs/cli test:install` installs the build for real and checks the result. It needs `sudo`, systemd and Docker, and it changes the machine, so CI runs it on its own runner (the `install (Linux)` job). On a Mac, an [OrbStack](https://orbstack.dev) Ubuntu machine works too: copy the repository into the machine rather than building in the shared folder, so the Mac's `node_modules` aren't replaced with Linux ones.

## The installable dashboard

`vite build` also writes the web manifest (`manifest.webmanifest`) and the service worker (`sw.js`, Workbox through `vite-plugin-pwa`) that let people install hlabs as an app (US-INST-28). The worker keeps only the shell (index.html, what it loads, the fonts and the app icons) for opening offline, and never answers `/trpc`, `/api`, `/auth` or `/healthz`. Development (`pnpm dev`) has neither. The app icons in `apps/web/public/icons` are rendered from `docs/design/logos/hlabs-app-icon.svg`; after the logo changes, run `node apps/web/scripts/pwa-icons.mjs` and commit them.

