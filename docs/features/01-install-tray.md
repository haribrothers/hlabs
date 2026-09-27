# 01 · Install & menu-bar app

This module gets hlabs onto a computer and keeps it running: the macOS `.dmg` and first-launch setup, the Linux server install script and service, and the tray app (macOS menu bar, Linux desktop tray) that shows status, offers quick actions, resets a password locally, applies hlabs updates and uninstalls hlabs. It is used by whoever owns the computer, usually the admin, and is the only place that works without a dashboard login.

**Screens:** `MacInstall` (P2), `LinuxInstall` (P3), `TrayMenu` (P1), `TrayStates` (P1), `TrayResetPassword` (P1), `TrayUninstall` (Polish), `LinuxTray` (Polish).
**Depends on:** [02-onboarding](02-onboarding.md) (first run the tray opens), [04-home](04-home.md) (dashboard the tray opens), [11-system-states](11-system-states.md) (daemon down, updating), [10-system-settings](10-system-settings.md) (updates, engine & startup), [06-apps](06-apps.md) (logs), [08-usage-backups](08-usage-backups.md) (backup runs).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-INST-01 | First-launch bootstrap (macOS) | P1 | 4 | `TrayStates` |
| F-INST-02 | Mac installer (.dmg) | P2 | 6 | `MacInstall` |
| F-INST-03 | Menu-bar status and quick actions | P1 | 4 | `TrayMenu`, `TrayStates` |
| F-INST-04 | Tray states and recovery | P1 | 4 | `TrayStates`, `TrayMenu` |
| F-INST-05 | Tray to daemon authentication | P1 | 4 | `TrayMenu` |
| F-INST-06 | Reset a password from the tray | P1 | 4 | `TrayResetPassword` |
| F-INST-07 | hlabs updates from the tray | P1 | 4 | `TrayMenu`, `TrayStates` |
| F-INST-08 | Uninstall hlabs from the tray | Polish | 6 | `TrayUninstall` |
| F-INST-09 | Linux server install script and service | P3 | 6 | `LinuxInstall` |
| F-INST-10 | Linux desktop tray menus | Polish | 6 | `LinuxTray` |

## User stories

### US-INST-01 · First launch installs the background service
**Feature:** F-INST-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayStates`
**As** a new user, **I want** hlabs to set itself up the first time I open it, **so that** it runs in the background without me touching a terminal.

**Acceptance criteria**
- **Given** hlabs has never run for this macOS user (no `~/Library/LaunchAgents/dev.hlabs.daemon.plist` and no tray token in the Keychain), **when** I open hlabs, **then** the tray shows the "First launch" state: "Setting up hlabs", "This happens once", with the checklist "Starting background service" then "Opening setup in your browser…".
- **Given** first launch, **when** setup runs, **then** the tray, in order: creates the data dir `~/Library/Application Support/hlabs`, generates the tray token (US-INST-15), writes the LaunchAgent `dev.hlabs.daemon` (RunAtLoad, KeepAlive on crash, pointing at the bundled `node` and daemon bundle), loads it with `launchctl bootstrap gui/<uid>`, and registers the tray as a login item (`SMAppService.mainApp`).
- **Given** the LaunchAgent is loaded, **when** `GET http://127.0.0.1:7474/healthz` returns 200 within 60 s, **then** the "Starting background service" step shows a check mark. A missing or stopped container engine does not fail `/healthz`; the tray learns about it from `engine.status`.
- **Given** the daemon does not answer within 60 s, **when** the timeout passes, **then** the tray switches to the "Can't reach hlabs" state (US-INST-13) and nothing is opened in the browser.
- **Given** a LaunchAgent from an older hlabs version exists, **when** a newer hlabs launches, **then** the plist is rewritten to the new paths and reloaded, and no first-launch window is shown.
- **Given** a previous uninstall kept data (existing `hlabs.db` in the data dir), **when** hlabs is launched again, **then** setup reuses the data dir and does not reopen onboarding if `onboarding.status` reports it complete.

**Implementation notes**
- API: `system.health` / `GET /healthz`; `onboarding.status`.
- Data: none written by the tray except the Keychain item and files outside SQLite; daemon creates `hlabs.db` on its first start.
- UI: `TrayMenu` window in its first-launch variant, `List` + `ListRow` with `StatusDot` / check per step, `Progress` (indeterminate) on the running step, `Logo`.
- Edge cases: launch agent label already loaded by another copy of hlabs (e.g. run from the `.dmg`); `launchctl bootstrap` returns error 5 (already loaded) must be treated as success after `kickstart -k`.

### US-INST-02 · First launch hands off to onboarding in the browser
**Feature:** F-INST-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayStates`
**As** a new user, **I want** hlabs to open setup in my browser, **so that** I can create my admin account and pick a container engine.

**Acceptance criteria**
- **Given** the background service is up and `onboarding.status` says onboarding is incomplete, **when** the second step runs, **then** the tray reads the tokenised setup URL from `tray.setupUrl` (`http://127.0.0.1:7474/setup?token=…`) and opens it in the default browser, which lands on `OnbWelcome` (D-013).
- **Given** the browser was opened, **when** I look at the tray, **then** the "Open setup" button stays available so I can reopen it; clicking it fetches `tray.setupUrl` again and opens that URL.
- **Given** no container engine was found, **when** the daemon starts in engine-stopped mode, **then** the tray does not try to install or start an engine itself; engine choice and Colima install happen in onboarding's system check.
- **Given** onboarding completes (`onboarding.status` reports `completedAt`), **when** the tray next refreshes, **then** it leaves the first-launch state and shows the normal menu (US-INST-05).
- **Given** I close the first-launch window before onboarding completes, **when** I click the menu-bar icon later, **then** the first-launch state is shown again with "Open setup".

