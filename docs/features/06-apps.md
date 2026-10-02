# 06 · Using & managing apps

Everything that happens after an app is installed: opening it, checking that it is healthy, starting and stopping it, changing its settings, folder and network access, reading its logs and resource use, moving its data and uninstalling it. Admins manage apps; members can only open the apps an admin has shared with them.

**Screens:** `AppWindow` (P1), `AppSettings` (P1), `AppLogs` (P1), `UninstallConfirm` (P1), `AppConfig` (P2), `AppPermissions` (P2), `AppUsageDetail` (P2), `AppMoveData` (P3).
**Depends on:** 04-home.md (Home grid, `HomeStates` app tile states), 05-app-store.md (install, manifest prompts, updates), 07-files.md (folder picker), 08-usage-backups.md (usage sampling, backup plan), 09-account-people.md (app access for members), 10-system-settings.md (storage locations, remote access), 11-system-states.md (engine stopped, daemon down).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-APP-01 | Open an app | P1 | 2 | `AppWindow` |
| F-APP-02 | App settings overview and controls | P1 | 2 | `AppSettings` |
| F-APP-03 | App logs | P1 | 2 | `AppLogs` |
| F-APP-04 | Uninstall an app | P1 | 2 | `UninstallConfirm` |
| F-APP-05 | App configuration | P2 | 7 | `AppConfig` |
| F-APP-06 | App permissions | P2 | 7 | `AppPermissions`, `AppSettings` |
| F-APP-07 | Per-app usage | P2 | 7 | `AppUsageDetail` |
| F-APP-08 | Move app data | P3 | 8 | `AppMoveData` |

## User stories

### US-APP-01 · Open an app in a window
**Feature:** F-APP-01 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppWindow`
**As** anyone signed in, **I want** to click an app on Home and use it inside hlabs, **so that** I don't have to remember its address.

**Acceptance criteria**
- **Given** I am on Home on a desktop layout (≥ 1024px), **when** I click a running app's tile and its manifest sets `web.embed: true`, **then** an app window opens over the wallpaper with the app's icon and name, a status label ("Running"), its address (e.g. `jellyfin.hlabs.local`) and the app's own web interface in an embedded frame loading `https://<hostname>.hlabs.local<web.path>`.
- **Given** an app window is open, **when** I open a different app from Home, **then** the new app replaces the current window (only one app window at a time).
- **Given** the window is open, **when** I press "Back to Home" or "Close app", **then** the window closes and Home is shown; closing does not stop the app.
- **Given** focus is on the window chrome (not inside the frame), **when** I press Esc, **then** the window closes.
- **Given** the frame is still loading, **when** 1 s passes without the frame's `load` event, **then** a spinner shows in the frame area; **given** 20 s pass without `load`, **then** the frame area shows "This app is taking a while to respond." with "Open in a new tab".
- **Given** the app's manifest does not set `web.embed` or sets it to `false` (the default, D-038), **when** I click its tile, **then** hlabs skips the window and opens the app in a new browser tab (`rel="noopener"`). This is the default for most apps.
- **Given** I am a member, **when** I open an app I have access to, **then** it opens the same way; forward auth passes because my session cookie is set on `.hlabs.local`.

**Implementation notes**
- API: `apps.list` / `apps.get` (hostname, state, manifest `web`, and `urls { lan, tailnet? }`). `urls.lan` is `https://<hostname>.hlabs.local`, or the fallback address `https://hlabs.local:<port_fallback>` when mDNS is unavailable. These are available to any signed-in user with access to the app; member-facing UI never calls `network.status` (admin-only).
- Data: `apps`, `app_access`.
- UI: GlassCard window, AppIcon, StatusDot, Button. Route `/apps/:appId` so the window survives a page reload.
- Framing: Caddy app routes replace an upstream `X-Frame-Options` header with `Content-Security-Policy: frame-ancestors <dashboard origins>` (hlabs.local and the tailnet host). Only apps that declare `web.embed: true` are framed; `web.embed` defaults to `false` (D-038), so apps that set their own `frame-ancestors` or block framing simply open in a new tab.
- Phone layout is covered by 12-phone.md.
- Edge case: the dashboard is on the tailnet host; the frame (or new tab) must use the app's tailnet address `https://hlabs.<tailnet>.ts.net:<port>` (D-012), not `.hlabs.local`.

