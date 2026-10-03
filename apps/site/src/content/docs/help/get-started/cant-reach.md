---
title: Can't reach hlabs
description: What the "Can't reach hlabs" page means and what to check.
features: [F-STATE-02, F-INST-05, F-INST-04]
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

## In the menu bar on the Mac running hlabs

If hlabs hasn't answered for about 10 seconds, the menu-bar app says **Can't reach hlabs**, and why when hlabs could say (for example that it can't find its storage folder). From there:

- **Restart hlabs** restarts its background service. The menu says **Restarting…** and goes back to normal as soon as hlabs answers. If it still hasn't after a minute, it says **Can't reach hlabs** again.
- **Show logs** opens hlabs's log file.
- **Copy diagnostics** copies a short report with the latest log lines, with passwords and other secrets removed, to paste into a bug report.

During an update the menu says **Updating hlabs…** instead; wait for it to finish.

## "hlabs needs Keychain access to work"

On a Mac, the hlabs menu-bar app keeps a private key in your Keychain so it can talk to hlabs without you logging in. If macOS asks whether hlabs may use it and you choose **Deny**, the menu says **hlabs needs Keychain access to work**. Choose **Try again**, then **Allow** (or **Always Allow**) when macOS asks.

If the key goes missing, for example after you reset your Keychain, the menu-bar app makes a new one and restarts hlabs's background service by itself. Your apps and data aren't affected. If the menu still says **Can't reach hlabs** afterwards, quit hlabs and open it again.

## Another program is using port 443

hlabs serves the dashboard and your apps on port 443, the usual port for secure web pages. If another program already uses it, such as another web server, a container that publishes port 443, or Tailscale Serve, other devices can't reach hlabs. The menu-bar app then says **Can't use port 443**, with what's using it when hlabs can tell, and admins get a message.

You can:

- choose **Use port 8443** in the menu-bar app (or change the port in Settings › Network). hlabs's addresses then end in `:8443`, for example `https://hlabs.local:8443`; update any bookmarks.
- or stop the other program. hlabs notices within a few minutes and uses port 443 again by itself.

Until then, **Open Dashboard** in the menu-bar app still opens the dashboard on the computer running hlabs.

If it's Tailscale Serve, check `tailscale serve status` for an entry on port 443 that you made yourself, and turn it off with `tailscale serve --https=443 off` if you don't need it. hlabs never removes Serve entries it didn't make.

