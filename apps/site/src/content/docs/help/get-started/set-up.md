---
title: Set up hlabs
description: Open setup the first time hlabs starts, and finish it on the computer running hlabs.
features: [F-ONB-01, F-ONB-06, F-INST-01]
---

For admins: the person who installed hlabs.

## The first time you open hlabs on a Mac

Open hlabs from your Applications folder. A small window under the hlabs icon in the menu bar says **Setting up hlabs** while it starts its background service, the part that keeps your apps running even when the menu-bar app is closed. This happens once and usually takes under a minute. hlabs also adds itself to your login items so it starts when you log in.

If the background service doesn't start within a minute, the window says **Can't reach hlabs**: see [Can't reach hlabs](../cant-reach/).

## Open setup

The first time hlabs starts, it makes a one-time setup address. Open it in a browser on the computer running hlabs to begin.

- **Menu-bar app (Mac and Linux desktop):** once its background service is running, it opens setup in your browser by itself. If you close the tab, click the hlabs icon in the menu bar and choose **Open setup**. It keeps offering **Open setup** until setup is finished, and then shows its usual menu.
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

- **OrbStack or Docker Desktop installed but not open:** you'll see "OrbStack is not running" (or Docker Desktop). Open it, then press **Retry**. hlabs won't set up Colima next to it.
- **Linux with no container runtime:** hlabs shows the command that installs Docker Engine (`curl -fsSL https://get.docker.com | sh`). Run it in a terminal, then press **Retry**. hlabs never runs it for you.
- **Linux, "No access":** your account isn't in the `docker` group yet. Run `sudo usermod -aG docker $USER`, log out and back in, then press **Retry**.

### If setting up the container runtime fails

You'll see **Something needs attention**. hlabs removes anything it had set up, so nothing on your computer has changed. The message under **Container runtime** says what went wrong and what to do; for example, a download that timed out usually means checking your internet connection.

- **Retry** looks for a container runtime again first. If you've installed OrbStack or Docker Desktop in the meantime, hlabs uses it; otherwise it sets up Colima again.
- **View full log** shows everything the setup did, with a **Copy** button for sharing it when you ask for help.

### Name on your network

Under the checks, **Name on your network** is the name phones and computers use to reach hlabs, followed by `.local`. It starts as `hlabs`, so hlabs opens at `hlabs.local` and each app at a name like `jellyfin.hlabs.local`. Use lowercase letters, numbers and dashes, starting and ending with a letter or number; capitals become lowercase and spaces become dashes as you type. Choose it now: it can't be changed after setup yet.

## Create your admin account

The admin manages apps, people and settings; you can add family members later.

- **Username:** 3–32 lowercase letters, numbers and dashes, starting with a letter. hlabs suggests one from your name.
- **Password:** at least 12 characters, and not one of the most common passwords. The hint under the field says when it's strong enough.

If something needs changing, hlabs says what under that field and how many things are left to fix; each message goes away as soon as the field is right.

Setup creates only one admin. If you see "An admin account already exists. Log in to continue.", the account was already made (perhaps in another tab): log in with it instead.

Closed the browser after creating your admin account? Open setup again: hlabs asks you to log in with that account, then takes you back to the step you were on. From then on your account, not the setup link, is what lets you finish setup, so you can finish it from any browser you log in on.

Once the account is created you're signed in on this browser, and the setup address stops working: from here on, setup continues as you.

## Turn on two-factor login

Two-factor login asks for a 6-digit code from your phone as well as your password, so a leaked password isn't enough to get in. It works with any TOTP authenticator app, such as 1Password, Google Authenticator or Authy.

1. Scan the QR code with the app. If you can't scan it, choose **Can't scan? Enter this key instead** and type or copy the key into the app.
2. Enter the 6-digit code the app shows. hlabs checks it as soon as you type the sixth digit.

If a code doesn't work, check that the time on your phone is set automatically, then try the next code. After 5 codes that don't work, wait 15 minutes. If you reload this page you get a new QR code, and the one you scanned before stops working.

You can also choose **Skip for now**. hlabs warns you first: without two-factor, anyone who learns your password can manage hlabs. You can turn it on later in Account settings.

### Save your recovery codes

When two-factor is on, hlabs shows 10 recovery codes. Each one works once, in place of a code from your phone, if you lose it. **Download** saves them as `hlabs-recovery-codes.txt`; **Copy** puts them on the clipboard. Keep them somewhere safe, away from your phone: hlabs only stores a scrambled form and can't show them again. If you lose them, you can make new ones later in Account settings.

Recovery codes never reset your password.

## Choose where your data lives

Home folders, shared files and media go in one place, the storage location. You can move them later in Settings.

- **This computer** (the default, and the fastest) keeps them in `~/hlabs` in your home folder (`/var/lib/hlabs/storage` on a Linux server). hlabs creates the folders it needs there and never deletes anything already in that folder.
- **External drive** and **Network storage (NAS)** put your files on a connected drive or a network share instead.

### Use an external drive

Choose **External drive**, then pick one of the connected drives hlabs can write to. If none is listed, connect the drive; the list refreshes by itself. hlabs keeps your files in an `hlabs` folder on the drive.

Drives formatted **FAT32** or **exFAT** can't keep file permissions, so some apps may not work with them. If you can, use a drive formatted APFS or Mac OS Extended (Mac) or ext4 (Linux). If the drive is disconnected before you continue, choose it again once it's back.

### Use network storage (NAS)

Choose **Network storage (NAS)**, pick **SMB** or **NFS**, and enter the address as name/share, for example `nas.local/media`. For SMB, also enter the username and password you use for the NAS. hlabs tests the connection first and keeps the password in your computer's keychain.

- **"Can't reach …"**: check the address, and that the NAS is on and on the same network.
- **"Wrong username or password."**: check them in your NAS's user settings.
- **"hlabs can only read this share."**: let that user write to the share on the NAS.
- **NFS on a Mac**: if the NAS only accepts system ports, allow non-privileged ports ("insecure") in its NFS settings, or use SMB.

On a Mac, the share appears in Finder while hlabs uses it.

App databases always stay on this computer for speed, wherever your files go.

## Reach hlabs from anywhere

Next, hlabs shows the address it already has on your home network, ready to use. You can also reach it from your phone or laptop away from home with Tailscale, a free private network, with nothing exposed to the internet.

To connect now, choose **Connect**: Tailscale's log-in page opens in a new tab (or, if Tailscale isn't installed yet, its download page). When you've signed in, the step says **Connected** with your tailnet address; choose **Continue**. If Tailscale is already signed in on this computer, hlabs asks before publishing anything on that tailnet. See [Reach hlabs from anywhere](/help/remote-access/tailscale/).