### US-APP-02 · App window controls
**Feature:** F-APP-01 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppWindow`
**As** an admin, **I want** quick controls on the app window, **so that** I can restart a misbehaving app or check its logs without leaving it.

**Acceptance criteria**
- **Given** I am an admin, **when** an app window is open, **then** the header shows "Restart app", "Logs", "App settings", "Open in a new tab" and "Close app" (icon buttons with those accessible names and tooltips).
- **Given** I am a member, **when** an app window is open, **then** only "Open in a new tab", "Close app" and "Back to Home" are shown.
- **Given** I press "Restart app", **when** the restart runs, **then** the status label changes to "Restarting…", the frame shows a spinner, and when `app.stateChanged` reports `running` the frame reloads automatically.
- **Given** I press "Logs", **then** `AppLogs` opens for this app; **given** I press "App settings", **then** `AppSettings` opens on the Overview tab.
- **Given** I press "Open in a new tab", **then** the app URL opens in a new tab (`rel="noopener"`) and the window stays open.
- **Given** the app state changes while the window is open (via `events.stream`), **then** the status label updates within 1 s without reloading the frame.

**Implementation notes**
- API: `apps.restart` (admin), `events.stream` (`app.stateChanged`).
- UI: Button (icon variant), StatusDot, Toast on restart failure mapped from `hlabsCode`.
- Status labels by `apps.state`: running "Running", starting "Starting…", restarting "Restarting…", stopping "Stopping…", stopped "Stopped", updating "Updating…", rolling_back "Rolling back…", error "Not responding", uninstalling "Uninstalling…".

### US-APP-03 · Opening an app that isn't running
**Feature:** F-APP-01 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppWindow`
**As** anyone signed in, **I want** to be told clearly when an app can't be opened, **so that** I'm not left staring at a blank frame.

**Acceptance criteria**
- **Given** the app is `stopped`, **when** I open it, **then** the frame area shows "<App> is stopped." and, for admins, a "Start" button; members see "Ask an admin to start it."
- **Given** the app is `error`, **when** I open it, **then** the frame area shows "<App> isn't responding." and, for admins, "Restart app" and "Logs" buttons.
- **Given** the app is `starting`, `restarting`, `updating` or `rolling_back`, **when** I open it, **then** the frame area shows the status with a spinner and loads the app automatically once it becomes `running`.
- **Given** I am a member without access to the app (e.g. a stale link to `/apps/:appId`), **when** I open it, **then** I see the "You don't have access to this" page (US-STATE-20) with "Back to Home", not a redirect or a 404; `apps.get` returns FORBIDDEN.
- **Given** the container engine is stopped, **when** I open any app, **then** the frame area shows the engine-stopped message from 11-system-states.md.

**Implementation notes**
- API: `apps.get`, `apps.start`, `apps.restart`.
- UI: GlassCard, Button, StatusDot.
- The embedded frame is only mounted when state is `running`, so no forward-auth or 502 pages leak into the window.

### US-APP-04 · See an app's status and start, stop or restart it
**Feature:** F-APP-02 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppSettings`
**As** an admin, **I want** one place that shows an app's state and lets me control it, **so that** I can keep it running.

**Acceptance criteria**
- **Given** I open App settings for a running app, **then** the header shows the app icon, name and "Running · up 6 days" (uptime from the web container's start time, rounded: "up 3 minutes", "up 5 hours", "up 6 days") and a "Close" button.
- **Given** the settings are open, **then** a TabBar labelled "App sections" shows "Overview", "Configuration", "Permissions", "Usage"; tabs whose feature is not built yet are hidden.
- **Given** the app is running, **then** the action row shows "Open", "Restart", "Stop", "Logs"; **given** it is stopped, **then** "Stop" becomes "Start".
- **Given** I press Stop, Start or Restart, **then** all three buttons are disabled until `app.stateChanged` reports a settled state (`running`, `stopped` or `error`), and the header status updates live.
- **Given** a start or restart ends in `error`, **then** a Toast shows "<App> didn't start. Check the logs." with a "Logs" action.
- **Given** I am a member, **when** I navigate to `/apps/:appId/settings`, **then** I see the "You don't have access to this" page (US-STATE-20) and every `apps.*` mutation returns FORBIDDEN.
- **Given** I press "Close", **then** I return to where I came from (app window or Home). Opened from the app window, App settings is a dialog over the window, which stays open with its frame as it was (D-096).

**Implementation notes**
- API: `apps.get`, `apps.start`, `apps.stop`, `apps.restart`, `events.stream`.
- Data: `apps.state`, `apps.state_detail`.
- UI: GlassCard, TabBar, Button, StatusDot, Toast.
- Stop sets desired state stopped so the reconciler (02 §2.3) does not restart it at next boot.

### US-APP-05 · App address and tailnet address
**Feature:** F-APP-02 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppSettings`
**As** an admin, **I want** to see and copy the app's addresses, **so that** I can open it from other devices or bookmark it.

