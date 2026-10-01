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

## Start, stop or restart an app

- **Open** opens the app in a new tab.
- **Restart** stops the app and starts it again. Try this first when an app misbehaves.
- **Stop** stops the app until you start it again, even after this computer restarts. Its data stays where it is.
- **Start** appears instead of Stop when the app is stopped.
- **Logs** shows what the app has been writing, to help work out what went wrong.

While an app starts, stops or restarts, the buttons wait until it's done. If it doesn't come back, hlabs says "<App> didn't start. Check the logs." with a way to its logs.

If the container engine has stopped, these buttons are turned off until it's running again.
