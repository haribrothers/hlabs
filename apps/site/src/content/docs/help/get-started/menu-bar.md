---
title: The menu-bar app
description: What the hlabs icon in the Mac menu bar shows and does.
features: [F-INST-03]
---

For admins on the Mac that runs hlabs.

Click the hlabs icon in the menu bar to open its menu. Click anywhere else, or press Esc, to close it. Use the Up and Down arrow keys to move between items and Return to choose one.

## The icon

The hlabs icon itself tells you how things are, without opening the menu:

- **Plain:** hlabs and your apps are running.
- **Pulsing:** hlabs is starting or bringing your apps back. (It stays still if you've turned on Reduce motion.)
- **Faded:** your apps are paused.
- **Red dot:** something needs you: an app couldn't start, the container engine has stopped, or hlabs isn't answering. If your apps have been offline for a minute, you also get one notification.

## Status at a glance

The top of the menu says whether hlabs is running and how many of your apps are running right now, for example **Running · 11 apps**. Underneath, three tiles show how busy this computer is:

- **CPU:** how much of the processor is in use.
- **Memory:** how much memory apps and the system are using.
- **Free:** the free space where hlabs keeps your files.

The numbers refresh every few seconds while the menu is open. Until hlabs answers, the tiles show a dash instead of a number.

While hlabs starts, or brings your apps back after the container engine restarted, the menu says **Starting** with how many apps are up so far, for example **Starting · 4 of 11 apps**, and a bar that fills as they come up. Choose **Show startup log** to see the log of the first app that isn't running yet. When every app is up, the menu goes back to **Running**. If an app couldn't start, the menu says so, for example **Running · 10 of 11 apps · 1 needs attention**; open the dashboard to see which one.

## When the container engine has stopped

If the menu says **Container engine stopped**, the program that runs your apps (such as OrbStack, Docker Desktop or Colima) isn't running, so your apps are offline. Choose **Start engine**: hlabs starts it and brings your apps back, and the menu shows **Starting** while they come up. If it hasn't started after two minutes, the menu says **Engine didn't start** and you can try again. **Troubleshoot…** opens the dashboard with steps to check.

**Copy diagnostics** copies a short report (hlabs's version, your system, the container engine and the latest hlabs log) that you can paste into a bug report. Passwords and other secrets are removed from it.

## Open the dashboard

Choose **Open Dashboard** (or press ⌘D while the menu is open) to open hlabs in your browser. **Copy dashboard address** copies the address so you can paste it into a message to someone at home; the item says **Copied** for a moment. Both always use hlabs's current address, so they keep working after you rename this computer in hlabs. If setup isn't finished yet, the address opens setup.
