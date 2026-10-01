---
title: Manage an app
description: See whether an app is running, and start, stop or restart it from App settings.
features: [F-APP-02]
---

For admins. Members can open the apps an admin shared with them, but not change them.

## Open App settings

Open an app and choose **App settings** at the top of its window. The settings show the app's name, whether it's running and how long it has been up, such as "Running · up 6 days". Choose **Close** to go back to where you were.

## The app's address

Under **Access**, App settings shows the app's address, such as `https://vaultwarden.hlabs.local`. Select it to open the app in a new tab, or choose **Copy** to copy it for another device or a bookmark.

If hlabs can't announce the app's name on your network, the address is the hlabs address with the app's own port, such as `https://hlabs.local:12003`. It opens the same app.

## Choose how an app behaves

Under **Behaviour**:

- **Start automatically**: the app starts when hlabs starts, for example after this computer restarts. Turn it off for apps you only use now and then; they stay stopped until you start them.

Each switch saves as soon as you change it. If it can't be saved, it moves back and hlabs tells you why.

## Storage and version

Under **Storage and resources**:

- **Data folder** is where the app keeps its data, such as `~/hlabs/app-data/vaultwarden`.
- **Using now** is how much disk the app takes, its data and its software together, such as "Disk 210 MB". It's counted every few minutes, so it may lag a little behind.

At the bottom, the version says whether it's up to date, or which newer version the App Store has.

## Read an app's logs

Logs are what an app writes about what it's doing. They help when something goes wrong, for example when an app won't start. Choose **Logs** in App settings or at the top of the app window.

The logs show the latest 500 lines, oldest first, with the time and, when the app says, how serious each line is: INFO, WARN, ERROR or DEBUG. New lines appear as the app writes them while **Following** is on. Scroll up to read earlier lines and following stops; choose **Following** again to jump back to the newest line. If the app restarts while you watch, a "Container restarted" line marks where.

To find something, type in **Filter** to show only lines that contain it, choose **Errors only**, or, for an app made of several parts, pick one under its name (such as "server"). **All** mixes every part's lines in time order and starts each line with whose it is. If nothing matches, choose **Clear filters**.

Logs can contain passwords and other private details, so only admins can see them.

## Start, stop or restart an app

- **Open** opens the app in a new tab.
- **Restart** stops the app and starts it again. Try this first when an app misbehaves.
- **Stop** stops the app until you start it again, even after this computer restarts. Its data stays where it is.
- **Start** appears instead of Stop when the app is stopped.
- **Logs** shows what the app has been writing, to help work out what went wrong.

While an app starts, stops or restarts, the buttons wait until it's done. If it doesn't come back, hlabs says "<App> didn't start. Check the logs." with a way to its logs.

If the container engine has stopped, these buttons are turned off until it's running again.
