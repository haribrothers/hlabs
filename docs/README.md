# hlabs product docs

hlabs is a home cloud OS for macOS and Linux: an App Store for self-hosted apps, files, backups and remote access, behind one calm, glassy dashboard. These docs are the product requirements, written to be built from with Claude Code.

## Read in this order
1. [prd/00-overview](prd/00-overview.md): what and why, goals, non-goals, personas
2. [prd/01-tech-stack](prd/01-tech-stack.md)
3. [prd/02-architecture](prd/02-architecture.md): components, process model, app lifecycle, networking, auth flow, backups, updates
4. [prd/03-monorepo](prd/03-monorepo.md): repo layout, dependency rules, scripts
5. [prd/04-data-model](prd/04-data-model.md) · [prd/05-api](prd/05-api.md) · [prd/06-app-manifest](prd/06-app-manifest.md) · [prd/07-security](prd/07-security.md): the contracts
6. [prd/08-non-functional](prd/08-non-functional.md) · [prd/09-design-system](prd/09-design-system.md)
7. [prd/10-phases](prd/10-phases.md): build order, deliverables, done-when
8. [prd/11-testing-release](prd/11-testing-release.md) · [prd/12-decisions](prd/12-decisions.md) · [prd/13-risks-open-questions](prd/13-risks-open-questions.md) · [prd/14-glossary](prd/14-glossary.md)

## Features and user stories
125 features and 337 user stories across 13 modules. Each story has an id, priority, phase, the screens it covers, acceptance criteria and implementation notes.

| File | Module | Stories |
| --- | --- | --- |
| [01-install-tray](features/01-install-tray.md) | Install & menu-bar app | 27 |
| [02-onboarding](features/02-onboarding.md) | Onboarding | 24 |
| [03-sign-in](features/03-sign-in.md) | Sign in | 24 |
| [04-home](features/04-home.md) | Home | 23 |
| [05-app-store](features/05-app-store.md) | App Store & installing | 22 |
| [06-apps](features/06-apps.md) | Using & managing apps | 23 |
| [07-files](features/07-files.md) | Files | 24 |
| [08-usage-backups](features/08-usage-backups.md) | Live usage & backups | 34 |
| [09-account-people](features/09-account-people.md) | Settings · account & people | 35 |
| [10-system-settings](features/10-system-settings.md) | Settings · system | 41 |
| [11-system-states](features/11-system-states.md) | System states | 22 |
| [12-phone](features/12-phone.md) | Phone | 24 |
| [13-site](features/13-site.md) | Website and help | 14 |

## Design
[design/](design/): brand book, motion, tokens, 25 component specs with a reference implementation, logos, and all 115 screens with images ([design/screens.md](design/screens.md)).

## Already built
`packages/icons` (`@hlabs/icons`) is included and tested: Lucide re-exports, the filled tab-bar glyphs, `LogoMark`/`LogoLockup`, `AppLogo` with fallback, `FileIcon` (Papirus file and folder icons, `@hlabs/icons/files`), the manifest icon schema, and app-icon and tray PNGs. Wire it into the workspace in phase 0.

## Website and help
The public website and user help live in `apps/site` (D-055, [features/13-site](features/13-site.md)). This `docs/` folder is the build spec, not user help.

## Progress
[progress.md](progress.md): one checkbox per story, grouped by phase.
