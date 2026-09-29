# 10 · Phases and deliverables

Build in this order. Each phase ends with something runnable and reviewable. Don't start a phase until the previous phase's **Done when** list is true. Within a phase, work module by module in the order listed, and within a module in story order; foundations (API, data, services) for a module come before its screens.

A control that needs something from a later phase is **hidden until that phase ships** (D-036); its criteria are tested in the later phase.

Tell Claude Code: *"Implement phase N"* or *"Implement US-XXX-NN"*. Tick stories in `docs/progress.md` as they're done.

| Phase | Name | Stories | Milestone |
| --- | --- | --- | --- |
| 0 | Foundations | 0 |  |
| 1 | Core, first run and sign in | 69 |  |
| 2 | Apps | 38 |  |
| 3 | Remote access and family | 28 |  |
| 4 | Menu-bar app, monitoring and updates | 38 |  |
| 5 | Backups and Files | 30 |  |
| 6 | Distribution | 21 | MVP / 1.0 beta |
| 7 | v1.0 completeness | 54 | 1.0 |
| 8 | Power features (P3) | 23 |  |
| 9 | Nice to have and polish | 35 |  |

## Phase 0 · Foundations

**Goal:** A buildable, tested monorepo with the design system in code. No user-facing features yet.

**Deliverables**
- Monorepo per 03-monorepo: pnpm + Turborepo, all apps/packages scaffolded, shared configs, `pnpm dev` runs daemon + web.
- `packages/db` with the full schema from 04-data-model and the first migration; typed settings.
- `packages/api`: router skeleton for every router in 05-api (procedures stubbed with `NOT_IMPLEMENTED`), Zod schemas, error catalogue, event types.
- Daemon boot sequence (02 §2.3) with `/healthz`, Fastify + tRPC + SSE `events.stream`, job runner with persistence, event bus, pino logging.
- `packages/ui`: tokens.css generated from docs/design/tokens.json, Tailwind 4 preset, glass utilities, themed shadcn primitives, all 23 design-system components ported (with Storybook-free preview route `/dev/ui` in dev only).
- `packages/icons` integrated (from the provided package), `packages/app-manifest` schema + validator + compose renderer with unit tests against 3 sample apps in `store/`.
- Engine detection service (02 §2.4) with a fake engine for tests.
- CI: lint, typecheck, unit tests, `store:lint`, dependency-boundary check.

**Done when**
- [ ] `pnpm install && pnpm dev` opens a web page that renders the Home shell from `packages/ui` with a working Dock (desktop) and tab bar (phone).
- [ ] `pnpm test`, `pnpm lint`, `pnpm typecheck` pass in CI on Linux and macOS.
- [ ] `GET /healthz` returns 200; `events.stream` delivers a test event to the browser.

## Phase 1 · Core, first run and sign in

**Goal:** A fresh install can be onboarded, the admin can sign in with 2FA and see an (empty) Home. Runs from `pnpm dev` on macOS and Linux.

**Deliverables**
- Onboarding flow with setup token, system check, admin + 2FA, storage.
- Sign-in (user list, username form, remembered user, 2FA, lockout).
- Home shell, Dock (tab bar on phone), Settings window shell with Account, password, 2FA.
- System states: daemon unreachable, confirm dialogs, toasts.
- Engine & startup settings.

**Done when**
- [x] A clean data dir → onboarding → Home works end to end in Playwright (`us-onb-22.spec.ts`).
- [x] Sessions, lockout and 2FA pass their unit and e2e tests (`sessions.test.ts`, US-AUTH-08/09/11–14, US-ONB-11–13).

**Stories**

*[Onboarding](../features/02-onboarding.md)*

