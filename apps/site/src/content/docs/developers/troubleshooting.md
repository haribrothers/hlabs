---
title: Troubleshooting
description: Problems you're likely to meet while working on hlabs, and how to fix them.
---

## Two copies of hlabs

**Symptoms:** "Can't reach hlabs" in the menu bar, repeated keychain prompts, the dashboard not loading, "port 443 already in use" in the log.

Only one hlabs can run on a computer: `pnpm dev` and an installed hlabs both want port 7474, and with Caddy ports 443 and 80. Stop the one you're not using:

```sh
launchctl bootout gui/$(id -u)/dev.hlabs.daemon   # the installed one
```

and stop `pnpm dev` before opening the installed app. `pnpm dev:tray` warns you when an installed hlabs is running.

## "node wants to use … dev.hlabs in your keychain"

That's the installed hlabs reading the menu-bar app's token. Each build has a new, unsigned copy of Node.js, so macOS asks again after every build: choose **Always Allow**. If it keeps asking, a development menu-bar app is probably talking to the installed hlabs (see above).

## Port 443 is in use

hlabs serves the dashboard and apps on 443 through Caddy. If something else holds it (another web server, a container publishing 443, Tailscale Serve), the menu bar says "Can't use port 443" and offers "Use port 8443". To see who holds it:

```sh
sudo lsof -nP -iTCP:443 -sTCP:LISTEN
tailscale serve status        # Tailscale holds it without showing up in lsof for your user
```

A development hlabs with real Tailscale (`HLABS_DEV_FAKE_TAILSCALE=0`) leaves Serve entries behind that block an installed hlabs; clear them with `tailscale serve reset`.

## "Couldn't check for updates"

- In the menu bar while testing an update: start the app with `HLABS_UPDATE_ENDPOINT` (see [Updates and signing](/developers/updates-and-signing/)) and check the server is running. Opened from Finder, the app asks GitHub, where your fork may have no release.
- In the dashboard: the background service asks GitHub too; that's expected until your fork publishes a release.

## The dashboard is blank at first in end-to-end tests

The first visit after a code change waits for Vite to prepare the page, which can take 15 to 30 seconds. The tests allow for it; run them again if a cold run times out.

## Where to look

- Development: the terminal running `pnpm dev`.
- An installed hlabs: `~/Library/Application Support/hlabs/logs/hlabsd.1.log`, and `launchd.log` beside it.
- `curl http://127.0.0.1:7474/healthz` says whether hlabs is up and which version answers, or why it isn't ready.
