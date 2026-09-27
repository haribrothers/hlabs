# 13 · Website and help

The public website for hlabs and its help documentation, built from `apps/site` in the monorepo (D-055). People who haven't installed hlabs yet use it to learn what hlabs is, browse the apps and download it; people who have installed it use the help pages to set things up and fix problems, often by following a "Learn more" link from the dashboard.

**Screens:** none yet. The site follows the hlabs design system (Dusk wallpaper, glass surfaces, Plus Jakarta Sans) on a light and a dark theme; page designs are a follow-up (Q-08).
**Depends on:** 01-install-tray.md (downloads, install script), 05-app-store.md (store manifests), 11-system-states.md (error pages that link to help), and the release pipeline in docs/prd/11-testing-release.md.

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-SITE-01 | Product website: home, features, download | P2 | 6 | — |
| F-SITE-02 | App catalogue generated from `store/` | P2 | 6 | — |
| F-SITE-03 | Help and documentation (guides, troubleshooting, search, release notes) | P2 | 6 | — |
| F-SITE-04 | Links from the dashboard to help | P2 | 6 | — |
| F-SITE-05 | Keeping the docs current and open | P2 | 7 | — |

## User stories

### US-SITE-01 · Understand hlabs from the home page
**Feature:** F-SITE-01 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** a new user, **I want** a home page that says what hlabs is and what I need, **so that** I can decide whether to install it.

**Acceptance criteria**
- **Given** I open the site's home page, **then** it shows the hlabs lockup, the headline "Your own cloud, at home", a one-sentence description, a "Download" primary button and a "Read the docs" secondary button.
- **Given** the home page, **then** it shows a screenshot of Home with the Dock, a row of the apps from the built-in store (logos, linking to their catalogue pages), and short sections for Apps, Files, Backups, Remote access and Family, each linking to its help page.
- **Given** the "What you need" section, **then** it lists: a Mac with Apple silicon (Intel supported if the engine runs) running macOS 14 Sonoma or later, or a Linux machine with systemd (Ubuntu 22.04+, Debian 12+ or Fedora 40+, x86_64 or arm64); 8 GB memory recommended; a container engine is set up for you if missing (NFR-COMP-01, NFR-COMP-02).
- **Given** the footer, **then** it links to GitHub, the licence (AGPL-3.0), the docs licence (CC BY 4.0), Privacy and Release notes.
- **Given** any page, **then** it passes axe with no violations, text contrast is at least 4.5:1 on both themes, and it works without JavaScript except search.

**Implementation notes**
- UI: Astro pages in `apps/site/src/pages`, styled with the `packages/ui` tokens (CSS variables and the Tailwind preset) and `@hlabs/icons` SVGs; no React needed except islands for search.
- Edge: the headline and copy follow the voice rules in docs/design/README.md.

### US-SITE-02 · Download the right build for my computer
**Feature:** F-SITE-01 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** a new user, **I want** the download page to offer the right file for my computer, **so that** I don't have to work out which one I need.

**Acceptance criteria**
- **Given** I open `/download` on a Mac, **then** the first option is "Download for Mac (Apple silicon)" linking to the latest stable `hlabs-<v>-mac-arm64.dmg`; "Intel Mac" is a secondary link.
- **Given** I open it on Linux or any other system, **then** the first option is the Linux server command `curl -fsSL https://<site>/install.sh | sh` with a "Copy" button, followed by `.deb`, `.rpm` and `.AppImage` links for desktops.
- **Given** any option, **then** it shows the version, release date, file size and SHA-256 checksum, and a link to "All downloads and older versions" (GitHub Releases).
- **Given** the "Beta" toggle, **when** I turn it on, **then** the links switch to the latest `beta` release and a note says "Beta builds may have bugs. You can switch back to stable in Settings › Updates."
- **Given** a new stable release is published, **when** the site next builds (triggered by `release.yml`), **then** the download page shows it within 15 minutes.

