---
title: Engine and startup
description: The container engine that runs your apps, and what happens when your computer starts.
features: [F-SYS-06]
---

For admins.

hlabs runs apps in containers, using a container engine on this computer. **Settings › Engine & startup** shows whether the engine is running and which one hlabs uses: OrbStack, Docker Desktop or Colima on a Mac (hlabs installs Colima itself if you had none), or Docker Engine on Linux. Other engines found on this computer are listed too.

## Restart the engine

If apps stop responding, choose **Restart engine**. All apps stop for about a minute while it restarts, then the engine comes back on its own. If it isn't back after 3 minutes, hlabs says so and offers **Start engine**. You can't restart it while hlabs is busy with something that must finish first, such as an update or a restore.

## Resources for apps

On a Mac where hlabs installed Colima, you choose how many CPU cores, how much memory and how much disk space apps can use. Move the sliders and choose **Apply and restart engine**: the engine restarts with the new values. The disk can only grow. If you use OrbStack or Docker Desktop, change these in that app's settings instead. On Linux, apps use the computer directly, so there's nothing to set.

## Startup

- **Start apps automatically**: apps set to start automatically come back after hlabs or the computer restarts. Turn it off to start them yourself.
- **Keep this computer awake**: while any app is running, the computer doesn't go to sleep, so your apps stay reachable. The display can still turn off.

Both are on after setup. **Start hlabs when I log in** arrives with the menu bar app.