**Implementation notes**
- API: `onboarding.status` (public), `tray.status`, `tray.setupUrl`.
- UI: `Button` (primary) "Open setup"; open URLs with the Tauri opener plugin.
- Edge cases: setup runs over plain HTTP on loopback, so there is no certificate warning at this point; onboarding's CertGuide handles trusting the local CA later. Do not open more than one browser tab automatically per launch.

### US-INST-03 · Install hlabs from the disk image
**Feature:** F-INST-02 · **Priority:** P2 · **Phase:** 6 · **Screens:** `MacInstall`
**As** a new user, **I want** a standard drag-to-Applications installer, **so that** installing hlabs feels like any other Mac app.

**Acceptance criteria**
- **Given** I open `hlabs-<version>-mac-arm64.dmg`, **when** the volume mounts, **then** Finder shows a window with the hlabs icon, an arrow to an `Applications` alias, the title "Drag hlabs into Applications" and the line "Then open it once. It lives in your menu bar and starts when you log in."
- **Given** the `.dmg`, **when** it is built, **then** the main artifact is `hlabs-<version>-mac-arm64.dmg` for Apple Silicon, and an Intel build `hlabs-<version>-mac-x64.dmg` is published on a best-effort basis (there is no universal binary); each is code-signed with the Developer ID, notarized and stapled, so Gatekeeper opens it without a warning.
- **Given** macOS older than the minimum supported version (macOS 14, D-039), **when** I open hlabs, **then** it shows a native alert "hlabs needs macOS 14 or later" and quits.
- **Given** the `.dmg` window, **when** it opens, **then** the background image renders correctly on Retina and non-Retina displays and in light and dark mode.

**Implementation notes**
- Build: Tauri bundler `dmg` target with a custom background and window layout; bundled binaries from 02 §2.2 inside `hlabs.app/Contents/Resources/bin`.
- UI: static artwork only; no in-app screen.
- Edge cases: user runs hlabs straight from the mounted image (see US-INST-04).

### US-INST-04 · Launching from outside Applications
**Feature:** F-INST-02 · **Priority:** P2 · **Phase:** 6 · **Screens:** `MacInstall`
**As** a new user, **I want** hlabs to catch it when I open it from the disk image, **so that** the background service does not point at a path that disappears.

**Acceptance criteria**
- **Given** hlabs is launched from a path outside `/Applications` or `~/Applications` (e.g. `/Volumes/hlabs/hlabs.app` or `~/Downloads`), **when** it starts, **then** before any setup it shows a dialog "Move hlabs to Applications?" with buttons "Move to Applications" and "Quit".
- **Given** I choose "Move to Applications", **when** the copy succeeds, **then** hlabs relaunches from `/Applications/hlabs.app` and continues with US-INST-01.
- **Given** the copy needs admin rights or fails, **when** it fails, **then** the dialog shows "Couldn't move hlabs. Drag it into Applications, then open it again." and no LaunchAgent is written.
- **Given** a second copy of hlabs is already running, **when** I open another, **then** the new instance activates the running one and quits (single instance).

**Implementation notes**
- Tauri `single-instance` plugin; move via `NSFileManager` with an authorization fallback prompt.
- UI: `Dialog`, `Button`.

### US-INST-05 · See status at a glance
**Feature:** F-INST-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`
**As** an admin, **I want** the menu to show whether hlabs is healthy and how busy the computer is, **so that** I don't need to open the dashboard to check.

**Acceptance criteria**
- **Given** the daemon is ready and not paused, **when** I click the menu-bar icon, **then** the menu shows the header "hlabs" with the status line "Running · N apps" (N = installed apps in state `running`) and a stats grid "CPU 18%", "Memory 9.4 GB", "Free 142 GB".
- **Given** the menu is open, **when** new samples arrive, **then** the stats update at most every 5 s; when the menu is closed, the tray polls `tray.status` no more than every 30 s (only to update the icon).
- **Given** values: **then** CPU is a whole-number percentage of host CPU, Memory is used host memory in GB with one decimal, Free is free space on the storage root in GB with no decimals (TB with one decimal at 1000 GB or more).
- **Given** the menu opens, **when** `tray.status` has not returned yet, **then** the stats show "–" placeholders, never zero.
- **Given** the menu is open, **when** I use the keyboard, **then** Up/Down move between items, Enter activates, Esc closes; stats have accessible labels such as "CPU usage 18 percent".

**Implementation notes**
- API: `tray.status` (extended output, see API additions), `events.stream` filtered to `system.status`, `engine.status`, `usage.sample`, `backup.run` (tray-token subscription).
- UI: `TrayMenu`, `StatusDot`, `GlassCard` stat tiles, `Menu` items; follow the reduce-transparency setting from the admin's `appearance:<userId>` setting exposed in `tray.status`.
- Edge cases: 0 apps installed shows "Running · no apps"; 1 app shows "Running · 1 app".

### US-INST-06 · Open the dashboard and copy its address
**Feature:** F-INST-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`
**As** anyone using the computer, **I want** one click to open or share the dashboard, **so that** I can reach it from this Mac or send it to someone at home.

