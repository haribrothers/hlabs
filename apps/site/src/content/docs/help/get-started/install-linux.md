---
title: Install on a Linux server
description: Install hlabs on a Linux computer without a desktop with one command, and upgrade it the same way.
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

If a step fails, the line starts with ✗, says what went wrong and points to `/var/log/hlabs-install.log`. Nothing you had is removed. Fix the problem and run the command again.

## What it needs

- Linux with systemd, on an x86_64 or arm64 computer.
- Ubuntu 22.04, Debian 12, Fedora 39, RHEL 9 or newer (anything with OpenSSL 3). On other distributions, install [Docker Engine](https://docs.docker.com/engine/install/) first.
- Ports 80 and 443. If another program uses one of them, hlabs uses 8080 or 8443 instead and says so, for example **Port 443 is used by nginx, using 8443 instead**. Every address hlabs prints then includes the port.

## Check what you download

The installer checks hlabs against `SHA256SUMS`, and that file against its signature by the hlabs key, before it installs anything. If either doesn't match, it stops and installs nothing.

## Upgrade

Run the same command again. hlabs stops, the new version goes in next to the old one, and hlabs starts again. Your apps, files and settings stay. hlabs can also [update itself](../updates/).
