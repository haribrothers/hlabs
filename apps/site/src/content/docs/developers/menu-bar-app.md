---
title: The menu-bar app
description: Running and changing hlabs's menu-bar app.
---

The menu-bar app (`apps/tray`) is a Tauri 2 app: Rust in `src-tauri/` for the menu-bar icon, the keychain, the background service and updates, and a small React window in `src/` for the menu, built from the UI kit's `TrayMenu`.

## Run it

```sh
pnpm dev        # hlabs itself, in another terminal
pnpm dev:tray   # the menu-bar app, with its window on http://127.0.0.1:5174
```

The development menu-bar app talks to the hlabs on `127.0.0.1:7474`. It doesn't install or start a background service: that's `pnpm dev`'s job.

## Its access to hlabs

The menu-bar app proves itself to hlabs with a token (`Authorization: Bearer`, accepted only from this computer and only for `tray.*` calls). An installed app keeps the token in the keychain (`dev.hlabs` / `tray-token`); a development build keeps it in `.dev-data/tray.token`, so no keychain prompt appears while you work.

## Before you start it

`pnpm dev:tray` warns you when an installed hlabs is running. Stop it first (`launchctl bootout gui/$(id -u)/dev.hlabs.daemon`): otherwise the development menu-bar app talks to the installed hlabs, which doesn't know its token, and you'll see keychain prompts and "Can't reach hlabs".

## Tests

- The window: `pnpm --filter @hlabs/tray test` (Vitest, with a stand-in for the Rust side in `test/tauri.ts`).
- The Rust side: `cd apps/tray/src-tauri && cargo test`. launchctl, the keychain and the login item sit behind traits with fakes, so the tests never touch your computer's real ones.