**Acceptance criteria**
- **Given** the menu is open, **when** I choose "Open Dashboard" or press ⌘D, **then** the default browser opens the dashboard URL (e.g. `https://hlabs.local`) and the menu closes.
- **Given** the menu is open, **when** I choose "Copy dashboard address", **then** the dashboard URL is copied to the clipboard and the item text changes to "Copied" for 1.5 s before the menu closes.
- **Given** the hostname was renamed or mDNS fell back to a port, **when** I open or copy, **then** the current URL from `tray.status.dashboardUrl` is used, never a hard-coded one.
- **Given** onboarding is incomplete, **when** I choose "Open Dashboard", **then** it opens onboarding at the same URL.

**Implementation notes**
- API: `tray.quickAction` (`openDashboard`, `copyAddress` return the URL; the tray does the opening and clipboard write), `tray.status`.
- UI: `Menu` item with shortcut hint; Tauri clipboard plugin.

### US-INST-07 · Back up now from the menu
**Feature:** F-INST-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`
**As** an admin, **I want** to start a backup from the menu bar, **so that** I can protect my data before I change something.

**Acceptance criteria**
- Hidden until phase 5 ships (D-036): "Back up now" does not appear in the menu before backups exist; the criteria below apply from phase 5.
- **Given** at least one backup destination is configured, **when** the menu is open, **then** "Back up now" shows the secondary text "Last: 2h ago" (relative time of the last succeeded run; "Last: never" if none).
- **Given** I choose "Back up now", **when** no backup is running, **then** a manual run starts (`trigger = manual`) and the item shows "Backing up… 34%" from `job.progress` until it finishes.
- **Given** a run finishes, **when** it succeeded, **then** the secondary text resets to "Last: just now"; **when** it failed, **then** the item shows "Last backup failed" and the icon shows the needs-attention dot (US-INST-14).
- **Given** a backup is already running, **when** the menu is open, **then** "Back up now" is disabled and shows the running progress.
- **Given** no destination is configured, **when** I choose "Back up now", **then** the dashboard opens at the backups setup screen instead.

**Implementation notes**
- API: `tray.quickAction` (`backupNow` → `{ jobId }`), `events.stream` (`job.progress`, `backup.run`).
- Data: `backup_runs`, `backup_destinations`, `jobs`.
- Edge cases: an exclusive job (system update, restore) is running → daemon rejects with `JOB_EXCLUSIVE_RUNNING`; show "Busy, try later" for 3 s.

### US-INST-08 · Pause and resume all apps
**Feature:** F-INST-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`, `TrayStates`
**As** an admin on a laptop, **I want** to pause every app at once, **so that** I save battery and memory without uninstalling anything.

**Acceptance criteria**
- **Given** apps are running, **when** I choose "Pause all apps", **then** the daemon stops every running app (`compose stop`, data untouched) and the menu switches to the "Paused" state: status "Paused · apps stopped", the note "Your apps are stopped to save battery and memory. Data is untouched.", and the primary button "Resume apps".
- **Given** hlabs is paused, **when** the daemon restarts or the Mac reboots, **then** apps stay stopped (reconcile skips autostart while paused) until I resume.
- **Given** hlabs is paused, **when** I choose "Resume apps", **then** apps that were running before the pause start again, the menu shows the "Starting" state (US-INST-11), then "Running".
- **Given** hlabs is paused, **when** the Paused menu is shown, **then** it offers only "Resume apps", "Open Dashboard ⌘D" and "Quit hlabs ⌘Q".
- **Given** Caddy and the dashboard, **when** paused, **then** they keep running so the dashboard stays reachable and shows apps as stopped.

**Implementation notes**
- API: `tray.quickAction` (`pauseAll`, `resumeAll` → `{ jobId }`).
- Data: `settings` key `paused` (`{ at, appIds }`, new); `apps.state`; `audit_log` entry `system.pause` / `system.resume`.
- UI: `TrayMenu` Paused variant, `Button` primary "Resume apps".
- Edge cases: an app install in progress when pausing is allowed to finish, then stopped; pause while a backup runs waits for the backup to finish.

### US-INST-09 · Start at login
**Feature:** F-INST-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`
**As** an admin, **I want** to choose whether hlabs starts when I log in, **so that** my apps are there without me opening anything.

**Acceptance criteria**
- **Given** first launch, **when** setup completes, **then** "Start at login" is on by default.
- **Given** start at login, **then** the tray owns it (D-042): only the tray changes the OS login item and the LaunchAgent; the daemon never does.
- **Given** the menu, **when** I toggle "Start at login" off, **then** the tray unregisters its login item (`SMAppService`) and sets the LaunchAgent `RunAtLoad` to false (the daemon keeps running now); toggling on restores both.
- **Given** the toggle changed, **when** the change is applied, **then** the tray records it with `tray.setStartAtLogin` so the daemon's `settings.startup` value matches and Settings › Engine & startup shows the same state.
- **Given** an admin changes the switch in Settings › Engine & startup (US-SYS-20), **when** `settings.startup.update` runs, **then** the daemon emits `startup.changeRequested` and the tray applies it the same way (SMAppService login item and LaunchAgent `RunAtLoad`), then confirms with `tray.setStartAtLogin`.
- **Given** the OS refused the change (e.g. login items blocked by a profile), **when** it fails, **then** the switch returns to its previous position and the item shows "Couldn't change login setting".

**Implementation notes**
- API: `tray.setStartAtLogin` (new), `events.stream` (`startup.changeRequested`), `settings.startup.update` (dashboard side, US-SYS-20).
- Data: `settings` key `startup`.
- Edge cases: if the tray is not running when `startup.changeRequested` is emitted, it applies the saved `settings.startup` value the next time it starts.
- UI: `Switch` inside a `Menu` row.

### US-INST-10 · Quit hlabs
**Feature:** F-INST-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`, `TrayStates`
**As** an admin, **I want** to quit the menu-bar app, **so that** it gets out of my menu bar when I don't need it.