**Acceptance criteria**
- **Given** the Access section, **then** it shows the app URL (e.g. `https://vaultwarden.hlabs.local`) as a link that opens in a new tab, with "Copy".
- **Given** remote access is on, **then** a second row "Also on your tailnet" shows the app's tailnet address `https://hlabs.<tailnet>.ts.net:<port + 2000>` (its tailnet port on the dashboard's tailnet name, D-012, D-110) with "Copy"; **given** remote access is off, **then** this row is hidden.
- **Given** phase 3 (remote access) has not shipped, **then** the tailnet row is hidden until phase 3 ships (D-036).
- **Given** the mDNS name can't be published, **then** the row shows the fallback `https://hlabs.local:<port>` instead.
- **Given** I press "Copy", **then** the URL is copied and a Toast shows "Address copied".

**Implementation notes**
- API: `apps.get` (hostname, `port_fallback`, `urls { lan, tailnet? }`); the tailnet address comes from `urls.tailnet`, not `network.status`.
- UI: ListRow, Button, Toast.

### US-APP-06 · Behaviour switches
**Feature:** F-APP-02 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppSettings`
**As** an admin, **I want** to choose whether an app starts automatically, is backed up and updates itself, **so that** each app behaves the way I want.

**Acceptance criteria**
- **Given** the Behaviour section, **then** it shows three Switches: "Start automatically", "Include in backups", "Update automatically", reflecting saved values.
- **Given** I toggle "Start automatically", **then** it saves immediately (optimistic); on error it flips back and a Toast explains why.
- **Given** "Start automatically" is off, **when** the daemon starts, **then** the reconciler leaves the app stopped.
- **Given** I toggle "Include in backups", **then** the app is added to or removed from the backup plan's includes.
- **Given** I toggle "Update automatically" on, **then** new versions are installed in the nightly 03:00–05:00 window after backups finish (US-STORE-16, D-026, D-034), using the rollback rule in 02 §2.5; **given** the app is a custom app, **then** the switch is disabled with the hint "Custom apps never update automatically".
- **Given** any switch changes, **then** an `audit_log` entry is written with the old and new value.
- **Given** a switch depends on a later phase, **then** it is hidden until that phase ships (D-036): "Include in backups" until phase 5, "Update automatically" until phase 7.

**Implementation notes**
- API: `apps.setAutostart`, `apps.setAutoUpdate`, `backups.plan.get` / `backups.plan.update` (`include_json`).
- Data: `apps.autostart`, `apps.auto_update`, `apps.custom`, `backup_plan.include_json`, `audit_log`.
- UI: Switch, ListRow, Toast.

### US-APP-07 · Storage, resources and version
**Feature:** F-APP-02 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppSettings`
**As** an admin, **I want** to see where an app keeps its data, what it uses right now and which version it runs, **so that** I can spot problems at a glance.

**Acceptance criteria**
- **Given** the Storage and resources section, **then** "Data folder" shows the app-data path (e.g. `~/hlabs/app-data/vaultwarden`) with a "Move…" button that opens `AppMoveData`; "Move…" is hidden until F-APP-08 is built.
- **Given** the app is running, **then** "Using now" shows "CPU 1% · Memory 64 MB · Disk 210 MB", updated live from `usage.sample` events; pressing it opens the Usage tab.
- **Given** the app is stopped, **then** "Using now" shows "Stopped · Disk 210 MB".
- **Given** phase 4 (usage monitoring) has not shipped, **then** the live CPU and memory numbers in "Using now" are hidden until phase 4 ships (D-036), and pressing the row does nothing until the Usage tab ships (phase 7).
- **Given** the installed version is the latest in the store, **then** the footer shows "Version <version> · up to date"; **given** an update exists, **then** it shows "Version <version> · <new version> available" with an "Update" button that starts `apps.update` and shows progress in the header.
- **Given** the footer, **then** it shows "Uninstall…" (destructive style) which opens `UninstallConfirm`.