**Implementation notes**
- Data: at build time the site reads the release list from the GitHub API (or the `latest.json` update manifests) into `src/data/releases.json`; no client-side calls to GitHub.
- Edge: OS detection uses `navigator.userAgentData`/user agent only to choose which option is first; every option is always visible.

### US-SITE-03 · Browse the app catalogue
**Feature:** F-SITE-02 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** a new user, **I want** to see which apps hlabs can install, **so that** I know it does what I need before I install it.

**Acceptance criteria**
- **Given** I open `/apps`, **then** I see every app in the built-in store with its logo, name, one-line description and category, grouped by the store's categories in the store's order.
- **Given** the category chips at the top, **when** I pick one, **then** only that category's apps show and the URL becomes `/apps?category=<id>`.
- **Given** an app whose manifest `platforms` lacks `linux/arm64` or `linux/amd64`, or whose `tags` include `apple-silicon`, **then** its card shows that in a Badge ("x86 only", "Best on Apple silicon").
- **Given** an app is added to or removed from `store/apps`, **when** the site builds, **then** the catalogue reflects it without any hand edits.

**Implementation notes**
- Data: an Astro content collection loader reads `store/apps/*/hlabs-app.yml` through `@hlabs/app-manifest` (the same schema the daemon uses) and copies logos and screenshots.
- UI: logos rendered like `AppLogo` (manifest logo, gradient fallback).

### US-SITE-04 · Read an app's page
**Feature:** F-SITE-02 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** a new user, **I want** a page for each app, **so that** I can see what it does and what it needs.

**Acceptance criteria**
- **Given** I open `/apps/<appId>`, **then** it shows the logo, name, developer, description, screenshots, category, the app's own website and source links, and its licence from the manifest.
- **Given** the "What it needs" block, **then** it shows the manifest's memory hint, storage folders it asks for, and permissions (for example "Reaches the internet: needed for metadata").
- **Given** the "Install" button, **then** it explains "Open the App Store in your hlabs dashboard and search for <App>", with a link to the install guide; the site never talks to a hlabs server.
- **Given** a manifest without screenshots, **then** the screenshots row is hidden rather than empty.

**Implementation notes**
- Data: same collection as US-SITE-03; page generated with `getStaticPaths`.
- Edge: descriptions are Markdown from the manifest, rendered with raw HTML disabled.

### US-SITE-05 · Install on Linux with the command from the site
**Feature:** F-SITE-01 · **Priority:** P2 · **Phase:** 6 · **Screens:** `LinuxInstall`
**As** a new user with a Linux server, **I want** the one-line install command to come from the hlabs site, **so that** I can trust what I'm running.

**Acceptance criteria**
- **Given** `https://<site>/install.sh`, **when** it is requested, **then** it returns the exact `scripts/install.sh` from the tagged stable release, served as `text/plain` with a `Cache-Control` of at most 5 minutes.
- **Given** `https://<site>/install.sh.sha256` and `install.sh.sig`, **then** they match the script and the release signing key, and the install guide shows how to verify them before running.
- **Given** the install script, **when** it downloads hlabs, **then** it fetches from GitHub Releases and verifies checksums and the signature (01-install-tray US-INST-23), so a compromised site alone can't serve a bad build.
- **Given** a beta channel, **then** `https://<site>/install.sh?channel=beta` is not supported; beta is chosen with `sh -s -- --channel beta`.

**Implementation notes**
- The site build copies `scripts/install.sh` from the release tag, never from `main`.
- Replaces the `[INSTALL SCRIPT URL]` placeholder in `LinuxInstall` and US-INST-23.

### US-SITE-06 · Follow a step-by-step install guide
**Feature:** F-SITE-03 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** a new user, **I want** a guide for my platform, **so that** I get from download to my first app without getting stuck.

**Acceptance criteria**
- **Given** the "Install" section, **then** it has pages "Install on a Mac", "Install on a Linux server", "Install on a Linux desktop" and "Uninstall", each in numbered steps with a screenshot per step.
- **Given** the Mac guide, **then** it covers the disk image, first launch, the menu-bar icon, the container engine (OrbStack/Colima/Docker Desktop, with Colima installed for you) and onboarding in the browser.
- **Given** each guide, **then** it ends with "Install your first app" and links to the Apps guide.
- **Given** a step that differs by engine or distro, **then** it uses tabs (for example "Colima · OrbStack · Docker Desktop") and remembers the last tab chosen on that device.