**Acceptance criteria**
- **Given** any tray state, **when** I choose "Quit hlabs" or press ⌘Q with the menu open, **then** the menu-bar app quits; the daemon and apps keep running (they are owned by the LaunchAgent).
- **Given** the tray quit, **when** I open hlabs from Applications or log in again with "Start at login" on, **then** the menu-bar icon returns without re-running first-launch setup.
- **Given** "Quit hlabs", **when** it runs, **then** no confirmation is shown, because nothing stops.

**Implementation notes**
- To stop apps, users use "Pause all apps"; to remove everything, "Uninstall hlabs…". See Open questions.

### US-INST-11 · Starting state
**Feature:** F-INST-04 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayStates`, `AppLogs`
**As** an admin, **I want** to see progress while hlabs starts, **so that** I know when my apps are ready.

**Acceptance criteria**
- **Given** the daemon is starting or reconciling apps, **when** I open the menu, **then** it shows "Starting · 4 of 11 apps" (apps in `running` of apps that should run) with actions "Open Dashboard ⌘D", "Show startup log" and "Quit hlabs ⌘Q".
- **Given** the count, **when** each app reaches `running`, **then** the numerator updates live from `app.stateChanged`.
- **Given** all apps that should run are running, **when** the last one becomes healthy, **then** the state changes to the normal menu ("Running · 11 apps").
- **Given** "Show startup log", **when** I choose it, **then** the dashboard opens at `AppLogs` for the first app still not running (or Main if all are running).
- **Given** an app ends in `error` during startup, **when** startup finishes, **then** the state becomes needs attention (icon dot) and the status line reads "Running · 10 of 11 apps · 1 needs attention".

**Implementation notes**
- API: `tray.status` (`appsRunning`, `appsExpected`), `events.stream` (`app.stateChanged`, `system.status`).
- UI: `TrayMenu` Starting variant, `Progress` (determinate bar = running / expected).

### US-INST-12 · Container engine stopped
**Feature:** F-INST-04 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayStates`
**As** an admin, **I want** the menu to tell me when the container engine is down and fix it in one click, **so that** my apps come back quickly.

**Acceptance criteria**
- **Given** the daemon reports `engine.status` not running, **when** I open the menu, **then** it shows "Container engine stopped" and "<Engine> isn't running, so your apps are offline." with the engine's name (e.g. "Colima", "OrbStack", "Docker Desktop").
- **Given** that state, **when** I choose "Start engine", **then** the daemon starts the engine (Colima: `colima start --profile hlabs`; OrbStack / Docker Desktop: launch the app), the button shows "Starting engine…" and is disabled, and on success the menu moves to the Starting state.
- **Given** the engine did not start within 120 s (the same timeout as US-STATE-09), **when** the timeout passes, **then** the menu shows "Engine didn't start" and keeps "Start engine" enabled for another try.
- **Given** "Troubleshoot…", **when** I choose it, **then** the dashboard opens at `SysEngineStopped`.
- **Given** "Copy diagnostics", **when** I choose it, **then** a redacted plain-text report (hlabs, OS, engine versions, `/healthz` result, last 200 daemon log lines with secrets redacted, no container logs) is copied and the item shows "Copied" for 1.5 s.

**Implementation notes**
- API: `tray.startEngine` (new), `tray.diagnostics` (new), `events.stream` (`engine.status`).
- UI: `TrayMenu` Error variant, `StatusDot` (red), `Button` primary "Start engine".
- Edge cases: engine is the user's Docker Engine on Linux (rootful) → "Start engine" is hidden, only Troubleshoot and Copy diagnostics show.

### US-INST-13 · Can't reach hlabs
**Feature:** F-INST-04 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`, `SysDaemonDown`
**As** an admin, **I want** the tray to notice when the background service is down, **so that** I can restart it without a terminal.

**Acceptance criteria**
- This story is the spec for the tray's daemon-down menu; US-STATE-07 references it.
- **Given** `/healthz` has not answered for 10 s, **when** I open the menu, **then** the menu-bar icon shows the red dot (US-INST-14) and the menu shows "Can't reach hlabs" with these items, in order: "Restart hlabs", "Show logs", "Copy diagnostics", a separator, "Quit hlabs ⌘Q".
- **Given** "Show logs", **when** I choose it, **then** the daemon log file opens in the system's default log or text viewer (Linux: the journal for `hlabsd` in a terminal or the log file), without calling the API.
- **Given** "Restart hlabs", **when** I choose it, **then** the tray runs `launchctl kickstart -k gui/<uid>/dev.hlabs.daemon` (Linux: `systemctl --user restart hlabsd`) and shows the Starting state while waiting up to 60 s.
- **Given** `/healthz` returns 503 with a reason (e.g. migration failed), **when** the menu opens, **then** the reason copy from the error catalogue is shown and "Open Dashboard" opens `SysDaemonDown`.
- **Given** the daemon is unreachable, **when** I choose "Copy diagnostics", **then** the tray builds the report locally (tray version, OS, `launchctl print` status, last 200 lines of the daemon log file) without calling the API.

**Implementation notes**
- API: `GET /healthz`; no tray token needed for health.
- UI: `TrayMenu` Error variant, `StatusDot` (red).
- Edge cases: daemon restarting during an hlabs update shows the Updating state (US-INST-20), not this one.

### US-INST-14 · Menu-bar icon reflects state
**Feature:** F-INST-04 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`, `TrayStates`
**As** an admin, **I want** the icon itself to tell me if something needs me, **so that** I notice problems without opening the menu.