**Implementation notes**
- API: `apps.get`, `usage.current`, `store.listUpdates`, `apps.update` → job, `jobs.get`.
- Data: `apps.version`, `usage_samples`, `jobs`.
- UI: ListRow, Button, Progress, Badge.
- Disk = size of `app-data/<appId>` plus the app's image layers; computed by the usage service and cached for 10 minutes.

### US-APP-08 · Follow an app's logs live
**Feature:** F-APP-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppLogs`
**As** an admin, **I want** to watch an app's logs as they happen, **so that** I can see why it misbehaves.

**Acceptance criteria**
- **Given** I open Logs from `AppWindow` or `AppSettings`, **then** the view is titled "<App> logs" with a back button to where it was opened from ("Back to app settings", or "Back to <App>" from the window, where Logs is a dialog over it, D-096), and shows the last 500 lines across all containers, oldest first, each with local time (`HH:mm:ss`), a level Badge (INFO, WARN, ERROR, DEBUG when detected) and the message.
- **Given** "Following" is on (default), **when** new lines arrive, **then** they append within 1 s and the list stays scrolled to the bottom, ending with a blinking cursor line.
- **Given** I scroll up, **then** "Following" switches off and new lines stop auto-scrolling; **when** I press "Following" again, **then** it jumps to the newest line and resumes.
- **Given** more than 5,000 lines are loaded, **then** the oldest are dropped from the view (download still gets everything).
- **Given** the app has no log output yet, **then** the view shows "No logs yet."
- **Given** I am a member, **then** Logs is not reachable and `apps.logs` returns FORBIDDEN (logs may contain secrets, 07 §7.6).

**Implementation notes**
- API: `apps.logs` (tail + since, initial load), `apps.watchLogs` (subscription, added) which makes the daemon attach to the containers' log streams only while subscribed and emit `app.log` lines.
- UI: List (virtualised), Badge, Switch-style toggle for "Following", monospace text, `aria-live="polite"` off while following to avoid screen-reader flooding.
- Level detection: regex on common forms (`INFO`, `[warn]`, `level=error`, JSON `"level"`); ERROR also covers FATAL, CRITICAL, PANIC. Lines with no level get no Badge.
- Edge case: container restarts while following; the stream reattaches and inserts a divider "Container restarted".

### US-APP-09 · Filter logs
**Feature:** F-APP-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppLogs`
**As** an admin, **I want** to narrow logs to one container, to errors or to some text, **so that** I find the relevant lines quickly.

**Acceptance criteria**
- **Given** the toolbar, **then** it shows a "Filter logs" TextField, a "Container" Segmented with "All" plus one option per compose service (e.g. "server"), and an "Errors only" toggle.
- **Given** I type in "Filter logs", **then** within 200 ms only lines containing the text (case-insensitive) are shown, with matches highlighted; clearing restores all lines.
- **Given** I pick a container, **then** only that service's lines show and the view reloads its last 500 lines; "All" interleaves services by timestamp and prefixes each line with the service name.
- **Given** "Errors only" is on, **then** only ERROR-level lines are shown.
- **Given** filters leave nothing, **then** the view shows "No lines match these filters." with "Clear filters".
- **Given** the app has one service, **then** the Container control is hidden.

**Implementation notes**
- API: `apps.logs` (`service?`), `apps.watchLogs` (`service?`).
- UI: TextField, Segmented, Switch, Button.
- Filtering of text and level happens client-side on loaded lines; container choice is server-side.