- US-ONB-01 · Open onboarding automatically on first run (P1)
- US-ONB-02 · See the welcome screen and start setup (P1)
- US-ONB-03 · Resume onboarding where I left off, and only until it's done (P1)
- US-ONB-04 · Run the system check (P1)
- US-ONB-05 · Install Colima automatically when no engine is found (macOS) (P1)
- US-ONB-06 · Recover from a failed system check (P1)
- US-ONB-07 · Get Docker Engine instructions on Linux, and choose start at login (P1)
- US-ONB-08 · Create the admin account (P1)
- US-ONB-09 · See what to fix when the account details are invalid (P2)
- US-ONB-10 · Only allow one admin to be created through onboarding (P1)
- US-ONB-11 · Turn on two-factor login (P1)
- US-ONB-12 · Save recovery codes (P1)
- US-ONB-13 · Skip two-factor for now (P1)
- US-ONB-14 · Keep data on this computer (P1)
- US-ONB-15 · Use an external drive (P1)
- US-ONB-16 · Use network storage (NAS) (P1)
- US-ONB-21 · See a summary when setup is done (P1)
- US-ONB-22 · Finish onboarding and open the dashboard (P1)

*[Sign in](../features/03-sign-in.md)*

- US-AUTH-01 · Pick my account from the user list (P1)
- US-AUTH-02 · Log in as another user or with the list hidden (P1)
- US-AUTH-03 · Log in with username and password (P1)
- US-AUTH-04 · See a clear error when login fails (P1)
- US-AUTH-05 · Open the right login screen (P1)
- US-AUTH-06 · Log back in as the remembered user (P1)
- US-AUTH-07 · Switch to another account (P1)
- US-AUTH-08 · Enter my two-factor code (P1)
- US-AUTH-09 · Log in with a recovery code (P1)
- US-AUTH-10 · Set up two-factor when an admin requires it (P1)
- US-AUTH-11 · Keep two-factor codes in step with the server clock (P1)
- US-AUTH-12 · Pause logins after too many attempts (P2)
- US-AUTH-13 · Tell the admin about repeated failed logins (P2)
- US-AUTH-14 · Stay signed in, or not (P1)
- US-AUTH-15 · Get signed out when my session is revoked (P1)
- US-AUTH-16 · Log out (P1)
- US-AUTH-18 · Return to the app I was opening after login (P1)

*[Home](../features/04-home.md)*

- US-HOME-01 · See a greeting over my wallpaper (P1)
- US-HOME-02 · Glance at system widgets (P1)
- US-HOME-03 · Open my apps from the grid (P1)
- US-HOME-04 · Move between sections with the Dock (P1)
- US-HOME-05 · See badge counts on tabs (P1)

*[Settings · account & people](../features/09-account-people.md)*

- US-ACCT-01 · Settings sections depend on role (P1)
- US-ACCT-02 · Moving around Settings on desktop, phone and keyboard (P1)
- US-ACCT-03 · See and edit my profile (P1)
- US-ACCT-04 · See the devices I am signed in on (P1)
- US-ACCT-05 · Sign out a device, or log out (P1)
- US-ACCT-06 · Change my password (P1)
- US-ACCT-07 · Password change errors (P1)
- US-ACCT-08 · See my two-factor and recovery code status (P1)
- US-ACCT-09 · View, download and print recovery codes (P1)
- US-ACCT-10 · Make new recovery codes (P1)
- US-ACCT-11 · Move two-factor to a new phone (P1)
- US-ACCT-12 · Turn two-factor on or off (P1)

*[Settings · system](../features/10-system-settings.md)*

- US-SYS-17 · See the container engine (P1)
- US-SYS-18 · Restart the container engine (P1)
- US-SYS-19 · Set resources given to apps (P1)
- US-SYS-20 · Control startup behaviour (P1)

*[System states](../features/11-system-states.md)*

- US-STATE-04 · Serve a fallback page when the daemon is down (P1)
- US-STATE-05 · Explain why hlabs can't be reached (P1)
- US-STATE-06 · Retry on a countdown or on demand (P1)
- US-STATE-11 · Confirm an action with the shared dialog (P1)
- US-STATE-12 · Show progress and errors inside the confirm dialog (P1)
- US-STATE-13 · Require a password or typed name for the riskiest actions (P1)
- US-STATE-14 · Show toasts by severity (P1)
- US-STATE-15 · Act on a toast (P1)
- US-STATE-16 · Stack toasts and keep them in sync with notifications (P1)
- US-STATE-17 · Map error codes to plain copy (P1)
- US-STATE-18 · Reconnect the event stream (P1)
- US-STATE-19 · Show an offline banner (P1)
- US-STATE-20 · Send signed-out and forbidden requests to the right place (P1)