**Acceptance criteria**
- **Given** each state, **then** the icon is: Running = plain template icon; Starting = template icon with a slow pulse (static when Reduce Motion is on); Paused = template icon at 50% opacity; Update available = icon with an accent dot; Needs attention, Engine stopped or Can't reach hlabs = icon with a red dot.
- **Given** several conditions, **when** they overlap, **then** the red dot wins over the accent dot.
- **Given** VoiceOver, **when** focus is on the icon, **then** it reads "hlabs, <status line>".
- **Given** the state changes to Engine stopped or Can't reach hlabs, **when** it lasts more than 60 s, **then** one macOS notification is posted ("hlabs: your apps are offline"), not repeated until the state clears.

**Implementation notes**
- UI: template PNGs (light/dark handled by macOS); `Badge` dot overlay rendered into the icon image.

### US-INST-15 · Tray authenticates to the daemon with a local token
**Feature:** F-INST-05 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`
**As** an admin, **I want** the tray to talk to hlabs without a login, while nothing else can use that access, **so that** quick actions are instant and safe.

**Acceptance criteria**
- **Given** first launch, **when** setup runs, **then** the tray generates 32 random bytes, stores them in the OS keychain (service `dev.hlabs`, account `tray-token`) and the daemon reads the same item at startup and keeps only its SHA-256 hash in memory.
- **Given** a tray call, **when** it is sent, **then** it goes to `http://127.0.0.1:7474/trpc` with `Authorization: Bearer <token>`; the daemon accepts it only on `tray.*` procedures and only from a loopback peer address.
- **Given** a request with the token arriving through Caddy (any `X-Forwarded-*` header present) or from a non-loopback address, **when** it is checked, **then** the daemon returns `UNAUTHORIZED` with `hlabsCode` `TRAY_TOKEN_REJECTED`.
- **Given** a valid token, **when** it is used on a non-`tray.*` procedure, **then** it is rejected with `FORBIDDEN`.
- **Given** tray actions that change state (pause, resume, backup, reset password, uninstall, start engine), **when** they run, **then** each writes an `audit_log` row with `user_id` null and `detail_json.via = "tray"`.

**Implementation notes**
- API: `trayProcedure` middleware in `packages/api`; constant-time hash compare.
- Data: `audit_log`; token lives only in the keychain (headless Linux: plain file `/var/lib/hlabs/tray.token`, mode 0640, owner and group `hlabs`, D-035; the file permissions are the protection, it is not encrypted).
- Edge cases: SSE subscription for the tray uses the same header (use `EventSource` polyfill that supports headers, or fetch streaming).

### US-INST-16 · Recover from a missing or mismatched tray token
**Feature:** F-INST-05 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`
**As** an admin, **I want** hlabs to repair its own tray access, **so that** a keychain reset doesn't leave the menu broken.

**Acceptance criteria**
- **Given** the keychain item is missing when the tray starts, **when** the tray detects it, **then** it generates a new token, stores it and restarts the daemon (`launchctl kickstart -k`) so the daemon loads the new one.
- **Given** the daemon rejects the token with `TRAY_TOKEN_REJECTED`, **when** it happens twice in a row, **then** the tray regenerates the token and restarts the daemon once; if still rejected, it shows "Can't reach hlabs".
- **Given** macOS asks for keychain access, **when** I deny it, **then** the menu shows "hlabs needs Keychain access to work" with a "Try again" action.

**Implementation notes**
- Edge cases: never log the token; diagnostics must redact any `Bearer` value.

### US-INST-17 · Choose an account and a new password
**Feature:** F-INST-06 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayResetPassword`
**As** someone who can log in to this Mac, **I want** to reset a forgotten hlabs password from the menu bar, **so that** we can get back in without email.

**Acceptance criteria**
- **Given** the menu, **when** I choose "Reset a password…", **then** a small window opens titled "Reset a password" with the note "Only people who can log in to this Mac can do this."
- **Given** the window, **when** it loads, **then** the "Account" picker lists every enabled user as "<Display name> (@username) · Admin" or "· Member", admins first, then alphabetical.
- **Given** "New password", **when** I type, **then** the rules from 07 §7.2 apply inline: at least 12 characters and not a common password; errors read "Use at least 12 characters" and "This password is too common".
- **Given** the selected account has two-factor on, **when** the window shows it, **then** the checkbox "Also turn off two-factor for this account" is shown, unchecked by default; it is hidden when the account has no two-factor.
- **Given** the form, **then** it shows "Next, macOS asks for this Mac's login password to confirm it's you." above the buttons "Cancel" and "Reset password"; "Reset password" is disabled until a valid password is entered.

**Implementation notes**
- API: `tray.listUsers` (new: `id`, `username`, `displayName`, `role`, `totpEnabled`), password validation shared from `packages/api` schemas.
- UI: `Dialog`-style Tauri window, `Menu` (account picker), `TextField` (type password, reveal toggle), `Switch` or checkbox, `Button`.