### US-APP-10 · Download logs
**Feature:** F-APP-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppLogs`
**As** an admin, **I want** to download an app's logs, **so that** I can attach them to a bug report.

**Acceptance criteria**
- **Given** I press "Download", **then** a plain-text file `<appId>-logs-<YYYYMMDD-HHmm>.log` downloads containing every retained line (up to 30 MB per service, per the json-file log options) for the selected container, or all containers prefixed with the service name.
- **Given** the text filter or "Errors only" is active, **then** the download still contains all lines of the selected container (the filters only affect the view); a tooltip says so.
- **Given** the download fails, **then** a Toast shows "Couldn't download logs." with "Try again".
- **Given** a member calls the download route, **then** it returns 403.

**Implementation notes**
- API: `GET /api/apps/:appId/logs/download?service=` (non-tRPC streaming route, added).
- UI: Button, Toast.
- Stream from Docker logs to the response; do not buffer the whole file in memory.

### US-APP-11 · Confirm uninstall and choose what happens to data
**Feature:** F-APP-04 · **Priority:** P1 · **Phase:** 2 · **Screens:** `UninstallConfirm`
**As** an admin, **I want** to decide whether an app's data is kept when I uninstall it, **so that** I don't lose things by accident.

**Acceptance criteria**
- **Given** I press "Uninstall…" in App settings, **then** a Dialog titled "Uninstall <App>?" shows "The app stops and is removed from your Home screen." and a radio group labelled "What happens to its data".
- **Given** the dialog opens, **then** "Keep its data" ("Reinstalling later picks up where you left off.") is selected by default.
- **Given** the second option, **then** it reads "Delete its data too" with "Removes <size>. This can't be undone." where size is the app-data size.
- **Given** "Keep its data" is selected, **then** the confirm button reads "Uninstall"; **given** "Delete its data too" is selected, **then** it reads "Uninstall and delete data" in destructive style.
- **Given** I press "Cancel" or Esc, **then** nothing changes.
- **Given** another installed app lists this app in `dependsOn`, **then** the dialog shows "<Other app> needs <App>. Uninstall it first." and the confirm button is disabled.
- **Given** focus, **then** it starts on "Cancel" and is trapped in the dialog.

**Implementation notes**
- API: `apps.get` (size, dependents), `apps.uninstall` (`keepData`) → job.
- UI: Dialog, Button, radio List.
- Error code `APP_HAS_DEPENDENTS` if the server-side check fails.

### US-APP-12 · Uninstall runs and cleans up
**Feature:** F-APP-04 · **Priority:** P1 · **Phase:** 2 · **Screens:** `UninstallConfirm`
**As** an admin, **I want** uninstall to remove the app cleanly, **so that** no half-removed pieces are left behind.

**Acceptance criteria**
- **Given** I confirm, **then** the dialog closes, I return to Home, and the app tile shows the uninstalling state from `HomeStates` until the job finishes.
- **Given** the job runs, **then** it does `compose down`, removes the Caddy route and mDNS name, removes the app from every `home_layout`, `app_access` and backup plan includes, then keeps or deletes `app-data/<appId>`.
- **Given** "Keep its data", **then** the app's generated secrets (`.env`) are kept with the data so a later reinstall of the same app id starts with the same data and passwords.
- **Given** the job succeeds, **then** a Toast shows "<App> was uninstalled" and `audit_log` records the action with `keepData`.
- **Given** the job fails, **then** the app goes to `error` with `state_detail` explaining the step, and a notification offers "Try again".
- **Given** a member had the app open, **when** it is uninstalled, **then** their window shows "This app was removed." and closes to Home.

**Implementation notes**
- API: `apps.uninstall` → job, `jobs.get`, `events.stream` (`job.progress`, `app.stateChanged`).
- Data: `apps`, `app_env`, `app_mounts`, `app_access`, `home_layout`, `backup_plan`, `audit_log`, `jobs`.
- Existing backups of the app are not deleted.

### US-APP-13 · Edit environment variables
**Feature:** F-APP-05 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppConfig`
**As** an admin, **I want** to change an app's environment variables, **so that** I can configure it without editing files.

**Acceptance criteria**
- **Given** the Configuration tab, **then** "Environment variables" lists each variable as a Name and Value TextField with a "Remove variable" button, and the hint "Values from the app's manifest are pre-filled".
- **Given** a variable comes from a manifest `env` prompt, **then** its name is read-only, its value uses the control for its type (TextField for string/number, Switch for boolean, Segmented or Menu for select) and "Remove variable" is disabled.
- **Given** I press "+ Add variable", **then** a new empty row appears with focus in Name.
- **Given** a name is invalid (not `^[A-Z_][A-Z0-9_]*$`), duplicated, or reserved (`HLABS_*`, `TZ`, `PUID`, `PGID`), **then** the field shows an inline error and Save is disabled.
- **Given** a number prompt gets a non-number, **then** the field shows "Enter a number".

