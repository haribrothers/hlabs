---
title: Uninstall hlabs
description: Remove hlabs from a Mac or a Linux server, keeping your data or deleting everything.
features: [F-INST-08]
---

For admins: the person who installed hlabs.

Uninstalling stops every app and removes hlabs. You choose whether your data stays, so you can reinstall later and find everything where it was. Backups on your NAS or in cloud storage are never touched, and neither are files on a network drive or another disk.

## On a Mac

Click the hlabs icon in the menu bar and choose **Uninstall hlabs…**. Dragging hlabs to the Trash on its own would leave your apps running in the background, so use this instead.

1. Choose what to keep:
   - **Keep my data** (chosen at first): your apps' data and Home folders stay in `~/hlabs`.
   - **Delete everything**: the window says how much this removes. It can't be undone.
2. If hlabs installed Colima for you, you can tick **Also remove Colima, which hlabs installed**. A Colima, OrbStack or Docker Desktop you installed yourself is never removed.
3. Choose **Uninstall**. macOS asks for your login password or Touch ID to confirm it's you.

The window then lists each step: **Stopping apps**, **Removing Colima** (if you chose it), **Removing hlabs** and **Deleting data** (if you chose Delete everything). When they're done, hlabs moves itself to the Trash and quits.

If a step doesn't finish, it says what to do. **Try again** carries on from that step; **Copy diagnostics** copies a report you can send when asking for help. hlabs stays in Applications until every step has finished.

## On a Linux desktop

Removing the package uninstalls hlabs: see [Install on a Linux desktop](../install-linux-desktop/#remove-hlabs).

## On a Linux server

Run:

```sh
sudo hlabs uninstall
```

It asks whether to uninstall, then whether to keep your data in `/var/lib/hlabs`. To delete it, you type `delete` to confirm. Each step prints a ✓ line: the apps stop, the `hlabsd` service and `/opt/hlabs` are removed, and with everything deleted, `/var/lib/hlabs` and the `hlabs` user go too.

To answer the questions in a script, add `--keep-data` or `--delete-everything`, and `--yes`:

```sh
sudo hlabs uninstall --keep-data --yes
```

If the `hlabs` command is gone already, the installer does the same:

```sh
curl -fsSL https://hlabs.h4loom.com/install.sh | sh -s -- --uninstall
```

Docker Engine and Avahi stay installed, since other programs may use them. Remove them with your package manager if you don't need them.