### US-INST-18 · Confirm with the OS and apply the reset
**Feature:** F-INST-06 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayResetPassword`
**As** someone who can log in to this Mac, **I want** the reset to require my Mac login, **so that** someone at the dashboard can't use it.

**Acceptance criteria**
- **Given** a valid form, **when** I choose "Reset password", **then** macOS `LocalAuthentication` prompts (Touch ID or the account password, reason "reset an hlabs password") before any API call.
- **Given** the OS confirms, **when** the tray calls `tray.resetPassword`, **then** the daemon sets the new Argon2id hash, revokes all sessions of that user, clears lockouts for that username, and (if checked) removes `user_totp` and `recovery_codes` for that user.
- **Given** success, **when** it completes, **then** the window closes and a notification reads "Password reset for @username".
- **Given** I cancel the OS prompt, **when** it returns, **then** nothing changes and the window stays open with the entered values.
- **Given** any reset, **when** it is applied, **then** a `password_resets` row (`created_via = tray`, `used_at` set) and an `audit_log` row (`user.passwordReset`, `via: tray`, `totpDisabled: bool`) are written.

**Implementation notes**
- API: `tray.resetPassword` (input extended: `username`, `newPassword`, `disableTotp`).
- Data: `users`, `sessions`, `login_attempts`, `user_totp`, `recovery_codes`, `password_resets`, `audit_log`.
- Edge cases: the user was deleted or disabled between opening and submitting → `NOT_FOUND`, show "This account no longer exists" and refresh the list. Linux uses a polkit prompt (action `dev.hlabs.reset-password`) instead of LocalAuthentication.

### US-INST-19 · Check for hlabs updates
**Feature:** F-INST-07 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`, `TrayStates`
**As** an admin, **I want** to know when a new hlabs version is ready, **so that** I stay current without hunting for downloads.

**Acceptance criteria**
- **Given** the tray is running, **when** 6 h pass since the last check (and once, 2 min after launch), **then** the Tauri updater checks the signed manifest on the channel from `tray.status.updateChannel` (`stable` or `beta`).
- **Given** "Check for updates…", **when** I choose it, **then** the item shows "Checking…" and then either "hlabs is up to date" for 3 s or switches the menu to the "Update available" state.
- **Given** an update is found, **when** I open the menu, **then** it shows "Running · 11 apps", "Version [NEXT] is ready", "Apps restart for about a minute during the update.", with "Restart to update" (primary) and "What's new".
- **Given** the check fails (offline, bad signature), **when** it was manual, **then** the item shows "Couldn't check for updates" for 3 s; automatic failures are silent.
- **Given** "What's new", **when** I choose it, **then** the dashboard opens at `SettingsUpdates`.

**Implementation notes**
- Updater: Tauri updater plugin, public key embedded; no daemon call needed to check.
- Data: `settings` key `updates` (channel, auto) read via `tray.status`.