**Implementation notes**
- API: `apps.getConfig` (added; admin, secrets masked), `apps.setConfig`.
- Data: `app_env`, manifest in `catalog_apps.manifest_json` / app folder copy.
- UI: TextField, Switch, Segmented, Menu, Button, List.

### US-APP-14 · Secrets are hidden and can be revealed by an admin
**Feature:** F-APP-05 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppConfig`
**As** an admin, **I want** secret values masked unless I choose to reveal them, **so that** passwords aren't shown to anyone looking at my screen.

**Acceptance criteria**
- **Given** a variable is a secret, **then** its row shows a "secret" Badge and the value as `••••••••`, never sent to the browser until revealed.
- **Given** I press the reveal button, **then** the value is fetched and shown until I leave the tab or press hide; the action is written to `audit_log`.
- **Given** a secret was generated by hlabs (`generate: true`), **then** it can be revealed and copied but not edited (the hint says "Generated by hlabs").
- **Given** I add my own variable, **then** a "Secret" toggle on the row marks it as secret before saving.
- **Given** manifest prompts are `hidden: true`, **then** they appear only after "Show advanced".

**Implementation notes**
- API: `apps.revealSecret` (added; admin mutation), `apps.setConfig`.
- Data: `app_env.is_secret`, `app_env.secret_ref`; `.env` file 0600 (07 §7.7).
- UI: Badge, Button (icon), TextField (password type).

### US-APP-15 · Change web address and port
**Feature:** F-APP-05 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppConfig`
**As** an admin, **I want** to change an app's web address and its port on this computer, **so that** it has a name I like or doesn't clash with something else.

**Acceptance criteria**
- **Given** the Network section, **then** "Web address" shows a Subdomain TextField followed by ".hlabs.local" and the hint "Lowercase letters, numbers and dashes".
- **Given** the subdomain doesn't match `^[a-z0-9-]{1,40}$` or is already used by another app or is `hlabs`, **then** an inline error shows and Save is disabled.
- **Given** "Port on this computer", **then** it shows "App listens on <web.port> inside its container" and a Host port field showing "Auto" by default (hlabs picks a free port from 12000–12999 for the fallback address).
- **Given** I enter a host port, **then** it must be in 12000–12999 and free; the app's tailnet address uses that port + 2000, `https://hlabs.<tailnet>.ts.net:<port + 2000>` (D-012, D-110); a port outside that range shows "Choose a port from 12000 to 12999" and Save is disabled; if taken, saving fails with "Port <n> is already in use" (`APP_PORT_IN_USE`).
- **Given** the address changes and is saved, **then** the old address stops working, the new one is registered, and a Toast shows the new address with "Copy".

**Implementation notes**
- API: `apps.setConfig` (input extended with `hostname?`, `hostPort?`; added), `network.ports`.
- Data: `apps.hostname`, `apps.port_fallback`.
- UI: TextField, Toast.

### US-APP-16 · Save configuration and restart
**Feature:** F-APP-05 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppConfig`
**As** an admin, **I want** changes to apply in one step, **so that** I know the app now uses them.

**Acceptance criteria**
- **Given** nothing has changed, **then** "Save and restart app" is disabled.
- **Given** I press "Cancel", **then** all fields revert to saved values.
- **Given** I press "Save and restart app", **then** hlabs writes `.env`, re-renders the compose file, updates the Caddy route and mDNS if needed, and runs `compose up -d`; the header shows "Restarting…".
- **Given** the app comes back healthy, **then** a Toast shows "Saved. <App> restarted."
- **Given** the app doesn't become healthy within its health timeout, **then** the previous `.env` and compose file are restored, the app is restarted on them, and an error shows "<App> didn't start with the new settings, so they were undone."
- **Given** I switch tabs or close with unsaved changes, **then** a Dialog asks "Discard changes?" with "Keep editing" and "Discard".

**Implementation notes**
- API: `apps.setConfig`, `events.stream`.
- Data: `app_env`, `apps`, `audit_log` (keys changed, never values).
- UI: Button, Dialog, Toast.

### US-APP-17 · Folder access
**Feature:** F-APP-06 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppPermissions`
**As** an admin, **I want** to see and change which folders an app can reach, **so that** apps only see what I allow.

