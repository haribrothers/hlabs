# 00 · Overview

## What hlabs is
hlabs is a home cloud OS that runs on a computer you already own: a Mac (mini, laptop or desktop) or a Linux machine. It turns that computer into a private cloud for the household: install self-hosted apps (photos, media, passwords, documents, home automation, local AI) from an App Store with one click, reach them from any device at home or away, share them with family, and keep everything backed up.

It looks and feels like a calm, glassy OS (in the spirit of umbrelOS) rather than a server admin panel. People never need to know Docker exists.

## Problem
Self-hosting is powerful but fiddly: Docker commands, compose files, port clashes, reverse proxies, TLS certificates, VPNs, backups and updates are each a project. Existing tools are either appliance OSes that need dedicated hardware (umbrelOS), or developer-oriented platforms (Coolify, Runtipi) that assume comfort with servers. There's nothing that installs like a normal Mac app, starts at login and makes a home cloud feel as easy as the App Store.

## Goals
1. **Install like any app.** A signed `.dmg` on macOS and a one-line script on Linux. Starts at login. Setup to first running app in under 10 minutes on a clean machine.
2. **One-click apps.** Curated App Store; installs, updates with automatic rollback, and uninstalls without the user touching Docker.
3. **Private by default.** Everything stays in the house. Remote access through Tailscale only; no public exposure; no telemetry.
4. **Safe data.** Encrypted, scheduled backups to a NAS, drive or cloud bucket, with tested restore.
5. **Family ready.** Multiple users, per-app access, per-user Home folders, 2FA.
6. **Beautiful and accessible.** The hlabs design system (glass surfaces, Dusk wallpaper, a macOS-style Dock on desktop and a Liquid Glass tab bar on phones) with 4.5:1 text contrast, reduce motion and reduce transparency.

## Non-goals (v1)
- Windows hosts, Raspberry Pi OS images, dedicated appliance OS images.
- Multi-machine clusters, high availability, Kubernetes.
- Exposing apps to the public internet (port forwarding, Tailscale Funnel, dynamic DNS).
- Email (no SMTP; no email-based password reset).
- A native mobile app (the dashboard is a responsive PWA).
- Building apps from source or Dockerfiles (custom apps are compose files only, P3).
- A web terminal or a public API for third parties (MCP access for AI assistants is P3 and scoped).
- Telemetry or usage analytics of any kind.

## Licence
hlabs is open source under **AGPL-3.0**, developed in a public GitHub repository (D-047).

## Personas
| Persona | Who | Needs |
| --- | --- | --- |
| **The admin** (primary) | Tech-comfortable person at home, e.g. a software engineer with a Mac mini and a NAS | Fast setup, sane defaults, control when wanted (logs, config, engine), trust that backups work |
| **The family member** | Partner, parent, kid | Just open the photo app or the media server; their own private files; never see settings they can't use |
| **The tinkerer** (secondary) | Admin on a Linux box or experimenting with new apps | Custom app sources, deploy their own compose app, headless install, AI access via MCP |

## Key user journeys
1. **First run:** download → drag to Applications → open → menu-bar icon appears → browser opens onboarding → system check → admin account + 2FA → storage → remote access → starter apps → Home.
2. **Install an app:** App Store → app details → install sheet (folders, address) → progress → open.
3. **Reach it away from home:** phone with Tailscale → `https://hlabs.<tailnet>.ts.net` → log in → open app.
4. **Add family:** Settings › Users → invite → share link → they pick a username/password → they see only shared apps.
5. **Something broke:** notification → app settings → logs → restart, or update rolled back automatically.
6. **Disaster:** new machine → onboarding → "Restore from a backup" (P3) or Backups › Restore.

## Success metrics (local-only, measured in testing, never collected from users)
| Metric | Target |
| --- | --- |
| Clean install to first app running (Mac, engine already present) | ≤ 10 min, ≤ 12 clicks |
| App install success rate across the built-in store (CI matrix) | ≥ 98% |
| Scheduled backup success over a 30-day soak test | ≥ 99% |
| Dashboard cold load on LAN (Mac mini M1) | ≤ 1.5 s to interactive |
| Daemon idle footprint | ≤ 150 MB RSS, ≤ 1% CPU |
| Accessibility | WCAG 2.2 AA on every P1 screen (axe clean + manual keyboard pass) |

## Where things are
- Architecture and contracts: [02-architecture](02-architecture.md), [04-data-model](04-data-model.md), [05-api](05-api.md), [06-app-manifest](06-app-manifest.md), [07-security](07-security.md).
- What to build: [features/](../features/) (12 modules, 120 features, 322 user stories).
- In what order: [10-phases](10-phases.md).
- How it looks: [09-design-system](09-design-system.md) and [../design/](../design/).