## Phase 2 · Apps

**Goal:** Install, open, manage, update and uninstall apps from the built-in store.

**Deliverables**
- App Store home and details, install sheet, install job with progress, failure and retry.
- Caddy routing with forward auth and mDNS hostnames per app.
- App window, settings overview, logs, uninstall.
- Update with automatic rollback.
- Home app tiles with live states and app menu; ⌘K search; starter apps in onboarding; engine-stopped state.
- Built-in store seeded with 14 apps (Immich, Jellyfin, Nextcloud, Vaultwarden, Home Assistant, Paperless-ngx, AdGuard Home, Uptime Kuma, Syncthing, Open WebUI, Audiobookshelf, Mealie, n8n, Gitea) (D-048).

**Done when**
- [ ] Each seeded app installs, opens at `https://<app>.hlabs.local`, restarts and uninstalls in the CI matrix (Linux).
- [ ] A deliberately broken update rolls back automatically.

**Stories**

*[Onboarding](../features/02-onboarding.md)*

- US-ONB-19 · Pick starter apps (P1)
- US-ONB-20 · Skip starter apps (P1)

*[Home](../features/04-home.md)*

- US-HOME-06 · Recognise each app's state on its tile (P1)
- US-HOME-07 · Act on an app from its menu (P1)
- US-HOME-08 · Recover a stopped or broken app from its tile (P1)
- US-HOME-09 · Open search from anywhere (P1)
- US-HOME-10 · Find apps, actions, files, settings and store apps in one list (P1)
- US-HOME-23 · See which apps are open in the Dock (P2)

*[App Store & installing](../features/05-app-store.md)*

- US-STORE-01 · Browse the store home (P1)
- US-STORE-02 · Navigate with the categories sidebar (P1)
- US-STORE-03 · Search from the store home (P1)
- US-STORE-06 · See an app's details before installing (P1)
- US-STORE-07 · See requirements and what an app can access (P1)
- US-STORE-08 · Choose folder access in the install sheet (P1)
- US-STORE-09 · Review included services, address and login (P1)
- US-STORE-10 · Fill in app settings and accept risky permissions (P1)
- US-STORE-11 · Run an install as a job (P1)
- US-STORE-12 · Watch install progress (P1)
- US-STORE-13 · Understand why an install failed (P1)
- US-STORE-14 · Retry or remove a failed install (P1)
- US-STORE-17 · Roll back an update that doesn't start (P1)

*[Using & managing apps](../features/06-apps.md)*

- US-APP-01 · Open an app in a window (P1)
- US-APP-02 · App window controls (P1)
- US-APP-03 · Opening an app that isn't running (P1)
- US-APP-04 · See an app's status and start, stop or restart it (P1)
- US-APP-05 · App address and tailnet address (P1)
- US-APP-06 · Behaviour switches (P1)
- US-APP-07 · Storage, resources and version (P1)
- US-APP-08 · Follow an app's logs live (P1)
- US-APP-09 · Filter logs (P1)
- US-APP-10 · Download logs (P1)
- US-APP-11 · Confirm uninstall and choose what happens to data (P1)
- US-APP-12 · Uninstall runs and cleans up (P1)

*[System states](../features/11-system-states.md)*

- US-STATE-08 · Grey out Home when the engine has stopped (P1)
- US-STATE-09 · Start the engine from the banner (P1)
- US-STATE-10 · Recover automatically when the engine comes back (P1)

*[Sign in](../features/03-sign-in.md)*

- US-AUTH-19 · See a "no access" page for apps not shared with me (P1)
- US-AUTH-17 · Protect every app with forward auth (P1)

## Phase 3 · Remote access and family

**Goal:** Reach hlabs from anywhere through Tailscale and share it with family.