**Acceptance criteria**
- **Given** the Permissions tab, **then** it shows "Apps only see what you allow here. Changes take effect after a restart."
- **Given** the Folders section, **then** each mount shows its path as breadcrumbs (e.g. "Home › Documents", "NAS › Backups") and "Read only" or "Read and write", followed by the manifest label (e.g. "· for importing attachments").
- **Given** I press "+ Give access to a folder", **then** the folder picker from 07-files.md opens; after choosing a folder and "Read only" / "Read and write", it is added (mounted at `/mnt/hlabs/<folder-name>` inside the container).
- **Given** a mount is a required manifest folder, **then** I can change its folder or mode (if the manifest allows `rw`) but not remove it.
- **Given** a network drive is offline, **then** its row shows a warning "Not connected".
- **Given** the Devices section and the manifest requests no GPU or devices, **then** it reads "This app hasn't asked for USB, GPU or other device access."; otherwise it lists the requested devices read-only.

**Implementation notes**
- API: `apps.getConfig`, `apps.setPermissions` (added), `storage.locations.list`.
- Data: `app_mounts`, `storage_locations`.
- UI: List, ListRow, Button, Segmented (mode), FileItem.

### US-APP-18 · Network access
**Feature:** F-APP-06 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppPermissions`
**As** an admin, **I want** to cut an app off from the internet or from other apps, **so that** it can't reach more than it needs.

**Acceptance criteria**
- **Given** the Network section, **then** it shows Switches "Reach the internet" (with the manifest's reason, e.g. "Needed for website icons") and "Talk to other apps" ("Off keeps this app isolated from the rest").
- **Given** the app was installed, **then** defaults follow manifest `permissions.network` (`internet` → both on; `lan` → internet off; `none` → both off).
- **Given** I turn "Reach the internet" off and save, **then** after restart the app's containers cannot open outbound internet connections, and Caddy still serves the app.
- **Given** I turn "Talk to other apps" off and save, **then** the app's containers leave the shared `hlabs` network and other apps cannot reach them.
- **Given** "Cancel", **then** switches and folder changes revert; **given** "Save and restart app", **then** folder and network changes apply together with one restart and the same undo-on-unhealthy rule as US-APP-16.

**Implementation notes**
- API: `apps.setPermissions` (added).
- Data: new columns `apps.net_internet`, `apps.net_apps` (booleans).
- UI: Switch, Button, Toast.

### US-APP-19 · Require hlabs login in front of an app
**Feature:** F-APP-06 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppSettings`, `AppPermissions`
**As** an admin, **I want** to choose whether hlabs sign-in guards an app, **so that** apps with their own login aren't asked twice when I prefer that.

**Acceptance criteria**
- **Given** the Access section of the Overview, **then** a Switch "Require hlabs login" reads "Adds your hlabs sign-in in front of the app" and is on by default.
- **Given** I turn it off, **then** a Dialog warns "Anyone who can reach <address> will see <App>'s own sign-in page. Members without access to it in hlabs will no longer be blocked." with "Cancel" and "Turn off".
- **Given** I confirm, **then** the Caddy route drops forward auth immediately (no app restart) and `audit_log` records it.
- **Given** the manifest sets `web.auth: none`, **then** the switch is off by default.
- **Given** the manifest sets `ownLogin: true`, **then** the Access section and the Permissions tab show "Uses its own login too".
- **Given** the switch is on, **when** a member without access opens the app URL, **then** `/auth/verify` returns 403 and they see the "You don't have access to this" page (US-STATE-20).

**Implementation notes**
- API: `apps.setAuthMode`.
- Data: `apps.auth_mode`.
- UI: Switch, Dialog.