To do that later, choose **Set up later**. Nothing is set up, and the finish screen says remote access is for your home network only. You can turn it on at any time in **Settings › Network & remote access**.

## Pick a few apps to start

hlabs offers eight popular apps to install right away: Jellyfin, Immich, Nextcloud, Home Assistant, Vaultwarden, Paperless-ngx, Uptime Kuma and Open WebUI. None are picked to start. Select the ones you want (select one again to unpick it), then choose **Install and finish**. The button shows how many you picked.

They install in the background with their usual settings, so setup finishes straight away. Each app's folders go where it suggests, such as Immich's photo library in your Home folder's Photos, and you can change them later in the app's settings. If an app can't be installed, for example because it couldn't be downloaded, it shows on Home as not installed with a way to try again.

An app marked **Needs more memory** recommends more memory than the container engine has free. You can still pick it, but it may be slow or stop. You can give the engine more memory in its own settings.

To install nothing now, choose **Skip**. Hundreds more apps are in the App Store whenever you want them.

## When setup is done

hlabs shows a summary of what was set up: your admin account (and whether two-factor login is on), where your data lives and, if you picked any, the apps installing. hlabs keeps running from the menu bar (in the background on a Linux server). Choose **Open dashboard** to go to Home; you're already signed in. Setup doesn't open again after this.

## "Finish setup on the computer running hlabs."

You'll see this if you open hlabs from another device, such as your phone, before setup is finished. It keeps anyone else on your network from creating the first admin account. Open the setup address on the computer running hlabs instead.

Once setup is finished, the setup address stops working and you log in as usual.