**Implementation notes**
- UI: Starlight content in `apps/site/src/content/docs/install/`, Starlight `<Steps>` and `<Tabs>`.
- Copy matches the product copy in `apps/web/src/copy` (button names in bold, exactly as shown).

### US-SITE-07 · Find help for every part of hlabs
**Feature:** F-SITE-03 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** anyone who uses hlabs, **I want** help pages organised like the product, **so that** I can find the page for what I'm looking at.

**Acceptance criteria**
- **Given** `/docs`, **then** the sidebar has, in order: Get started, Install, Home and the Dock, Apps and the App Store, Files, Backups and restore, Remote access, People and family, Settings, Menu-bar app, Troubleshooting, Reference (CLI, app manifest, custom apps), FAQ.
- **Given** each product area, **then** there is at least one page per feature in docs/features (the feature ids are listed in the page's front matter as `features: [F-FILE-01, …]`).
- **Given** a page, **then** it shows "Last updated <date>" (from git), an "Edit this page on GitHub" link, and previous/next links.
- **Given** a family member's task (open an app, upload files, change password), **then** its page says at the top whether it's for everyone or admins only.

**Implementation notes**
- CI fails if a P1 or P2 feature id from docs/features has no help page (`pnpm site:check`).
- Reference pages for the manifest are generated from the `@hlabs/app-manifest` Zod schema.

### US-SITE-08 · Search the help
**Feature:** F-SITE-03 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** anyone who uses hlabs, **I want** to search the help, **so that** I find answers without browsing.

**Acceptance criteria**
- **Given** any help page, **when** I press "/" or ⌘K or click "Search", **then** a search dialog opens with focus in the field.
- **Given** I type "backup nas", **then** matching pages list with the matched heading and a snippet, the best match first, within 200 ms after the index has loaded.
- **Given** no results, **then** it says "No results for "<query>"" and links to Troubleshooting and GitHub Discussions.
- **Given** search, **then** it runs entirely in the browser; no query leaves the device.

**Implementation notes**
- Starlight's built-in Pagefind index, built at deploy.

### US-SITE-09 · Fix a problem from an error message
**Feature:** F-SITE-03 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** an admin, **I want** a troubleshooting page for each error hlabs can show, **so that** I can fix it myself.

**Acceptance criteria**
- **Given** the Troubleshooting section, **then** there is a page for each system state in 11-system-states (engine stopped, daemon not running, update rolled back, certificate not trusted, port in use, disk full, NAS unreachable) with: what it means, what to try (in order), and how to collect diagnostics ("Copy diagnostics" in the menu-bar app, `hlabs logs`).
- **Given** each error code in the API error catalogue that the dashboard can show, **then** `/docs/errors/<code>` exists with the same title the dashboard shows.
- **Given** a troubleshooting page, **then** it ends with "Still stuck?" linking to GitHub Discussions and the issue template.

**Implementation notes**
- `pnpm site:check` compares `packages/api` error codes with `src/content/docs/errors/*`.

### US-SITE-10 · Open the right help page from the dashboard
**Feature:** F-SITE-04 · **Priority:** P2 · **Phase:** 6 · **Screens:** `CertGuide`, `SysEngineStopped`, `InstallFailed`, `NoAccess`
**As** anyone who uses hlabs, **I want** "Learn more" links in the dashboard and menu-bar app to open the matching help page, **so that** help is one click away.

**Acceptance criteria**
- **Given** a "Learn more" or "Help" link anywhere in the dashboard, tray or CLI output, **when** I open it, **then** it opens `https://<site>/docs/<slug>` for the version I'm running in a new tab.
- **Given** the list of help slugs in `packages/shared/src/help.ts`, **when** CI runs, **then** it fails if any slug has no page on the site.
- **Given** an error toast or page with an error code, **then** it has a "Learn more" link to `/docs/errors/<code>`.
- **Given** a machine with no internet, **then** the link still opens (the browser shows its own offline page); hlabs never embeds the site.

**Implementation notes**
- `helpUrl(slug)` in `@hlabs/shared`; the dashboard, tray and CLI use only this helper. Base URL from one constant (D-055).
- Edge: links open with `rel="noopener"`; no tracking parameters are added.

### US-SITE-11 · Keep screenshots in the docs current
**Feature:** F-SITE-05 · **Priority:** P2 · **Phase:** 7 · **Screens:** —
**As** the maintainer, **I want** docs screenshots generated from the real product, **so that** they never show an old design.

**Acceptance criteria**
- **Given** the Playwright e2e run on `main`, **when** a test calls `docsShot('<name>')`, **then** it saves a 1440×900 (desktop) or 390×844 (phone) WebP into `apps/site/src/assets/shots/`.
- **Given** a screenshot changes by more than 1% of pixels, **then** the bot opens a PR with the new images instead of committing to `main`.
- **Given** screenshots, **then** they use a seeded demo data set (the names and apps from the design canvas), never real user data.

**Implementation notes**
- A helper in `apps/web/e2e/support/docs-shot.ts`; `site.yml` builds after the shots PR merges.

### US-SITE-12 · Visit a private, accessible site
**Feature:** F-SITE-05 · **Priority:** P2 · **Phase:** 6 · **Screens:** —
**As** a visitor, **I want** the site to respect my privacy and work with assistive technology, **so that** I can trust it like the product.

**Acceptance criteria**
- **Given** any page, **then** it sets no cookies, loads no analytics, trackers or third-party scripts, and self-hosts its fonts (hlabs has no telemetry, 00-overview).
- **Given** the Privacy page, **then** it says the site has no analytics or cookies and that the host keeps standard access logs for up to 30 days.
- **Given** my system prefers dark or light, **then** the site follows it, with a toggle that is remembered in that browser; Reduce motion turns off all animation.
- **Given** keyboard use, **then** a "Skip to content" link is first, all controls are reachable, and focus is always visible.
- **Given** CI, **then** axe runs on every page template and Lighthouse accessibility is 100 on the home, download and one help page.

**Implementation notes**
- Security headers from the host config: CSP without `unsafe-inline` scripts, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS.

### US-SITE-13 · Read release notes
**Feature:** F-SITE-03 · **Priority:** P2 · **Phase:** 6 · **Screens:** `SettingsUpdates`
**As** an admin, **I want** release notes on the site, **so that** I know what changes before I update.

**Acceptance criteria**
- **Given** `/releases`, **then** each version shows its date, channel (stable or beta) and changes grouped as New, Improved, Fixed, and any "Before you update" notes, newest first.
- **Given** "What's new" in Settings › Updates or the menu-bar app, **then** it links to `/releases#<version>`.
- **Given** a release is tagged, **then** its notes come from the Changesets changelog without hand copying.

**Implementation notes**
- `release.yml` writes `apps/site/src/content/releases/<version>.md` from the Changesets output and triggers `site.yml`.

### US-SITE-14 · Suggest a change to the docs
**Feature:** F-SITE-05 · **Priority:** Polish · **Phase:** 9 · **Screens:** —
**As** a community member, **I want** to fix or improve a help page, **so that** the docs get better for everyone.

**Acceptance criteria**
- **Given** "Edit this page on GitHub", **when** I click it, **then** it opens the page's Markdown in the GitHub editor on `main`.
- **Given** a PR that only touches `apps/site/src/content`, **then** CI runs only the site build, link check and `site:check`, and deploys a preview URL posted on the PR.
- **Given** the docs, **then** `apps/site/CONTRIBUTING.md` explains the voice, screenshot rules and that docs are CC BY 4.0.

**Implementation notes**
- Turborepo filters (`--filter=@hlabs/site...`) keep docs-only PRs fast.

## API additions
None. The site never calls a hlabs server. Adds `helpUrl(slug)` to `@hlabs/shared` (US-SITE-10).
