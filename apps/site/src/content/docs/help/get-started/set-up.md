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
- **No container runtime on a Mac:** hlabs sets up Colima for you. It downloads Colima (about 150 MB) and starts it with up to 4 processor cores, 8 GB of memory and a 100 GB disk that only uses the space it needs. It takes a few minutes; you can go Back while it runs. If you install OrbStack or Docker Desktop later, hlabs uses that instead.

### If setting up the container runtime fails

You'll see **Something needs attention**. hlabs removes anything it had set up, so nothing on your computer has changed. The message under **Container runtime** says what went wrong and what to do; for example, a download that timed out usually means checking your internet connection.

- **Retry** looks for a container runtime again first. If you've installed OrbStack or Docker Desktop in the meantime, hlabs uses it; otherwise it sets up Colima again.
- **View full log** shows everything the setup did, with a **Copy** button for sharing it when you ask for help.

## "Finish setup on the computer running hlabs."

You'll see this if you open hlabs from another device, such as your phone, before setup is finished. It keeps anyone else on your network from creating the first admin account. Open the setup address on the computer running hlabs instead.

Once setup is finished, the setup address stops working and you log in as usual.