### US-INST-20 · Restart to update
**Feature:** F-INST-07 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayStates`, `SysUpdating`
**As** an admin, **I want** one button to apply the update, **so that** hlabs updates itself with only a short app restart.

**Acceptance criteria**
- **Given** "Restart to update", **when** I choose it, **then** the tray downloads and verifies the update, stops the daemon (`launchctl bootout`), replaces the app bundle (tray, daemon, helper binaries), reloads the LaunchAgent and relaunches the tray.
- **Given** the update is being applied, **when** a browser has the dashboard open, **then** it shows `SysUpdating` until `/healthz` returns 200.
- **Given** the new daemon starts, **when** migrations fail, **then** `/healthz` reports the reason and the tray shows "Can't reach hlabs" with that reason (US-INST-13).
- **Given** an exclusive job (restore, move all data, factory reset) is running, **when** I choose "Restart to update", **then** the button is disabled with the note "Finish the running task first".
- **Given** `settings.updates.auto` is on, **when** an update is found, **then** it is applied automatically inside the update window 03:00–05:00 local time, starting only after any running backup finishes; hlabs updates before apps (D-034).
- **Given** I choose "Update now" in the dashboard (`settings.updates.install`), **when** the daemon emits `update.applyRequested`, **then** the tray picks it up and applies the update the same way as "Restart to update".

**Implementation notes**
- Ownership (02 §2.10, D-034): on macOS and Linux desktop the tray applies hlabs updates with the Tauri updater; on headless Linux the daemon applies them itself (see US-INST-23 for upgrades by script).
- API: `tray.status` (exposes `exclusiveJobRunning`, `backup.running`), `events.stream` (`update.applyRequested`).
- Data: `jobs`.

### US-INST-21 · Choose what to keep when uninstalling
**Feature:** F-INST-08 · **Priority:** Polish · **Phase:** 6 · **Screens:** `TrayUninstall`
**As** an admin, **I want** to choose whether my data stays, **so that** I can remove hlabs without losing photos by accident.

**Acceptance criteria**
- **Given** the menu, **when** I choose "Uninstall hlabs…", **then** a window "Uninstall hlabs?" opens with "All 11 apps stop and hlabs is removed from this Mac." (count from `tray.uninstallInfo`).
- **Given** "What to keep", **then** two options show: "Keep my data" (default, "App data and Home folders stay in ~/hlabs, so you can reinstall later") and "Delete everything" ("Removes 97 GB. This can't be undone.", size from `tray.uninstallInfo.dataBytes`).
- **Given** hlabs installed Colima (profile `hlabs` in `<dataDir>/engine`), **then** the checkbox "Also remove Colima, which hlabs installed" is shown, unchecked; it is hidden for OrbStack, Docker Desktop or a user-installed Colima.
- **Given** the window, **then** it shows "Backups on your NAS aren't touched. Dragging hlabs to the Trash on its own would leave apps running in the background, so use this instead." and buttons "Cancel" and "Uninstall"; with "Delete everything" selected, "Uninstall" uses the destructive style.

**Implementation notes**
- API: `tray.uninstallInfo` (new: `appCount`, `dataBytes`, `storageRoot`, `colimaManaged`).
- UI: `Dialog` window, `Segmented` or radio `List`, checkbox, `Button` (destructive variant).

### US-INST-22 · Uninstall removes hlabs cleanly
**Feature:** F-INST-08 · **Priority:** Polish · **Phase:** 6 · **Screens:** `TrayUninstall`
**As** an admin, **I want** uninstall to stop and remove everything hlabs added, **so that** nothing keeps running afterwards.

**Acceptance criteria**
- **Given** I choose "Uninstall", **when** the OS confirms the local user (same prompt as US-INST-18), **then** the tray calls `tray.uninstall` and shows a progress list: "Stopping apps", "Removing hlabs", and "Deleting data" / "Removing Colima" when chosen.
- **Given** the daemon job, **when** it runs, **then** it runs `compose down` for every app (`--rmi all` and removing app volumes when deleting everything), removes the `hlabs` network, stops Caddy and unregisters mDNS names, and writes an `audit_log` row before any deletion.
- **Given** "Keep my data", **when** done, **then** the storage root and data dir (database, app folders) remain; with "Delete everything" both are deleted, and keychain items under service `dev.hlabs` are removed.
- **Given** the job succeeded, **when** the tray finishes, **then** it boots out and deletes the LaunchAgent, removes its login item, deletes the tray token, moves `hlabs.app` to the Trash and quits.
- **Given** a step fails, **when** it fails, **then** the list marks it with the error copy, offers "Try again" and "Copy diagnostics", and the app is not moved to the Trash.

**Implementation notes**
- API: `tray.uninstall` (new, input `keepData`, `removeColima`) → job; `events.stream` (`job.progress`).
- Data: `jobs`, `audit_log`.
- Edge cases: storage locations on NAS or external drives are only unmounted, never deleted; backup destinations are never touched.

### US-INST-23 · Install hlabs on a Linux server with one command
**Feature:** F-INST-09 · **Priority:** P3 · **Phase:** 6 · **Screens:** `LinuxInstall`
**As** an admin with a headless Linux box, **I want** a single install command, **so that** I get a working hlabs without configuring Docker or systemd myself.

**Acceptance criteria**
- **Given** I run `curl -fsSL https://<site>/install.sh | sh` (served by the website, US-SITE-05), **when** it is not root, **then** it re-runs itself with `sudo` (or exits with "Run this as root or with sudo" if sudo is missing).
- **Given** it starts, **when** it checks the system, **then** it prints one line like "✓ Ubuntu 24.04 · x86_64 · 16 GB memory · 412 GB free" and exits non-zero with a clear message if the OS lacks systemd or the architecture is not x86_64 or arm64.
- **Given** no Docker Engine, **when** it continues, **then** it prints "Docker Engine not found, installing from the official repository" and installs it from Docker's repository; an existing Docker Engine is reused.
- **Given** the install, **when** it continues, **then** it creates the `hlabs` system user, `/var/lib/hlabs` (data dir, 0750) with `storage/`, generates the tray token as the plain file `/var/lib/hlabs/tray.token` (0640, group `hlabs`, D-035) and `secret.key` (0600, for other secrets), installs the bundled binaries under `/opt/hlabs`, installs and enables the system unit `hlabsd.service` with `CAP_NET_BIND_SERVICE`, starts it and waits up to 60 s for `/healthz`.
- **Given** each step, **when** it succeeds, **then** a "✓" line is printed (e.g. "✓ Installed systemd service hlabsd.service (starts on boot)", "✓ Started hlabs · proxy on ports 80 and 443"); on failure it prints "✗ <step>" with the reason and the log path, and exits non-zero.
- **Given** port 80 or 443 is already in use, **when** the script checks ports before starting, **then** it falls back to 8080/8443 like onboarding (D-016), prints "! Port 443 is used by <process>, using 8443 instead" (and the same for 80/8080), and every address it prints includes the port.
- **Given** the script is run again on a machine that has hlabs, **when** it runs, **then** it upgrades in place (stop, replace binaries, start) and keeps data.

**Implementation notes**
- Script is POSIX `sh`, published with a checksum and GPG signature (07 §7.9); installs via tarball per arch.
- Edge cases: the chosen ports are saved to `settings` key `network.ports` so the daemon and Caddy use the same ones; if 8080/8443 are also taken, fail with "✗ Ports 443 and 8443 are both in use".

### US-INST-24 · Finish setup in the browser after the Linux install
**Feature:** F-INST-09 · **Priority:** P3 · **Phase:** 6 · **Screens:** `LinuxInstall`, `OnbWelcome`
**As** an admin, **I want** the script to tell me exactly where to go next, **so that** I can finish setup from my laptop or phone.

**Acceptance criteria**
- **Given** the daemon is ready, **when** mDNS publishes via Avahi, **then** the script prints "✓ Announced <name>.local on your network".
- **Given** the end of the script, **then** it runs `hlabs setup-url` and prints "Finish setup in your browser:" followed by the setup URL with its one-time token for each LAN address it returns (e.g. `http://<name>.local/setup?token=…` and "or" `http://<LAN IPv4>/setup?token=…`, with the port when a fallback port is used), all leading to `OnbWelcome` (D-013).
- **Given** Avahi is not available, **when** announcing fails, **then** the script prints only the IP-address setup URL and a note that the `.local` name isn't available.
- **Given** the admin loses the printed URL, **when** they run `hlabs setup-url` later (root or `hlabs` group), **then** it prints the same URLs again until onboarding is complete.
- **Given** the script ends, **then** it prints "Manage later with: hlabs status · hlabs logs · hlabs setup-url · hlabs reset-password".

