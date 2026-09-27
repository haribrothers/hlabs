---
title: Set up hlabs
description: Open setup the first time hlabs starts, and finish it on the computer running hlabs.
features: [F-ONB-01]
---

For admins: the person who installed hlabs.

## Open setup

The first time hlabs starts, it makes a one-time setup address. Open it in a browser on the computer running hlabs to begin.

- **Menu-bar app (Mac and Linux desktop):** it opens setup in your browser by itself. If you close the tab, choose **Open setup** from the menu.
- **Linux server:** the installer prints the address at the end. Run `hlabs setup-url` to see it again.

Setup opens on a welcome screen. It takes about five minutes: press **Get started** to check this computer, then follow the steps.

The address keeps working until setup is finished, even if hlabs or the computer restarts. You can open it in more than one tab.

You don't have to finish in one go. Close the browser or restart the computer, then open the setup address again: setup picks up at the step you were on. **Back** takes you to earlier steps.

## Check this computer

The first step checks the processor, the operating system, the container runtime (such as OrbStack, Docker Desktop, Colima or Docker Engine), free disk space and web ports.

- **Free disk space:** hlabs needs at least 10 GB free to continue. Under 30 GB you'll see a warning, but you can carry on.
- **Ports 80 and 443:** if another app already uses one, hlabs uses 8080 or 8443 instead. You can carry on; the dashboard address then includes the port.
- **Container runtime:** it must be running to continue. Start it, then press **Check again**.

## "Finish setup on the computer running hlabs."

You'll see this if you open hlabs from another device, such as your phone, before setup is finished. It keeps anyone else on your network from creating the first admin account. Open the setup address on the computer running hlabs instead.

Once setup is finished, the setup address stops working and you log in as usual.
