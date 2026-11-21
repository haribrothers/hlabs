---
title: Install on a Linux desktop
description: Install hlabs on a Linux computer with a desktop, use its menu in the top bar, and remove it.
features: [F-INST-10]
---

For admins: the person who installs hlabs.

## What you need

- Linux with systemd and a desktop: GNOME, KDE Plasma or another with a system tray.
- Docker Engine, with your account in the `docker` group, or Docker Desktop.
- On GNOME, the AppIndicator extension (Ubuntu includes it) to see hlabs in the top bar. Without it, hlabs says so once and keeps running.

## Install

Download the file for your computer from the hlabs website:

- **Ubuntu, Debian and their relatives:** `hlabs-<version>-linux-x86_64.deb`. Open it, or run `sudo apt install ./hlabs-<version>-linux-x86_64.deb`.
- **Fedora and its relatives:** `hlabs-<version>-linux-x86_64.rpm`. Run `sudo dnf install ./hlabs-<version>-linux-x86_64.rpm`.
- **Anything else:** `hlabs-<version>-linux-x86_64.AppImage`. Make it executable (`chmod +x`) and open it. The AppImage needs no administrator, so it uses ports 8443 and 8080 instead of 443 and 80, and it can't connect network drives.

(On an arm64 computer the files say `aarch64`.)

Then open **hlabs** from your applications. The first time, it sets up its background service, adds itself to the apps that open when you log in, and opens [setup](../set-up/) in your browser.

## The menu

Click the hlabs icon in the top bar. The first line says how hlabs is doing, such as **hlabs · Running · 11 apps**; it changes within a few seconds when something does. Then:

- **Open Dashboard** and **Copy dashboard address**.
- **Back up now**.
- **Start at login**: hlabs and its apps start when you log in. Untick it to start them yourself.
- **Pause all apps** (then **Resume apps**).
- **Check for updates…**: the item says what it found. When an update is ready it becomes **Restart to update**.
- **Reset a password…**: for someone who forgot theirs. Your desktop asks for your password first.
- **Quit hlabs**: stops hlabs and every app until you open it again.

When the container engine stops, the menu offers **Start engine**.

## Remove hlabs

Quit hlabs from its menu, then stop its background service and remove the package:

```sh
systemctl --user disable --now hlabsd
sudo apt remove hlabs        # or: sudo dnf remove hlabs, or delete the AppImage
```

Your data stays in `~/hlabs` and `~/.local/share/hlabs`. Delete those folders too if you don't want it any more.
