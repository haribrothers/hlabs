---
title: Docs screenshots
description: How the help's pictures are taken from the real dashboard, how to update them on your computer, and the bot that keeps them current.
---

The pictures in the help (Home, the App Store, App settings, Files, Backups, Settings, the phone and the tablet, and setup's first screens) are screenshots of the real dashboard, not drawings (US-SITE-11, D-177). They live in `apps/site/src/assets/shots/` as WebP files, and the help pages use them from there. Pictures of things that aren't the dashboard (the menu-bar app, the disk image window, a terminal) are still the design pictures in `apps/site/src/assets/screens/`.

## Update them on your computer

```sh
pnpm docs:shots
```

This runs the `docs-shots` Playwright project (`apps/web/e2e/docs-shots/`) on its own. The first run needs the browser: `pnpm --filter @hlabs/web exec playwright install chromium`. It takes a minute or two and writes every screenshot again, then `git status` shows which files changed.

To keep only the ones that really changed, as the bot does:

```sh
pnpm --filter @hlabs/web docs-shots:compare
```

It puts back every screenshot that changed by 1% of its pixels or less and prints a table of the rest. Look at the images before you commit them.

Run `docs:shots` on its own, not together with other e2e projects: it starts a different hlabs from theirs.

Fonts are drawn slightly differently on a Mac and on Linux, so screenshots made on a Mac aren't pixel for pixel the bot's. That's fine: commit a new screenshot from your Mac when you add one, and the bot replaces it with its own the next time it runs.

## The docs instance and its demo data

The screenshots never show anyone's real data. Playwright starts an hlabs of its own for them, fresh every run, that never touches your development hlabs or the e2e instances:

| | |
| --- | --- |
| Ports | 7674 for hlabs, 5473 for the dashboard |
| Data | `.e2e-data-docs/home/hlabs`, in a pretend home (`.e2e-data-docs/home`), so paths read `~/hlabs/...` on any computer |
| Computer | a pretend Mac mini (M4, 32 GB, macOS 15, 1 TB disk) with hlabs's own Colima (`HLABS_DEV_DEMO`) |
| Clock | starts at Wednesday 14 October 2026, 09:41 UTC every run (`HLABS_DEV_CLOCK`), and the browser's clock is set to it |

`HLABS_DEV_DEMO` and `HLABS_DEV_CLOCK` are for development only; hlabsd refuses them in production.

The project's setup (`demo.setup.ts`) first takes setup's welcome and system check screens while the instance is fresh, for the install guides. Then `POST /dev/demo` seeds the demo data set (`apps/daemon/src/demo/`): Hari, the admin, and two family members, Maya and Leo; Jellyfin, Immich, Vaultwarden, Nextcloud, Home Assistant and Paperless-ngx from the built-in store with their logos (two of them with an update); remote access through a pretend Tailscale; a month of nightly backups to a NAS; a month of usage history; and a few files and photos. No app is really installed: each runs as a pretend container with steady usage figures. Every figure depends only on the time, and the time is always the same morning, so the screenshots come out the same on every run.

Everything is taken in Chromium with British English, UTC and reduced motion, one CSS pixel per pixel.

## Add a screenshot

1. Add a test to the spec for its layout: `us-site-11-desktop.spec.ts` (1440 × 900), `us-site-11-phone.spec.ts` (390 × 844) or `us-site-11-tablet.spec.ts` (1180 × 820, an iPad by touch).
2. Go to the screen, wait until what the help describes is there (`expect(…).toBeVisible()`), then call `docsShot(page, '<name>')`. The name is lowercase words with dashes, ending in `-phone` or `-tablet` for those layouts. `docsShot` checks the viewport is the layout's size, waits for fonts and images, takes the screenshot and saves `apps/site/src/assets/shots/<name>.webp`.
3. If the screen needs data the demo set doesn't have, add it to `apps/daemon/src/demo/seed.ts`, dated from "now" so it doesn't change between runs.
4. Run `pnpm docs:shots`, and use the image in the help page with a Markdown image: `![What it shows, in words](../../../../assets/shots/<name>.webp)` (adjust the `../` to the page's folder).

## The bot

`.github/workflows/docs-shots.yml` runs on `main` after a change to the dashboard, hlabsd, the UI kit, the icons or the built-in store, and by hand (Actions › docs-shots › Run workflow). It:

1. takes every screenshot (`pnpm --filter @hlabs/web docs-shots`);
2. compares each with the committed one (`docs-shots:compare`): a screenshot is kept when it's new or more than 1% of its pixels changed (a pixel counts when a colour moved by more than 24 of 255, so compression noise doesn't), and the rest are put back;
3. when anything is left, pushes it to the branch `docs-shots/update` and opens a pull request labelled `docs-shots` with the table of what changed, or updates the one that's open.

It never commits to `main`. Read the pull request (GitHub shows the images side by side), merge it, and the site is built again with the new pictures.

Like the store's update bot, it opens the pull request with the `STORE_UPDATES_TOKEN` secret when it's set, so the pull request's checks run. Without it, the pull request is opened with Actions' own token, and its checks wait until someone pushes to the branch.
