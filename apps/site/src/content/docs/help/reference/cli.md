---
title: The hlabs command
description: Every hlabs command on a Linux server, with its options and what it prints.
features: [F-INST-09]
---

For admins of a Linux server. The `hlabs` command does there what the menu-bar app does on a Mac or a Linux desktop. It talks to hlabs on the same computer only.

Run it with `sudo`, or add yourself to the `hlabs` group (`sudo usermod -aG hlabs $USER`, then log in again). Anyone else sees **Run with sudo or add yourself to the hlabs group**.

## `hlabs status`

How hlabs is doing: whether it's running and how many apps, CPU, memory and free space, the last backup and the dashboard's address.

| Exit code | Means |
| --- | --- |
| 0 | Everything is running. |
| 1 | Something needs looking at: an app that stopped working, the container engine, or a port another program took. |
| 2 | hlabs can't be reached. |

## `hlabs logs`

What hlabs has been doing, newest last.

| Option | Does |
| --- | --- |
| `-f` | Keep watching, also when the log moves on to a new file. |
| `--app <id>` | One app's logs instead, such as `--app immich`. |

## `hlabs setup-url`

Where to finish setup, at `hlabs.local` and each address of this computer, until setup is finished; after that, the dashboard's address.

## `hlabs reset-password`

Sets a new password for someone who forgot theirs. Only with `sudo`, because being root on the server proves you can get to it. It asks which account, the new password twice (at least 12 characters, not a common one) and, for an account with two-factor, whether to turn it off. They're signed out everywhere.

## `hlabs uninstall`

Removes hlabs from this server. Only with `sudo`. See [Uninstall hlabs](../../install/uninstall/).

| Option | Does |
| --- | --- |
| `--keep-data` | Keep `/var/lib/hlabs`, so you can reinstall later. |
| `--delete-everything` | Delete `/var/lib/hlabs` and the `hlabs` user too. |
| `--yes` | Don't ask whether to uninstall, for scripts. |

## `hlabs library`

Makes your own app library: apps hlabs installs and updates from the App Store like its own. See [Make your own app library](../../apps/your-own-library/). You don't need `sudo` for `init`, `add`, `check` and `index`; `keygen` and `sign` ask hlabs, so they need it like the other commands.

| Command | Does |
| --- | --- |
| `hlabs library init <folder>` | Starts a library: a README, `apps/` with an example app, and a GitHub workflow that checks it and rebuilds `index.json` on every push. |
| `hlabs library add <id> [folder]` | Adds `apps/<id>/` with a manifest and compose file to fill in. |
| `hlabs library check [folder]` | Checks every app with the App Store's rules and lists each problem with its file and line, such as `apps/wiki/docker-compose.yml:12 Host networking isn't allowed.` Exit code 1 when an app has a problem. |
| `hlabs library index [folder]` | Writes `index.json` for the apps that pass. A git library needs it. |
| `hlabs library keygen` | Makes a key to sign libraries with and prints its fingerprint. The private key stays in hlabs's keychain. `--replace` makes a new one. |
| `hlabs library sign [folder]` | Signs `index.json`: writes `index.json.sig` and `hlabs-library.pub`. |

The folder is the current one unless you give it.
