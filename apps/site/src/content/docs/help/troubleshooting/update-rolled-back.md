---
title: An update rolled back
description: When an update of hlabs or of an app didn't start, hlabs put the version you had back. What to do next.
features: [F-STORE-09, F-STATE-01]
---

For admins.

hlabs never leaves you with a half-installed update. If a new version doesn't start, it puts back the one you had and starts it again.

## An update of hlabs

The dashboard says **The update didn't install**, and the menu bar says **The update couldn't be installed**. hlabs keeps the version you had; your apps restart and nothing else changes.

1. Wait a while and choose **Check for updates…** again: a fixed version is often out soon.
2. If it happens again, collect diagnostics (below) before trying a third time.

## An update of an app

The app's page in the App Store says **<App>'s update didn't start, so hlabs rolled it back**, and admins get a notification.

1. Choose **View log** on that page to see why the new version didn't start.
2. Choose **Try again** to update once more, or wait for the next version.
3. If the previous version didn't start again either, the app shows an error: see [When an app stops working](../../apps/manage-apps/#when-an-app-stops-working).

## Collect diagnostics

- **Mac or Linux desktop:** click the hlabs icon in the menu bar and choose **Copy diagnostics**.
- **Linux server:** run `sudo hlabs status` and `sudo hlabs logs`.
- **In the dashboard:** Settings › Advanced has the logs.

## Still stuck?

Copy the diagnostics (below), then [open an issue on GitHub](https://github.com/haribrothers/hlabs/issues/new) and paste them in. They contain no passwords or file names.
