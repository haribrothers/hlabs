---
title: Can't reach hlabs
description: What the "Can't reach hlabs" page means and what to check.
features: [F-STATE-02]
---

For everyone who uses hlabs.

If hlabs isn't answering, you see **Can't reach hlabs** instead of a browser error. It means your browser reached the computer running hlabs, but hlabs itself isn't responding. The page keeps trying on its own and comes back as soon as hlabs does; choose **Try now** to try straight away.

While you wait, check that:

1. The hlabs icon is in the menu bar (or tray) on the computer running hlabs.
2. That computer is awake and on the same network as you, or on Tailscale.
3. On a Linux server, hlabs is running: run `systemctl status hlabsd`.
