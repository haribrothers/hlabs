---
title: Can't reach hlabs
description: What the "Can't reach hlabs" page means and what to check.
features: [F-STATE-02, F-INST-05]
---

For everyone who uses hlabs.

If hlabs isn't answering, you see **Can't reach hlabs** instead of a browser error. It means your browser reached the computer running hlabs, but hlabs itself isn't responding. The page tries again every 5 seconds and shows how long until the next try; choose **Try now** (or press Tab, then Enter) to try straight away. As soon as hlabs answers, you're taken back to the page you were on. If you switch to another tab, it tries every 30 seconds instead, and again the moment you come back.

When hlabs knows why it isn't ready, the page says so: for example that it's starting (this usually takes less than a minute), or that it can't find its storage folder because a drive isn't connected.

While you wait, check that:

1. The hlabs icon is in the menu bar (or tray) on the computer running hlabs.
2. That computer is awake and on the same network as you, or on Tailscale.
3. On a Linux server, hlabs is running: run `systemctl status hlabsd`.

## "You're offline" and "Reconnecting…"

If your device loses its connection, a small **You're offline** strip appears at the top of the screen. What you were looking at stays there, but changes can't be made until you're connected again: hlabs says "You're offline. Try again when you're connected." straight away instead of trying. If your device is online but hlabs's live updates have stopped for a few seconds, the strip says **Reconnecting…** while hlabs picks them up again. When the connection is back, the strip goes and everything on screen refreshes.

## "hlabs needs Keychain access to work"

On a Mac, the hlabs menu-bar app keeps a private key in your Keychain so it can talk to hlabs without you logging in. If macOS asks whether hlabs may use it and you choose **Deny**, the menu says **hlabs needs Keychain access to work**. Choose **Try again**, then **Allow** (or **Always Allow**) when macOS asks.

If the key goes missing, for example after you reset your Keychain, the menu-bar app makes a new one and restarts hlabs's background service by itself. Your apps and data aren't affected. If the menu still says **Can't reach hlabs** afterwards, quit hlabs and open it again.