**Deliverables**
- Tailscale connect in onboarding and Settings › Network; Tailscale Serve for dashboard and apps.
- Users, invites, accept invite, apps access, member Home and member Settings.

**Done when**
- [ ] A member invited by link can log in and open only the apps shared with them, on LAN and on the tailnet.
- [ ] `/auth/verify` denies a member an app they don't have access to.

**Stories**

*[Onboarding](../features/02-onboarding.md)*

- US-ONB-17 · Connect Tailscale for remote access (P1)
- US-ONB-18 · Set up remote access later (P1)

*[Sign in](../features/03-sign-in.md)*

- US-AUTH-23 · Open an invite link (P2)
- US-AUTH-24 · Create my account from an invite (P2)

*[Home](../features/04-home.md)*

- US-HOME-11 · See only my shared apps on a member Home (P1)
- US-HOME-12 · See my files and shared-apps summary (P1)

*[Settings · account & people](../features/09-account-people.md)*

- US-ACCT-13 · See everyone who uses hlabs (P2)
- US-ACCT-14 · Give a member a reset-password link (P2)
- US-ACCT-15 · Change role, disable or enable someone (P2)
- US-ACCT-16 · Delete someone (P2)
- US-ACCT-17 · Manage pending invites (P2)
- US-ACCT-18 · Choose what the log-in screen shows (P2)
- US-ACCT-19 · Require two-factor for everyone (P2)
- US-ACCT-20 · Decide what members can do (P2)
- US-ACCT-21 · Create an invite link (P1)
- US-ACCT-22 · Choose the invitee's role and apps (P1)
- US-ACCT-23 · Preview the invite page (P1)
- US-ACCT-24 · Choose which apps a member can open (P1)
- US-ACCT-25 · Shared folder and live usage for a member (P1)
- US-ACCT-26 · Access changes apply straight away (P1)
- US-ACCT-27 · Member sees a limited Settings (P1)
- US-ACCT-28 · Member's account page (P1)

*[Settings · system](../features/10-system-settings.md)*

- US-SYS-01 · See how hlabs is reached on the home network (P1)
- US-SYS-02 · Connect remote access with Tailscale (P1)
- US-SYS-03 · Disconnect remote access (P1)
- US-SYS-04 · See each app's tailnet address (P1)
- US-SYS-05 · See and change web ports (P1)
- US-SYS-06 · Use Pi-hole for DNS (P1)

## Phase 4 · Menu-bar app, monitoring and updates

**Goal:** hlabs runs like a real Mac app: menu-bar status, quick actions, password reset, self-update; live usage and hlabs updates.

**Deliverables**
- Tauri tray (macOS) with states, stats, quick actions, reset password (local auth), forgot-password guidance.
- Live usage with charts.
- hlabs updates (channel, check, apply) and the updating state.

**Done when**
- [ ] Tray shows correct state through daemon restart, engine stop and update.
- [ ] A signed test update installs and rolls back on failure.

**Stories**

*[Install & menu-bar app](../features/01-install-tray.md)*

- US-INST-01 · First launch installs the background service (P1)
- US-INST-02 · First launch hands off to onboarding in the browser (P1)
- US-INST-05 · See status at a glance (P1)
- US-INST-06 · Open the dashboard and copy its address (P1)
- US-INST-07 · Back up now from the menu (P1)
- US-INST-08 · Pause and resume all apps (P1)
- US-INST-09 · Start at login (P1)
- US-INST-10 · Quit hlabs (P1)
- US-INST-11 · Starting state (P1)
- US-INST-12 · Container engine stopped (P1)
- US-INST-13 · Can't reach hlabs (P1)
- US-INST-14 · Menu-bar icon reflects state (P1)
- US-INST-15 · Tray authenticates to the daemon with a local token (P1)
- US-INST-16 · Recover from a missing or mismatched tray token (P1)
- US-INST-17 · Choose an account and a new password (P1)
- US-INST-18 · Confirm with the OS and apply the reset (P1)
- US-INST-19 · Check for hlabs updates (P1)
- US-INST-20 · Restart to update (P1)