**Implementation notes**
- API: `onboarding.status`, `tray.setupUrl` (returns the tokenised URL and the LAN addresses, D-035), both called through `hlabs setup-url`. The installer does not call `network.status`; the tray token may call `tray.*` procedures only.

### US-INST-25 · Manage a headless install from the command line
**Feature:** F-INST-09 · **Priority:** P3 · **Phase:** 6 · **Screens:** `LinuxInstall`
**As** an admin on a server without a desktop, **I want** `hlabs status`, `hlabs logs` and `hlabs reset-password`, **so that** I have the tray's essentials over SSH.

**Acceptance criteria**
- **Given** `hlabs status`, **when** run by root or a member of the `hlabs` group, **then** it prints the same facts as the tray status line and stats (state, running apps, CPU, memory, free space, last backup, dashboard URL) and exits 0 when running, 1 when degraded, 2 when unreachable.
- **Given** `hlabs logs`, **when** run by root or a member of the `hlabs` group, **then** it shows the daemon journal (`journalctl -u hlabsd`), with `-f` to follow and `--app <id>` for one app's container logs (read through the `tray.appLogs` procedure, since the tray token may call `tray.*` procedures only, D-035).
- **Given** `hlabs reset-password`, **when** run as root (sudo is the local-access proof on headless Linux), **then** it prompts for the account (numbered list), a new password twice (same rules as US-INST-17) and "Also turn off two-factor? [y/N]" when the account has 2FA, then applies it with the same effects as US-INST-18.
- **Given** a non-root user runs `hlabs reset-password`, **when** it starts, **then** it exits with "Run with sudo to reset a password", even if the user is in the `hlabs` group.
- **Given** a user who is neither root nor in the `hlabs` group runs `hlabs status` or `hlabs logs`, **when** the token file can't be read, **then** it exits with "Run with sudo or add yourself to the hlabs group".

**Implementation notes**
- CLI is a small binary in `/usr/local/bin/hlabs` that reads the plain tray token file `/var/lib/hlabs/tray.token` (0640, group `hlabs`, D-035) and calls `tray.status`, `tray.appLogs`, `tray.listUsers`, `tray.resetPassword` on loopback.
- Data: `password_resets` (`created_via = tray`), `audit_log` (`via: cli`).

### US-INST-26 · Native tray menu on Linux desktops
**Feature:** F-INST-10 · **Priority:** Polish · **Phase:** 6 · **Screens:** `LinuxTray`
**As** an admin on a Linux desktop, **I want** the same quick actions in my desktop's tray, **so that** hlabs feels at home on GNOME and KDE.

**Acceptance criteria**
- **Given** the tray on Linux, **when** I open it, **then** it is a native StatusNotifierItem menu with, in order: a disabled status item "hlabs · Running · 11 apps", "Open Dashboard", "Copy dashboard address", "Back up now", a check item "Start at login", "Pause all apps", "Check for updates…", "Reset a password…", "Quit hlabs".
- **Given** a native menu, **then** there is no stats grid or custom styling; state changes (Starting, Paused, Update available, Engine stopped, Can't reach hlabs) are shown by the status item text and by swapping the relevant action (e.g. "Resume apps", "Restart to update", "Start engine").
- **Given** the menu is open, **when** status changes, **then** the status item text is updated in place within 5 s.
- **Given** "Reset a password…", **when** chosen, **then** the same window as `TrayResetPassword` opens, confirmed by a polkit prompt.
- **Given** GNOME without the AppIndicator extension, **when** the tray can't register an icon, **then** hlabs shows a one-time notification "Install the AppIndicator extension to see hlabs in the top bar" and keeps running.

**Implementation notes**
- Tauri tray on Linux uses libayatana-appindicator; menus rebuilt on state change.
- UI: native `Menu` only; icon as symbolic SVG that follows the panel theme.

### US-INST-27 · First run on a Linux desktop
**Feature:** F-INST-10 · **Priority:** Polish · **Phase:** 6 · **Screens:** `LinuxTray`
**As** a new user on a Linux desktop, **I want** first run to set up hlabs like on a Mac, **so that** it starts when I log in.

**Acceptance criteria**
- **Given** hlabs is installed from the `.deb`, `.rpm` or AppImage and run for the first time, **when** setup runs, **then** it installs the user unit `~/.config/systemd/user/hlabsd.service`, runs `systemctl --user enable --now hlabsd`, writes `~/.config/autostart/hlabs.desktop`, and stores the tray token in Secret Service.
- **Given** the daemon becomes ready, **when** onboarding is incomplete, **then** the default browser opens onboarding (as US-INST-02).
- **Given** Secret Service is not available, **when** setup runs, **then** it falls back to a plain token file in the data dir (mode 0600, owned by the desktop user; like the headless file in D-035 it is protected by file permissions, not encryption) and continues.
- **Given** "Start at login" is toggled in the tray or in Settings (`startup.changeRequested`, D-042), **when** the tray applies it, **then** it enables or disables both the user unit and the autostart entry.

**Implementation notes**
- API: `onboarding.status`, `tray.setStartAtLogin`.
- Edge cases: Caddy needs ports 80/443 as a user service; the package post-install grants `cap_net_bind_service` on the bundled `caddy` binary.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
