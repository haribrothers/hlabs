---
title: Updates and signing
description: Signing your own hlabs updates, and testing an update from start to finish.
---

hlabs only installs updates signed with its update key: the menu-bar app checks with the Tauri updater, and hlabsd on a Linux server checks the same signature itself. Updates are found through a `latest.json` manifest (Tauri's updater format) on GitHub Releases: `releases/latest/download/latest.json` for stable, a rolling `beta` release for beta.

## Your own key (forks)

A fork can't sign with the hlabs key, so make your own and put its public half in both places:

```sh
cd apps/tray
pnpm exec tauri signer generate --ci -p "" -w ~/.tauri/hlabs-dev.key
cat ~/.tauri/hlabs-dev.key.pub
```

- Put the public key (the base64 text in `hlabs-dev.key.pub`) in `apps/daemon/src/updates/key.ts` (`UPDATE_PUBLIC_KEY`) and in `apps/tray/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- Point the manifest at your releases: `RELEASES` in `apps/daemon/src/updates/source.ts` and `apps/tray/src-tauri/src/updates.rs`, and `plugins.updater.endpoints` in `tauri.conf.json`.
- Keep the private key out of the repository. Lose it, and installs signed with it can't be updated.

## Test an update from start to finish

Build an older version to install, then a newer one as an update, and serve it from your computer:

```sh
pnpm build:tray --version 0.0.1               # install this one in Applications
pnpm build:tray --version 0.0.2 --update      # the update: dist/updates/latest.json and its archive
python3 -m http.server 8090 -d dist/updates   # serve it
```

Start the installed app pointing at your server, then choose **Check for updates…** and **Restart to update**:

```sh
HLABS_UPDATE_ENDPOINT=http://127.0.0.1:8090/latest.json /Applications/hlabs.app/Contents/MacOS/hlabs-tray
```

An open dashboard shows "Updating hlabs", reloads, and says "hlabs is up to date".

Two more builds check that bad updates don't get in:

- `pnpm build:tray --version 0.0.3 --update --broken`: signed, but it won't install. hlabs goes back to the version you had and says "The update didn't install".
- `pnpm build:tray --version 0.0.4 --update --bad-signature`: signed with another key. It's refused and nothing changes.

Builds from `pnpm build:tray` may fetch updates over plain `http` from your own server; the update must still be signed with your key. The dashboard's "Check now" comes from the background service, which doesn't see `HLABS_UPDATE_ENDPOINT` when started by launchd, so test with the menu-bar app.