*[Sign in](../features/03-sign-in.md)*

- US-AUTH-20 · Understand how to reset a forgotten password (P2)
- US-AUTH-21 · Recovery codes never reset a password (P2)
- US-AUTH-22 · Set a new password from an admin's reset link (P2)

*[Live usage & backups](../features/08-usage-backups.md)*

- US-USE-01 · See host CPU, memory, storage and network at a glance (P1)
- US-USE-02 · Tiles update live and respect who may see them (P1)
- US-USE-03 · Change the time range (P1)
- US-USE-04 · Read a metric's history and its peak (P1)
- US-USE-05 · Use the charts with a keyboard and screen reader (P1)
- US-USE-06 · Sort the per-app table (P1)
- US-USE-07 · See stopped and failing apps in the table (P1)
- US-USE-08 · Sample host and app usage every 5 seconds (P1)
- US-USE-09 · Keep usage history at the right resolution (P1)

*[Settings · system](../features/10-system-settings.md)*

- US-SYS-23 · Update hlabs (P1)
- US-SYS-24 · Check for updates now (P1)
- US-SYS-25 · Update apps from Settings (P1)
- US-SYS-26 · Choose automatic updates (P1)

*[System states](../features/11-system-states.md)*

- US-STATE-07 · Show the daemon-down state in the tray (P1)
- US-STATE-01 · Show a full-screen updating state (P1)
- US-STATE-02 · Reconnect automatically when the update finishes (P1)
- US-STATE-03 · Handle a failed or stuck update (P1)

## Phase 5 · Backups and Files

**Goal:** Data is safe and reachable: encrypted backups with restore, and a Files app.

**Deliverables**
- Backups overview, destinations (local, SMB/NFS, S3), schedule, run now, restore choose and progress.
- Files browser, preview, resumable uploads, network drives.
- Trash service (backend) used by uploads and deletes.

**Done when**
- [ ] Backup → wipe app data → restore returns the app to the same state (e2e with Vaultwarden and Paperless).
- [ ] Uploads resume after a dropped connection.

**Stories**

*[Files](../features/07-files.md)*

- US-FILE-01 · See my places in the sidebar (P2)
- US-FILE-02 · Browse a folder in grid view (P2)
- US-FILE-03 · Create a folder (P2)
- US-FILE-04 · Search files (P2)
- US-FILE-05 · Download files (P2)
- US-FILE-06 · Preview a file (P2)
- US-FILE-07 · Open a file with an app (P2)
- US-FILE-08 · Upload files with progress (P2)
- US-FILE-09 · Pause, resume and cancel uploads (P2)
- US-FILE-10 · Handle name conflicts when uploading (P2)
- US-FILE-11 · Connect an SMB or NFS drive (P2)
- US-FILE-12 · Disconnect or recover a network drive (P2)

*[Live usage & backups](../features/08-usage-backups.md)*

- US-BKP-01 · See the last backup's status (P2)
- US-BKP-02 · See destinations and the schedule summary (P2)
- US-BKP-03 · Review recent runs and run history (P2)
- US-BKP-04 · Back up now (P2)
- US-BKP-05 · Run a backup (P2)
- US-BKP-06 · Apply retention after each run (P2)
- US-BKP-07 · Handle failed runs (P2)
- US-BKP-08 · Choose a destination type and fill in its details (P2)
- US-BKP-09 · Test the connection and add the destination (P2)
- US-BKP-10 · See the encryption password once (P2)
- US-BKP-11 · Edit or remove a destination (P2)
- US-BKP-17 · Start a restore and pick a restore point (P2)
- US-BKP-18 · Choose apps or folders and how to restore (P2)
- US-BKP-19 · Confirm a restore with my password (P2)
- US-BKP-20 · Watch a restore in progress (P1)
- US-BKP-21 · Roll back automatically if a restore fails (P1)
- US-BKP-22 · Cancel a restore only before swap-in (P1)
- US-BKP-23 · Choose what's included in backups (P2)

