---
title: Advanced settings
description: Read hlabs's own logs, download a diagnostics bundle, see what hlabs connects to, try beta versions, restart hlabs or reset it.
features: [F-SYS-09, F-SYS-11]
---

For admins.

**Settings › Advanced** is for when something isn't working, or when you want to start again.

## Read hlabs's logs

Next to **hlabs logs**, choose **View**. A window shows the last 500 lines of what hlabs wrote, newest at the bottom, and new lines appear by themselves while it's open. Choose which log to read at the top:

- **Background service**: hlabs itself.
- **Proxy**: the part of hlabs that serves the dashboard and your apps at their addresses.
- **Installs**: each step of installing, updating and removing apps, and how it ended.

Type in **Search** to mark every line with those words. **Pause** stops the window jumping to the newest line, so you can read; **Resume** follows again. Passwords, tokens and sign-in headers are shown as `••••`: hlabs hides them before they reach your browser. If a log is empty, it says "No log lines yet".

## Download a diagnostics bundle

Next to **Diagnostics bundle**, choose **Download**. hlabs gathers what someone helping you would need and your browser saves it as `hlabs-diagnostics-<name>-<date>.zip`:

- the version of hlabs, this computer's system and the container engine,
- your apps, their versions and whether they're running,
- hlabs's logs from the last 7 days, and each app's logs from the last 24 hours.

Before it's saved, hlabs removes passwords and other secrets (including your apps' own settings files), sign-in tokens, email addresses and internet addresses outside your home network, and replaces people's names with user1, user2 and so on. It never includes your files, the database or your passwords. hlabs never sends the bundle anywhere: you choose whether to attach it to a bug report. The download is ready for 15 minutes.

## See what hlabs connects to

Next to **What hlabs connects to**, choose **View**. hlabs sends no usage data or crash reports, and talks only to the services listed there, each with why and when it last did:

- the app libraries you added, which it checks for app updates every 6 hours,
- the registries your apps' programs are downloaded from, when you install or update an app,
- hlabs's own update server, every 6 hours,
- Tailscale, if you connected remote access ("Off" while it's disconnected),
- your backup destinations outside this computer,
- an ntfy server or a Pi-hole, if you chose one.

## Try beta versions

Turn on **Beta updates** to get new versions of hlabs before everyone else. They may have bugs. hlabs checks for a beta straight away, and [Settings › Updates](/help/get-started/updates/) says **Beta** next to your version. If you turn it off while running a beta, hlabs stays on that version until a regular release newer than it comes out.

## Restart hlabs

If hlabs seems stuck, choose **Restart** next to **Restart hlabs**. hlabs asks "Restart all apps?" first: every app stops and starts again, which takes about a minute, and anyone watching or syncing is disconnected. The page shows "Restarting hlabs…" and comes back by itself. If hlabs isn't back within 2 minutes, see [Can't reach hlabs](/help/get-started/cant-reach/). You can't restart while hlabs is updating, restoring a backup or doing something else that must finish first.

## Reset hlabs to factory settings

Resetting deletes everything and takes hlabs back to setup, for starting again or handing the computer on. Next to **Factory reset**, choose **Reset…**. hlabs lists what happens:

- all your apps and their data are deleted,
- all user accounts and settings are removed,
- your backups are not touched: backup destinations keep everything, so you can restore later.

Everyone's Home folders, Shared and the trash are deleted too, unless you tick **Keep everyone's Home folders**. To go ahead, enter your password and type the name of this hlabs (shown in the box, for example `hlabs`) exactly, then choose **Reset hlabs**. A wrong password counts like a wrong log-in: after 5 in 15 minutes you have to wait.

Everyone is logged out at once. Your page shows "Resetting hlabs…" with each step, then opens setup's Welcome screen, as on the first day. The computer's container engine and backups stay. If something couldn't be deleted, the new admin gets a notification listing it after setup.
