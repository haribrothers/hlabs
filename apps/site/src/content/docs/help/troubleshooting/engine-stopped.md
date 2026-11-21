---
title: The container engine stopped
description: What it means when hlabs says the container engine stopped, and how to start it again.
features: [F-STATE-03]
---

For admins.

Your apps run in containers, and the container engine (Colima, OrbStack, Docker Desktop or Docker Engine) runs them. When it stops, every app is offline until it's back. **Your data is safe**: it's on disk, not in the engine.

You'll see it as **Container engine stopped** in the menu-bar icon, a banner in the dashboard, and greyed-out apps on Home.

## What to try, in order

1. **Start engine**: in the menu bar's menu or the dashboard's banner. hlabs starts the engine it uses and your apps come back on their own.
2. If you use OrbStack or Docker Desktop, open it yourself and wait for it to say it's running.
3. On a Linux server, run `sudo systemctl start docker`.
4. Restart the computer. hlabs and the engine start again at login (or at boot on a server).
5. If the engine starts and stops again, it may be out of disk space or memory: see [Out of disk space](../disk-full/) and [Engine and startup](../../get-started/engine/).

## Collect diagnostics

- **Mac or Linux desktop:** click the hlabs icon in the menu bar and choose **Copy diagnostics**.
- **Linux server:** run `sudo hlabs status` and `sudo hlabs logs`.
- **In the dashboard:** Settings › Advanced has the logs.

## Still stuck?

Copy the diagnostics (below), then [open an issue on GitHub](https://github.com/haribrothers/hlabs/issues/new) and paste them in. They contain no passwords or file names.