## Phase 6 · Distribution

**Goal:** Installable by real people on macOS and Linux.

**Deliverables**
- Signed, notarized `.dmg`; first-launch bootstrap (LaunchAgent, engine detection, Colima download).
- Linux headless `install.sh` with systemd service and the `hlabs` CLI; `.deb`/`.rpm`/AppImage for desktop with the Linux tray.
- Uninstall from the tray and `install.sh --uninstall`.
- Release pipeline (07 §7.9, 11-testing-release).
- Website and help at `apps/site` (D-055): home, download, app catalogue, install guides, help for every P1/P2 feature, troubleshooting and error pages, release notes; `install.sh` served from the site; `helpUrl` links from the product checked in CI.

**Done when**
- [ ] Clean macOS VM: download → first app running in ≤ 10 minutes.
- [ ] Clean Ubuntu server: one command → onboarding URL printed → first app running.
- [ ] The site is live: the download page offers the release, the one-line install uses the site's `install.sh`, and `site:check` passes (every help link from the product resolves).
- [ ] **This is the MVP / 1.0 beta.**

**Stories**

*[Install & menu-bar app](../features/01-install-tray.md)*

- US-INST-03 · Install hlabs from the disk image (P2)
- US-INST-04 · Launching from outside Applications (P2)
- US-INST-21 · Choose what to keep when uninstalling (Polish)
- US-INST-22 · Uninstall removes hlabs cleanly (Polish)
- US-INST-23 · Install hlabs on a Linux server with one command (P3)
- US-INST-24 · Finish setup in the browser after the Linux install (P3)
- US-INST-25 · Manage a headless install from the command line (P3)
- US-INST-26 · Native tray menu on Linux desktops (Polish)
- US-INST-27 · First run on a Linux desktop (Polish)

*[Website and help](../features/13-site.md)*

- US-SITE-01 · Understand hlabs from the home page (P2)
- US-SITE-02 · Download the right build for my computer (P2)
- US-SITE-03 · Browse the app catalogue (P2)
- US-SITE-04 · Read an app's page (P2)
- US-SITE-05 · Install on Linux with the command from the site (P2)
- US-SITE-06 · Follow a step-by-step install guide (P2)
- US-SITE-07 · Find help for every part of hlabs (P2)
- US-SITE-08 · Search the help (P2)
- US-SITE-09 · Fix a problem from an error message (P2)
- US-SITE-10 · Open the right help page from the dashboard (P2)
- US-SITE-12 · Visit a private, accessible site (P2)
- US-SITE-13 · Read release notes (P2)

## Phase 7 · v1.0 completeness

**Goal:** Everything P2: the comfortable product.

**Deliverables**
- Notifications, empty Home, edit mode, widgets.
- Store categories, search, updates list, sources.
- App configuration, permissions, usage detail.
- Appearance, storage, advanced, factory reset.
- Phone layouts for log in, Home, store and app details; PWA.

**Done when**
- [ ] All P2 stories pass; axe clean on every route; phone layouts verified on iOS Safari and Android Chrome.
- [ ] **1.0 release.**

**Stories**

*[Home](../features/04-home.md)*

- US-HOME-13 · Open the notifications panel (P2)
- US-HOME-14 · Act on and clear notifications (P2)
- US-HOME-15 · See a friendly empty Home (P2)
- US-HOME-16 · Enter and leave edit mode (P2)
- US-HOME-17 · Rearrange apps and widgets (P2)
- US-HOME-18 · Remove an app or widget from Home (P2)
- US-HOME-19 · Add a widget from the picker (P2)
- US-HOME-22 · Pin my favourite apps to the Dock (P2)
- US-HOME-20 · Show app widgets with live data (P2)

*[App Store & installing](../features/05-app-store.md)*

- US-STORE-04 · Browse a category (P2)
- US-STORE-05 · Search results with filters (P2)
- US-STORE-15 · See and apply available updates (P2)
- US-STORE-16 · Check for updates and auto-update in the background (P2)
- US-STORE-18 · See and manage app sources (P2)
- US-STORE-19 · Add a source with a pinned signing key (P2)