### US-APP-20 · Resource use tiles and 24-hour chart
**Feature:** F-APP-07 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppUsageDetail`
**As** an admin, **I want** to see how much an app uses over time, **so that** I can tell whether it is the one slowing things down.

**Acceptance criteria**
- **Given** the Usage tab, **then** three tiles show "CPU 1% · avg 0.4% today", "Memory 64 MB · peak 91 MB" (peak over the last 24 h) and "Disk 210 MB · data + image".
- **Given** the chart, **then** it is a LineChart titled "Memory · last 24 hours" with a MB axis and x labels every 6 hours ending at "now"; a Segmented above it switches between CPU (%), Memory (MB) and Network (KB/s, in and out as two lines), default Memory.
- **Given** the tab is open, **then** tiles update every 5 s from `usage.sample` and the chart's last point updates each minute.
- **Given** the app was stopped for part of the range, **then** the line has a gap for that time.
- **Given** the app was installed less than 10 minutes ago, **then** the chart shows "Collecting data — check back in a few minutes."
- **Given** I hover or focus a point, **then** a tooltip shows the time and value; the chart has a text summary for screen readers.

**Implementation notes**
- API: `usage.history` (scope appId, range 24h), `usage.appDetail` (added: current, today's average CPU, 24 h peak memory, disk, per-container stats), `events.stream` (`usage.sample`).
- Data: `usage_samples` (1m resolution).
- UI: GlassCard tiles, LineChart, Segmented.

### US-APP-21 · Per-container usage
**Feature:** F-APP-07 · **Priority:** P2 · **Phase:** 7 · **Screens:** `AppUsageDetail`
**As** an admin, **I want** to see each container of an app, **so that** I know which part of a multi-container app is heavy.

**Acceptance criteria**
- **Given** the Containers section, **then** each container shows its name (e.g. `vaultwarden-server`) and "64 MB · 1% CPU · ↓ 1 KB/s" (memory, CPU, current download rate), updated every 5 s.
- **Given** a container is not running, **then** its row shows "Stopped" or "Exited" with a StatusDot.
- **Given** I press a container row, **then** `AppLogs` opens filtered to that container.

**Implementation notes**
- API: `usage.appDetail`.
- UI: List, ListRow, StatusDot, Sparkline optional per row.

### US-APP-22 · Choose where to move an app's data
**Feature:** F-APP-08 · **Priority:** P3 · **Phase:** 8 · **Screens:** `AppMoveData`
**As** an admin, **I want** to move an app's data to another drive, **so that** I can free space on my main disk.

**Acceptance criteria**
- **Given** I press "Move…" on the Overview, **then** a Dialog "Move <App>'s data" shows "<size> · <App> stops while its data is copied, then starts again from the new place."
- **Given** the Destination list, **then** it shows "This computer" (marked "~/hlabs/app-data · current location" and not selectable when current), other local drives ("Local drive · <free> free") and each connected external drive ("External drive · <free> free", note "The app goes offline whenever this drive is unplugged"). Network drives (SMB/NFS) are never listed (D-011); a line under the list reads "Network drives aren't offered. App data needs a drive that's always connected and fast."
- **Given** a destination has less free space than the data size plus 10%, **then** it is disabled with "Not enough space".
- **Given** a checkbox "Keep the old copy until the move is verified", **then** it is on by default.
- **Given** no destination is chosen, **then** "Move data" is disabled; "Cancel" closes without changes.

**Implementation notes**
- API: `storage.locations.list` (filtered to local and external drives), `apps.get` (size), `apps.moveData` → job; the server rejects a network (SMB/NFS) location as the target (D-011).
- UI: Dialog, List (radio), Badge (warning), Button.

### US-APP-23 · Move job
**Feature:** F-APP-08 · **Priority:** P3 · **Phase:** 8 · **Screens:** `AppMoveData`
**As** an admin, **I want** the move to be safe, **so that** a failed move never loses data.

**Acceptance criteria**
- **Given** I press "Move data", **then** a job stops the app, copies the data, verifies sizes and checksums, points the app at the new place, starts it and waits for health; progress shows in the dialog and in App settings.
- **Given** "Keep the old copy until the move is verified" is on, **then** the old copy is deleted only after the app is healthy at the new place; **given** it is off, **then** the old copy is deleted as soon as the copy is verified.
- **Given** any step fails, **then** the app is started from the old place, partial copies are removed, and a notification explains what failed.
- **Given** the app is on an external drive that is unplugged, **then** the app goes to `error` with "Drive not connected" and starts again automatically when the drive returns.
- **Given** another exclusive job is running (02 §4 invariant 5) or a job for this app is running, **then** "Move data" is disabled with "Wait for <job> to finish"; a request that slips through is refused with `JOB_EXCLUSIVE_RUNNING`.
- **Given** the target is a network drive, **then** the job is refused before stopping the app; only local or external drives are allowed (D-011).

**Implementation notes**
- API: `apps.moveData` → job, `jobs.get`, `events.stream` (`job.progress`).
- Data: new column `apps.data_location_id` (references `storage_locations`), `jobs`, `audit_log`.
- UI: Progress, Toast.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
