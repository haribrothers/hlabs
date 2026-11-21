---
title: Install on a Linux server
description: Install hlabs on a Linux computer without a desktop with one command, finish setup from another device, manage it with the hlabs command, and upgrade it the same way.
features: [F-INST-09]
---

For admins: the person who installs hlabs.

## Install

On the server, run:

```sh
curl -fsSL https://hlabs.h4loom.com/install.sh | sh
```

If you're not root, it asks for your password with `sudo`. It prints a line for each thing it does:

1. A line about the server, such as **Ubuntu 24.04 · x86_64 · 16 GB memory · 412 GB free**. If hlabs can't run there, this line has a ✗ and says why.
2. **Docker Engine**: hlabs uses the one you have. Without one, it says **Docker Engine not found, installing from the official repository** and installs it from Docker's own repository.
3. **The hlabs user and its data folder `/var/lib/hlabs`**: hlabs runs as its own user, and your apps' data and files live in this folder.
4. **The systemd service `hlabsd.service`**: hlabs starts on boot.
5. **Started hlabs**, with the web ports it uses.
6. **Announced hlabs.local on your network**, so other devices at home can find it by name.
7. **Finish setup in your browser**, followed by the setup address at `hlabs.local` and at the server's IP address. Open either one from your laptop or phone to [set up hlabs](../set-up/).

If the server can't announce `hlabs.local` (Avahi isn't running), the installer says so and prints only the IP address.

## Find the setup address again

Run `hlabs setup-url` to print the setup addresses again. They keep working until setup is finished; after that, `hlabs setup-url` prints the dashboard's address instead. It works for root, with `sudo`, and for people in the `hlabs` group. Anyone else sees **Run with sudo or add yourself to the hlabs group**.

If a step fails, the line starts with ✗, says what went wrong and points to `/var/log/hlabs-install.log`. Nothing you had is removed. Fix the problem and run the command again.

## What it needs

- Linux with systemd, on an x86_64 or arm64 computer.
- Ubuntu 22.04, Debian 12, Fedora 39, RHEL 9 or newer (anything with OpenSSL 3). On other distributions, install [Docker Engine](https://docs.docker.com/engine/install/) first.
- Ports 80 and 443. If another program uses one of them, hlabs uses 8080 or 8443 instead and says so, for example **Port 443 is used by nginx, using 8443 instead**. Every address hlabs prints then includes the port.

## Manage hlabs from the command line

On a server there's no menu bar, so the `hlabs` command does its job. Run it with `sudo`, or add yourself to the `hlabs` group (`sudo usermod -aG hlabs $USER`, then log in again).

- **`hlabs status`** says what hlabs is doing, like the menu-bar app: whether it's running and how many apps, CPU, memory and free space, the last backup and the dashboard's address. It finishes with exit code 0 when everything is running, 1 when something needs looking at (an app that stopped working, the container engine, a web port another program took) and 2 when hlabs can't be reached.
- **`hlabs logs`** shows what hlabs has been doing, newest last. Add `-f` to keep watching, or `--app immich` for one app's logs.
- **`hlabs reset-password`** sets a new password for someone who forgot theirs. It only works with `sudo`, because being root on the server proves you can get to it. Choose the account, type the new password twice (at least 12 characters, and not a common one) and, if the account has two-factor, say whether to turn it off. They're signed out everywhere and log in with the new password.
- **`hlabs setup-url`** prints the setup addresses until setup is finished.

## Check what you download

The installer checks hlabs against `SHA256SUMS`, and that file against its signature by the hlabs key, before it installs anything. If either doesn't match, it stops and installs nothing.

## Upgrade

Run the same command again. hlabs stops, the new version goes in next to the old one, and hlabs starts again. Your apps, files and settings stay. hlabs can also [update itself](../updates/).
