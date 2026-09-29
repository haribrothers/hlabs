---
title: Can't reach hlabs
description: What the "Can't reach hlabs" page means and what to check.
features: [F-STATE-02]
---

For everyone who uses hlabs.

If hlabs isn't answering, you see **Can't reach hlabs** instead of a browser error. It means your browser reached the computer running hlabs, but hlabs itself isn't responding. The page tries again every 5 seconds and shows how long until the next try; choose **Try now** (or press Tab, then Enter) to try straight away. As soon as hlabs answers, you're taken back to the page you were on. If you switch to another tab, it tries every 30 seconds instead, and again the moment you come back.

When hlabs knows why it isn't ready, the page says so: for example that it's starting (this usually takes less than a minute), or that it can't find its storage folder because a drive isn't connected.

While you wait, check that:

1. The hlabs icon is in the menu bar (or tray) on the computer running hlabs.
2. That computer is awake and on the same network as you, or on Tailscale.
3. On a Linux server, hlabs is running: run `systemctl status hlabsd`.
