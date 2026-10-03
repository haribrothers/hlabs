---
title: Update hlabs
description: See which version of hlabs you have, and check for a newer one.
features: [F-SYS-08]
---

For admins.

Open **Settings › Updates** to see which version of hlabs you have. The card at the top says **hlabs is up to date**, or, when a newer version is out, its version number and what's new in it.

## Install an update

When a newer version is out, the card says so, for example **hlabs 1.5.0 is available**, with what's new in it. Choose **Full release notes** to read everything that changed.

Choose **Update now** to install it. Your apps restart for about a minute while hlabs updates; your files and app data stay as they are. On a Mac or a Linux desktop, the hlabs menu-bar app installs the update, so it needs to be running. On a Linux server without a desktop, hlabs installs it by itself, and goes back to the version you had if the new one doesn't start.

hlabs only installs updates it can verify were made by the hlabs project. If an update can't be verified, it isn't installed.

If hlabs is busy with something that can't be interrupted, such as a restore, **Update now** waits and says what for. Try again when it's done.

## Update your apps

Under **App updates**, each app with a newer version shows the version you have and the new one, for example **1.2 → 1.3**. Choose **What's new** to read what changed, and **Update** to install it; the row shows how far the update has got, and goes away when it's done. Your app's data stays as it is.

If an app's new version doesn't start, hlabs puts the version you had back and the row says **Rolled back**. Choose it to see what happened and try again. When there's nothing to update, it says **All apps are up to date**.

## Update automatically

Under **Automatic updates**:

- **Update hlabs automatically** installs a new version of hlabs overnight, between 3 and 5 am. It's on to begin with.
- **Update apps automatically** updates apps overnight too, but only the apps you've allowed in their own settings.

hlabs updates itself first, then your apps. If a backup or something else that can't be interrupted is running, it waits for it to finish; if that takes past 5 am, it tries again the next night. In the morning, a notification says what was updated, and anything that was rolled back because it didn't start.

## Check for updates

hlabs checks for a newer version by itself every 6 hours. To check now, choose **Check now**. It also refreshes the App Store, so new apps and app updates show up. When it's done, the card shows what it found and **Last checked just now**.

If the check can't reach the internet, hlabs says **Couldn't check for updates** and the card keeps showing what the last check found. Check your internet connection and try again.

When checking, hlabs only asks GitHub, where hlabs releases are published, which version is the newest. It sends nothing about you or your apps.