*[Using & managing apps](../features/06-apps.md)*

- US-APP-13 · Edit environment variables (P2)
- US-APP-14 · Secrets are hidden and can be revealed by an admin (P2)
- US-APP-15 · Change web address and port (P2)
- US-APP-16 · Save configuration and restart (P2)
- US-APP-17 · Folder access (P2)
- US-APP-18 · Network access (P2)
- US-APP-19 · Require hlabs login in front of an app (P2)
- US-APP-20 · Resource use tiles and 24-hour chart (P2)
- US-APP-21 · Per-container usage (P2)

*[Settings · account & people](../features/09-account-people.md)*

- US-ACCT-32 · Choose a wallpaper (P2)
- US-ACCT-33 · Choose an accent colour (P2)
- US-ACCT-34 · Home screen options (P2)
- US-ACCT-35 · Reduce transparency and motion (P2)

*[Settings · system](../features/10-system-settings.md)*

- US-SYS-11 · See what is using storage (P2)
- US-SYS-12 · Manage data location and drives (P2)
- US-SYS-13 · Free space from unused app images (P2)
- US-SYS-14 · Empty everyone's trash (P2)
- US-SYS-27 · View hlabs logs (P2)
- US-SYS-28 · Download a diagnostics bundle (P2)
- US-SYS-29 · See what hlabs connects to (P2)
- US-SYS-30 · Opt in to beta updates (P2)
- US-SYS-31 · Restart hlabs (P2)
- US-SYS-37 · Confirm a factory reset (P2)
- US-SYS-38 · Reset hlabs (P2)

*[Phone](../features/12-phone.md)*

- US-PHONE-01 · Switch to the phone layout with a bottom tab bar (P2)
- US-PHONE-02 · Touch targets, safe areas and phone-friendly inputs (P2)
- US-PHONE-03 · Bottom sheets with soft spring and drag to dismiss (P2)
- US-PHONE-04 · Back navigation and resuming after the phone sleeps (P2)
- US-PHONE-05 · Log in on a phone (P2)
- US-PHONE-06 · Two-factor, lockout and forgot password on phone (P2)
- US-PHONE-07 · Phone Home header and stacked widgets (P2)
- US-PHONE-08 · App grid and opening apps on phone (P2)
- US-PHONE-09 · Search from Home on phone (P2)
- US-PHONE-10 · Browse the App Store on phone (P2)
- US-PHONE-11 · App details on phone (P2)
- US-PHONE-12 · Install an app from the phone (P2)
- US-PHONE-23 · Add hlabs to the home screen (P2)
- US-PHONE-24 · Run as a standalone web app (P2)

*[Website and help](../features/13-site.md)*

- US-SITE-11 · Keep screenshots in the docs current (P2)

## Phase 8 · Power features (P3)

**Goal:** For tinkerers and edge cases.

**Deliverables**
- Restore from a backup in onboarding, deploy your own app, move app data, SMB shares, external drives, trash UI, failed backup details, AI access (MCP), About, 404.

**Done when**
- [ ] All P3 stories pass.

**Stories**

*[Onboarding](../features/02-onboarding.md)*

- US-ONB-23 · Find a backup to restore from (P3)
- US-ONB-24 · Open the backup and continue to restore (P3)

*[App Store & installing](../features/05-app-store.md)*

- US-STORE-20 · Deploy a custom app from a compose file (P3)
- US-STORE-21 · Edit and redeploy a custom app (P3)

*[Using & managing apps](../features/06-apps.md)*

- US-APP-22 · Choose where to move an app's data (P3)
- US-APP-23 · Move job (P3)

*[Files](../features/07-files.md)*

- US-FILE-13 · Share a folder on the local network (P3)
- US-FILE-14 · Detect and browse an external drive (P3)
- US-FILE-15 · Eject an external drive (P3)
- US-FILE-16 · Move items to Trash with undo (P3)
- US-FILE-17 · Restore items from Trash (P3)
- US-FILE-18 · Empty Trash manually and automatically (P3)

