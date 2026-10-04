---
title: Building the app
description: Building the Mac app with hlabs inside, and where an installed hlabs keeps things.
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
