---
title: Use hlabs as an app
description: Install hlabs on your computer so it opens in its own window, without a browser tab.
features: [F-INST-11]
---

For everyone who uses hlabs.

You can install hlabs on any computer you use it from, so it opens in its own window from your Dock, Start menu or app launcher, like any other app. It's the same hlabs you open in your browser, without the tabs and address bar.

## Install it

Open hlabs in your browser, then go to **Settings › Account**. Under **This computer**, **Use hlabs as an app** says how for the browser you're using:

- **Chrome or Edge** (Mac, Windows or Linux): choose **Install hlabs**, then **Install**. You can also use the install button at the end of the browser's address bar.
- **Safari** on a Mac: choose **File › Add to Dock**.
- **Firefox** and other browsers can't install it. Open hlabs in Chrome, Edge or Safari instead.

If remote access is on, hlabs suggests installing from your **tailnet address**. An installed app keeps the address it was installed from, and the tailnet address works both at home and away, as long as this computer is connected to Tailscale. Choose **Open tailnet address**, then install from there.

At home, your browser has to trust hlabs's certificate before it offers to install it from your home network address. Installing from the tailnet address avoids that.

## Using it

The app opens at your Home screen. Your apps open the same way they do in the browser; an app that can't open inside hlabs opens in your default browser, and so do help pages.

In Chrome and Edge, the app shares your browser's sign-in, so you're signed in if you were in the browser. Safari's app has its own: the first time, you log in, and **Remember me on this device** is already on.

If the app can't reach hlabs, because this computer is offline, away from home without Tailscale, or the computer hlabs runs on is off, it says **Can't reach hlabs** and what to check. It tries again every 10 seconds, or choose **Try again**; hlabs opens as soon as it answers. When hlabs is updated, the app shows the new version the next time it opens.

## Remove it

Remove it like any other app: in Chrome or Edge, open the app's menu (the three dots at the top) and choose **Uninstall**; for Safari's app, drag it out of the Dock and delete it from your Applications folder. Nothing in hlabs changes.