*[Live usage & backups](../features/08-usage-backups.md)*

- US-BKP-15 · Understand why a backup failed (P3)
- US-BKP-16 · Download the log or try again (P3)

*[Settings · system](../features/10-system-settings.md)*

- US-SYS-32 · Turn on AI access (P3)
- US-SYS-33 · Choose what assistants may do (P3)
- US-SYS-34 · Create and revoke tokens (P3)
- US-SYS-35 · Assistants can't install or update apps (P3)
- US-SYS-36 · See recent assistant activity (P3)
- US-SYS-39 · See version and system information (P3)
- US-SYS-40 · See the project and licences (P3)

*[System states](../features/11-system-states.md)*

- US-STATE-21 · Show a page-not-found screen (P3)
- US-STATE-22 · Show not-found for unknown app addresses (P3)

## Phase 9 · Nice to have and polish

**Goal:** Refinement.

**Deliverables**
- Loading skeletons, list view, context menus, move/rename, backup schedule editor, notification settings, rename server, certificate guide, move all data, engine switch, phone Files/Settings/Backups, reduce transparency polish.

**Done when**
- [ ] All remaining stories pass.

**Stories**

*[Home](../features/04-home.md)*

- US-HOME-21 · Use Home with Reduce transparency on (Polish)

*[App Store & installing](../features/05-app-store.md)*

- US-STORE-22 · Show skeletons while the store loads (Nice to have)

*[Files](../features/07-files.md)*

- US-FILE-19 · Switch to list view and sort (Nice to have)
- US-FILE-20 · Select several items (Nice to have)
- US-FILE-21 · Use the right-click menu (Nice to have)
- US-FILE-22 · Move items to another folder (Nice to have)
- US-FILE-23 · Rename a file or folder (Nice to have)
- US-FILE-24 · See skeletons while a folder loads (Nice to have)

*[Live usage & backups](../features/08-usage-backups.md)*

- US-BKP-12 · Choose how often backups run (Nice to have)
- US-BKP-13 · Set how many restore points to keep (Nice to have)
- US-BKP-14 · Pause apps briefly for a consistent copy (Nice to have)
- US-USE-10 · Show a loading state before usage arrives (Nice to have)
- US-USE-11 · Handle usage that can't be loaded (Nice to have)

*[Settings · account & people](../features/09-account-people.md)*

- US-ACCT-29 · Choose where notifications go (Nice to have)
- US-ACCT-30 · Choose what to be told about (Nice to have)
- US-ACCT-31 · Quiet hours (Nice to have)

*[Settings · system](../features/10-system-settings.md)*

- US-SYS-07 · Pick a new server name (Nice to have)
- US-SYS-08 · Apply a rename everywhere (Nice to have)
- US-SYS-09 · Follow install steps for my device (Nice to have)
- US-SYS-10 · Download the certificate on a computer or phone (Nice to have)
- US-SYS-15 · Choose where to move all data (Nice to have)
- US-SYS-16 · Move all data as a safe job (Nice to have)
- US-SYS-21 · Review an engine switch (Nice to have)
- US-SYS-22 · Switch engine with automatic fallback (Nice to have)

*[Phone](../features/12-phone.md)*

- US-PHONE-13 · Open the app settings sheet (Polish)
- US-PHONE-14 · Toggle app options in the sheet (Polish)
- US-PHONE-15 · Share, configure and uninstall from the sheet (Polish)
- US-PHONE-16 · Browse files on phone (Polish)
- US-PHONE-17 · Upload from the phone (Polish)
- US-PHONE-18 · Search and file actions on phone (Polish)
- US-PHONE-19 · Settings list on phone (Polish)
- US-PHONE-20 · Settings pages on phone (Polish)
- US-PHONE-21 · Backup status and back up now on phone (Polish)
- US-PHONE-22 · Schedule, restore and recent runs on phone (Polish)

*[Website and help](../features/13-site.md)*

- US-SITE-14 · Suggest a change to the docs (Polish)
