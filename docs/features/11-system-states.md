# 11 · System states

The screens and shared patterns hlabs shows when something outside the normal flow happens: hlabs is updating, the daemon can't be reached, the container engine has stopped, or a page doesn't exist. This module also owns the patterns every other module reuses (the confirm dialog, toasts and notifications) and the global rules for turning errors and lost connections into plain user copy. Everyone who uses hlabs sees these states; admins additionally get the actions that fix them.

**Screens:** `SysUpdating` (P1), `SysDaemonDown` (P1), `SysEngineStopped` (P1), `SysDialogs` (P1), `NotFound404` (P3), `NoAccess` (P1).
**Depends on:** [01-install-tray](01-install-tray.md) (tray bootstrap and states), [02-onboarding](02-onboarding.md) (engine detection), [04-home](04-home.md) (Home, search), [10-system-settings](10-system-settings.md) (engine, storage, advanced, updates), [06-apps](06-apps.md) (app states).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-STATE-01 | hlabs updating | P1 | 4 | `SysUpdating` |
| F-STATE-02 | Can't reach hlabs | P1 | 1 | `SysDaemonDown` |
| F-STATE-03 | Engine stopped | P1 | 2 | `SysEngineStopped` |
| F-STATE-04 | Confirm dialog | P1 | 1 | `SysDialogs` |
| F-STATE-05 | Toasts and notifications | P1 | 1 | `SysDialogs` |
| F-STATE-06 | Global error handling and connection state | P1 | 1 | `SysDaemonDown`, `SysDialogs`, `NoAccess` |
| F-STATE-07 | Page not found | P3 | 8 | `NotFound404` |

## User stories

### US-STATE-01 · Show a full-screen updating state
**Feature:** F-STATE-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SysUpdating`
**As** anyone signed in, **I want** to see that hlabs is updating and how far along it is, **so that** I know the dashboard is not broken and I don't need to do anything.

**Acceptance criteria**
- **Given** an hlabs update is being applied, **when** any open dashboard receives the `system.status` event with `state: "updating"`, **then** within 1 s every route is replaced by the full-screen `SysUpdating` state titled "Updating hlabs", and the browser tab title becomes "Updating hlabs".
- **Given** the updating state is shown, **then** it shows a step line in the form "Step N of 4 · <label>", where the labels are, in order: "Installing update", "Restarting apps", "Checking apps", "Finishing up".
- **Given** the daemon cannot be reached at all during the update (step 1: files are being replaced and the daemon is restarting), **when** the page last saw `state: "updating"`, **then** it keeps showing "Step 1 of 4 · Installing update" and does not switch to "Can't reach hlabs" for up to 10 minutes.
- **Given** the updating state is shown, **then** the body reads "This page reloads by itself when the update finishes." and a "Go to Home" button is shown.
- **Given** the user clicks "Go to Home" before the update is finished, **when** the page reloads at `/`, **then** the updating state is shown again (no error, no blank page).
- **Given** the progress bar, **then** it fills to `(step - 1) / 4` of its width and animates within the current step; it is exposed to screen readers as a progressbar with `aria-valuetext` equal to the step line.
- **Given** a signed-out visitor opens the dashboard during an update, **then** they see the same updating state (it needs no session).

**Implementation notes**
- API: `events.stream` (`system.status`), `GET /healthz` (503 body `{ reason: "updating", step, steps, stepLabel }`, see API additions), `system.health`.
- Flow: the tray writes `<dataDir>/update-state.json` (`{ fromVersion, toVersion, startedAt }`) before the Tauri updater replaces files; the daemon emits `system.status { state: "updating" }` to all clients before it stops. On startup the daemon sees the marker and reports steps 2–4 through `/healthz` until ready, then deletes the marker. Step 2 = reconcile (restart autostart apps), step 3 = wait for app health (bounded at 120 s total, then continue), step 4 = scheduler start.
- The SPA stores `{ updating: true, since }` in `sessionStorage` (wrapped in try/catch) so a hard refresh during step 1 still renders `SysUpdating` instead of `SysDaemonDown`.
- UI: GlassCard centred on the wallpaper, Logo, Progress, Button (secondary) for "Go to Home". Respect reduced motion: no animated fill, only the step line changes.
- Data: `jobs` row of kind `system_update` (exclusive, invariant 5) while the daemon side of the update runs.
- Edge: two tabs open, one on the phone layout: both must show the state; the phone layout uses the same card full-width with a 16 px gutter.

### US-STATE-02 · Reconnect automatically when the update finishes
**Feature:** F-STATE-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SysUpdating`
**As** anyone signed in, **I want** the dashboard to come back on its own after an update, **so that** I don't have to refresh or sign in again.

**Acceptance criteria**
- **Given** the updating state is shown, **then** the page polls `GET /healthz` every 2 s.
- **Given** `/healthz` returns 200 and `system.health` reports a version different from the one the page was loaded with, **when** the poll succeeds, **then** the page does a full reload of the current route (to load the new web bundle) within 1 s.
- **Given** the page reloads after the update, **then** the user is still signed in (sessions survive a daemon restart) and lands on the route they were on, or Home if that route no longer exists.
- **Given** the dashboard is back, **then** a success toast "hlabs is up to date" with the new version number in the body is shown once per browser session.
- **Given** the update started in this tab from the Settings updates screen, **then** no extra confirmation is needed to see the result; the toast is the confirmation.

**Implementation notes**
- API: `GET /healthz`, `system.health` (public; must include `version`), `system.info` for the version shown in the toast.
- Polling stops as soon as the reload is triggered; clear the `sessionStorage` flag on successful load.
- UI: Toast (success).
- Edge: `/healthz` flaps (200 then 503) within one poll interval; require one 200 plus a successful `system.health` call before reloading.

### US-STATE-03 · Handle a failed or stuck update
**Feature:** F-STATE-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SysUpdating`, `SysDaemonDown`
**As** an admin, **I want** to be told clearly when an update did not finish, **so that** I know what to do next instead of waiting forever.

**Acceptance criteria**
- **Given** the updating state has been shown for 10 minutes without `/healthz` returning 200, **then** the page switches to the "Can't reach hlabs" state with the reason copy for `update_stuck` (see US-STATE-05). `update_stuck` is a client-side state decided by the SPA and the tray from how long the update has run; `/healthz` never returns it.
- **Given** the daemon refuses to start because a migration failed, **when** `/healthz` returns 503 with `reason: "migration_failed"`, **then** the page switches immediately to "Can't reach hlabs" with the `migration_failed` reason copy.
- **Given** the update was rolled back by the tray (Tauri updater failure), **when** the daemon comes back on the old version, **then** the page reloads and shows a danger toast "The update didn't install" that stays until dismissed, with the action "View details" opening the Settings updates screen.
- **Given** any of the failures above, **then** an entry is written to `audit_log` with action `system.update_failed` and the from/to versions.

**Implementation notes**
- API: `GET /healthz`, `settings.updates.get` (last attempt result), `notifications` (daemon creates a `critical` notification for admins on rollback).
- Data: `audit_log`, `notifications`, `jobs` (`system_update` → `failed`).
- UI: Toast (danger).
- Edge: a member sees the same states but the danger toast is only created for admins (`notifications.user_id = null` means all admins).

### US-STATE-04 · Serve a fallback page when the daemon is down
**Feature:** F-STATE-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDaemonDown`
**As** anyone, **I want** a helpful page instead of a browser error when hlabs isn't responding, **so that** I know the computer is reachable and what to check.

**Acceptance criteria**
- **Given** Caddy is running but the daemon at `127.0.0.1:7474` does not answer, **when** a browser opens `https://hlabs.local` (or the tailnet URL), **then** Caddy serves the static "Can't reach hlabs" page with HTTP status 503, not a 502 error.
- **Given** the fallback page, **then** it shows the title "Can't reach hlabs", the line "Trying again in 5 seconds…", a "Try now" button, and three numbered checks: "Check that the hlabs icon is in the menu bar (or tray) on the host computer.", "Make sure that computer is awake and on the same network, or on Tailscale.", and "On a Linux server, run" followed by the command in a copyable code block.
- **Given** the dashboard SPA is already open and `/healthz` fails for 10 s (and the page is not in the updating state), **then** the SPA shows the same "Can't reach hlabs" state in-app with the same copy and behaviour.
- **Given** the fallback page loads, **then** it works without the daemon: all HTML, CSS, fonts and the logo are inlined or served by Caddy from `<appResources>/web-fallback/`, and it has no dependency on `/trpc`.
- **Given** the page is viewed at phone width, **then** it fits with a 16 px gutter and the code block wraps rather than scrolling the page sideways.

**Implementation notes**
- API: `GET /healthz`. Caddy base config: `reverse_proxy 127.0.0.1:7474` with `handle_errors` for 502/503/504 that serves `web-fallback/index.html` (status 503) for page requests and `{ "reason": "daemon_unreachable" }` (status 503) for `/healthz`.
- The Linux command is `systemctl status hlabsd` (desktop: `systemctl --user status hlabsd`) to match the unit names in 02 §2.3; the screen mock shows `systemctl status hlabs` (see Open questions).
- UI: GlassCard, Logo, Button ("Try now"), numbered List. The fallback page uses the hlabs CSS tokens copied at build time; light and dark via `prefers-color-scheme`.
- Edge: Caddy itself is down or the machine is asleep: the browser's own error shows; nothing hlabs can do. The fallback page must not leak version, hostnames of apps, or user names.

### US-STATE-05 · Explain why hlabs can't be reached
**Feature:** F-STATE-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDaemonDown`
**As** anyone, **I want** the page to say why hlabs is down when it knows, **so that** I can tell "starting up" from "broken".

**Acceptance criteria**
- **Given** `/healthz` returns 503 with a `reason` (`starting`, `updating`, `migration_failed`, `storage_unavailable`, or `daemon_unreachable` from Caddy's error page), or the client is in the `update_stuck` state (updating for more than 10 minutes, US-STATE-03; not a `/healthz` reason), **then** the page shows one line of reason copy under the title, from this mapping: `starting` → "hlabs is starting. This usually takes less than a minute."; `daemon_unreachable` → no extra line (the checklist is enough); `migration_failed` → "hlabs couldn't update its database. Your data hasn't been changed. Open the hlabs app on the host computer to see details."; `storage_unavailable` → "hlabs can't find its storage folder. Check that the drive is connected."; `update_stuck` → "The update is taking longer than expected. Open the hlabs app on the host computer to see details."; any unknown reason → no extra line.
- **Given** the reason is `starting`, **then** the checklist is hidden and only the reason line, the countdown and "Try now" are shown.
- **Given** the reason changes between polls, **then** the line updates in place without a page reload and is announced through an `aria-live="polite"` region.
- **Given** a reason is shown, **then** it never includes raw error text, stack traces or file paths.

**Implementation notes**
- API: `GET /healthz` → `503 { reason }` (enum defined in `packages/api/src/health.ts`, shared by daemon, fallback page and SPA).
- Daemon startup (02 §2.3) sets `starting` until step 6, `migration_failed` when step 1 fails, `storage_unavailable` when the storage root is missing; engine problems never make `/healthz` fail, they surface as `engine.status` events and `SysEngineStopped` (see US-STATE-08). The client-side `update_stuck` copy lives in the same copy map but is not part of the `/healthz` enum.
- Edge: a unit test asserts every reason in the enum has an entry in the copy map (or is explicitly mapped to no line).

### US-STATE-06 · Retry on a countdown or on demand
**Feature:** F-STATE-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDaemonDown`
**As** anyone, **I want** the page to keep trying and let me retry right away, **so that** I get back in as soon as hlabs is up.

**Acceptance criteria**
- **Given** the "Can't reach hlabs" state, **then** it polls `/healthz` every 5 s and the line "Trying again in N seconds…" counts down 5, 4, 3, 2, 1 once per second, then reads "Trying again…" while the request is in flight.
- **Given** the user clicks "Try now", **then** a request is sent immediately, the button shows a spinner and is disabled until the request settles, and the countdown restarts at 5.
- **Given** `/healthz` returns 200, **then** the page loads the dashboard at the URL the user originally asked for (fallback page) or returns to the current route and refetches all queries (in-app state), within 1 s.
- **Given** the tab is hidden, **then** polling slows to every 30 s and returns to 5 s when the tab becomes visible, with an immediate check on visibility change.
- **Given** keyboard use, **then** "Try now" is the first focusable element and activates with Enter or Space.

**Implementation notes**
- API: `GET /healthz`.
- UI: Button with loading state. Countdown text is not announced every second (only the reason region is live).
- Edge: the request hangs; use a 4 s timeout per poll so the countdown never stalls.

### US-STATE-07 · Show the daemon-down state in the tray
**Feature:** F-STATE-02 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SysDaemonDown`
**As** an admin at the host computer, **I want** the tray icon to show that hlabs isn't responding and let me restart it, **so that** I can fix it without a terminal.

**Acceptance criteria**
- **Given** the tray polls `/healthz` every 5 s, **when** it has been unreachable or non-200 for 10 s, **then** the tray shows the daemon-down icon and menu exactly as specified in US-INST-13 (icon with a red dot; items "Restart hlabs", "Show logs", "Copy diagnostics", separator, "Quit hlabs"), and the menu header reads "Can't reach hlabs" with the reason copy from US-STATE-05 when available.
- **Given** the tray is in this state, **when** I choose "Restart hlabs", **then** it restarts the service (macOS: `launchctl kickstart -k gui/<uid>/dev.hlabs.daemon`; Linux desktop: `systemctl --user restart hlabsd`), and the header shows "Restarting…" until `/healthz` returns 200 or 60 s pass.
- **Given** the restart does not bring hlabs back within 60 s, **then** the header returns to "Can't reach hlabs" and the US-INST-13 menu stays in place.
- **Given** `/healthz` returns 200 again, **then** the tray returns to its normal icon and status within 5 s.
- **Given** the reason is `updating`, **then** the tray shows "Updating hlabs…" and no Restart action.

**Implementation notes**
- API: `GET /healthz`, `tray.status` once healthy. Restart is an OS call from the Tauri shell, not a tRPC call (the daemon is down).
- UI: TrayMenu (macOS), native menu (Linux, LinuxTray). Menu items and the red-dot icon are defined once in US-INST-13; this story only adds the header copy and restart behaviour.
- Edge: headless Linux has no tray; the fallback page checklist covers it.

### US-STATE-08 · Grey out Home when the engine has stopped
**Feature:** F-STATE-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `SysEngineStopped`
**As** anyone signed in, **I want** Home to show clearly that apps are offline because the engine stopped, **so that** I don't click apps that won't open and I know my data is safe.

**Acceptance criteria**
- **Given** the daemon reports the engine as stopped (`engine.status` event or `system.info.engine.state = "stopped"`), **then** Home shows a banner with the title "The container engine has stopped" and the body "All apps are offline. Your data is safe.", within 2 s of the event.
- **Given** the engine is stopped, **then** every app tile on Home is shown desaturated at reduced opacity, is not clickable, and has `aria-disabled="true"` with the accessible description "Offline: the container engine has stopped".
- **Given** the engine is stopped, **then** the "Install app" tile is disabled and host widgets (Live usage, Storage, Remote access, Backups) stay live and interactive; each of these widgets is hidden until its phase ships (D-036).
- **Given** the Dock, search (⌘K) and other sections, **then** they keep working; App Store "Install" and app start/stop/restart buttons are disabled with the tooltip "Start the container engine first".
- **Given** the banner, **then** "Details" opens Settings › Engine & startup (`SettingsRuntime`); "Start engine" is shown only to admins.
- **Given** a member, **then** the banner shows "Details" only; members never see "Start engine".
- **Given** the engine stopped while a user was on Home, **then** a `critical` notification "The container engine has stopped" is created once for admins (not repeated on each 10 s retry).

**Implementation notes**
- API: `system.info` (`engine: { kind, state }`), `events.stream` (`engine.status`), `notifications.list`.
- Data: `apps.state` is not rewritten while the engine is down; the UI overlays the offline look. `notifications` (severity `critical`, kind `engine_stopped`).
- UI: GlassCard banner in the danger tone at the top of Home, Button ("Details" secondary, "Start engine" primary), AppIcon with a `disabled` visual, Dock unchanged.
- Edge: Caddy app hostnames while the engine is down return Caddy's 502; route them to the engine-stopped static page variant (same fallback bundle) with "Go to Home".

### US-STATE-09 · Start the engine from the banner
**Feature:** F-STATE-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `SysEngineStopped`
**As** an admin, **I want** to start the container engine with one click, **so that** my apps come back without opening another program.

**Acceptance criteria**
- **Given** the admin clicks "Start engine", **then** the button shows a spinner and the label "Starting…", and `settings.engine.start` is called, returning a job.
- **Given** the engine kind, **then** the daemon starts it with: OrbStack `open -a OrbStack`; Docker Desktop `open -a Docker`; Colima `colima start hlabs`; Linux Docker Engine `systemctl start docker` through the privileged helper allow-list.
- **Given** the engine answers `docker.ping()` within 120 s (the same engine start timeout as US-INST-12), **then** the job succeeds, the banner disappears, autostart apps are reconciled (02 §2.3 step 4), and tiles return to normal as each app reaches `running`.
- **Given** the engine does not answer within 120 s or the start command fails, **then** the job fails, the button returns to "Start engine", and a danger toast shows the copy for `ENGINE_START_FAILED` with the action "Details" (opens `SettingsRuntime`).
- **Given** a job of an exclusive kind is running (invariant 5), **then** "Start engine" is disabled with the tooltip "Wait for the current task to finish".
- **Given** the action, **then** it is written to `audit_log` as `engine.start`.

**Implementation notes**
- API: `settings.engine.start` (new, admin mutation → `{ jobId }`), `jobs.get`, `events.stream` (`job.progress`, `engine.status`).
- Data: `jobs` (kind `engine_start`), `audit_log`.
- UI: Button loading state; Toast (danger).
- Edge: double-click must not start two jobs; the mutation returns the existing running `engine_start` job id.

### US-STATE-10 · Recover automatically when the engine comes back
**Feature:** F-STATE-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `SysEngineStopped`
**As** anyone signed in, **I want** Home to return to normal on its own when the engine is started elsewhere, **so that** I don't need to refresh.

**Acceptance criteria**
- **Given** the engine is started outside hlabs (for example, the user opens OrbStack), **when** the daemon's 10 s retry detects it, **then** an `engine.status { state: "running" }` event is emitted and the banner disappears within 2 s of the event.
- **Given** the engine came back, **then** the `engine_stopped` notification is marked read for all admins and a success toast "The container engine is running" is shown once.
- **Given** the engine comes back while the banner is hidden on a phone-layout sheet, **then** the next render of Home shows no banner (state is driven by the query cache, not local flags).

**Implementation notes**
- API: `events.stream` (`engine.status`), `system.info` invalidated on the event.
- Edge: engine flaps (stops and starts inside 10 s); debounce the banner by 3 s so it doesn't flash.

### US-STATE-11 · Confirm an action with the shared dialog
**Feature:** F-STATE-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`
**As** anyone signed in, **I want** a clear, consistent question before an action that disrupts things, **so that** I don't trigger it by accident.

**Acceptance criteria**
- **Given** any feature asks for confirmation, **then** it uses the shared confirm dialog with: a title phrased as a question naming the thing (for example "Restart all apps?"), a body that says what will happen (for example "Apps will be unavailable for about a minute. Anyone watching or syncing will be disconnected."), a "Cancel" button and a confirm button labelled with the verb (for example "Restart"), never "OK" or "Yes".
- **Given** the dialog opens, **then** focus moves into it, Tab cycles only within it, the page behind is inert, and the dialog has `role="alertdialog"` with the title and body as its label and description.
- **Given** the dialog is open, **when** the user presses Escape, clicks "Cancel", or clicks the backdrop, **then** it closes, nothing happens, and focus returns to the control that opened it.
- **Given** a non-destructive confirmation, **then** initial focus is on the confirm button; for a destructive one, initial focus is on "Cancel".
- **Given** the phone layout, **then** the dialog renders as a bottom sheet with the confirm button above "Cancel", both full-width.

**Implementation notes**
- API: none of its own; the caller passes the mutation.
- UI: Dialog, Button. Exposed as `confirm({ title, body, confirmLabel, tone, onConfirm, requirePassword?, typeToConfirm? })` from `apps/web/src/lib/confirm.tsx` returning a promise.
- Edge: opening a second confirm while one is open replaces nothing; the second call waits until the first closes.

### US-STATE-12 · Show progress and errors inside the confirm dialog
**Feature:** F-STATE-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`
**As** anyone signed in, **I want** the dialog to show that my action is running and tell me if it failed, **so that** I'm not left guessing.

**Acceptance criteria**
- **Given** the user clicks the confirm button, **then** it shows a spinner, both buttons are disabled, and Escape and backdrop clicks are ignored until the mutation settles.
- **Given** the mutation succeeds or returns a `{ jobId }`, **then** the dialog closes; long work continues to report through toasts and job progress, not the dialog.
- **Given** the mutation fails, **then** the dialog stays open, the buttons are re-enabled, and an inline error under the body shows the copy mapped from the error's `hlabsCode` (US-STATE-17).
- **Given** a destructive action (tone `danger`), **then** the confirm button uses the danger style (red) and the title names the target (for example "Uninstall Immich?").
- **Given** the dialog stays pending for more than 30 s, **then** it closes and the result arrives as a toast, so the user is never trapped.

**Implementation notes**
- UI: Dialog, Button (primary / danger, loading state).
- Edge: a network error while pending shows the offline copy inline, not a generic error.

### US-STATE-13 · Require a password or typed name for the riskiest actions
**Feature:** F-STATE-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`
**As** an admin, **I want** extra proof before a restore or factory reset, **so that** those actions can't happen from a stray click or an unattended session.

**Acceptance criteria**
- **Given** a confirm with `requirePassword`, **then** the dialog shows a password field labelled "Your password" and the confirm button is disabled until it is non-empty.
- **Given** a confirm with `typeToConfirm` (for example the hostname for factory reset), **then** the dialog shows "Type <value> to confirm" and the confirm button is enabled only when the typed text matches exactly (case-sensitive, trimmed).
- **Given** a wrong password, **when** the daemon returns `AUTH_INVALID_PASSWORD`, **then** the field shows "That password isn't right." and the field is cleared and focused; failures count towards the lockout in 07 §7.2.
- **Given** these variants, **then** they are used at least for: uninstall with data deletion (named, no password), restore and factory reset (password), factory reset (also typed hostname), move all data and engine switch (named, no password), matching 07 §7.8.

**Implementation notes**
- API: the caller's mutation carries the password (for example `system.factoryReset`, `backups.restore`); the dialog never calls an extra verify endpoint.
- UI: Dialog, TextField (type password, autocomplete `current-password`), Button (danger).
- Edge: password managers must be able to fill the field; paste is allowed in both fields.

### US-STATE-14 · Show toasts by severity
**Feature:** F-STATE-05 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`
**As** anyone signed in, **I want** short notices that match how serious they are, **so that** good news goes away on its own and problems stay until I've seen them.

**Acceptance criteria**
- **Given** a success toast (for example "Immich is ready" / "Open it from your Home screen."), **then** it auto-dismisses after 5 s.
- **Given** a warning toast (for example "Low disk space" / "8 GB left on this computer. Some apps may stop working."), **then** it auto-dismisses after 10 s.
- **Given** a danger toast (for example "Uptime Kuma couldn't start" / "Port 3001 is already in use by another program."), **then** it stays until the user dismisses it or takes an action.
- **Given** any toast, **then** hovering it or focusing inside it pauses its timer, and it has a Dismiss button labelled "Dismiss" for assistive tech.
- **Given** notification severities, **then** they map to toast tones as: `success` → success, `info` → neutral (5 s), `warning` → warning, `critical` → danger.
- **Given** reduced motion is on, **then** toasts appear and leave without sliding.

**Implementation notes**
- UI: Toast with tones `neutral | success | warning | danger`; icon plus colour (never colour alone). Success/warning/neutral live region `aria-live="polite"`; danger uses `role="alert"`.
- Placement: bottom-right on desktop, above the TabBar on phone.

### US-STATE-15 · Act on a toast
**Feature:** F-STATE-05 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`
**As** an admin, **I want** toasts to offer the next step, **so that** I can fix a problem directly from the notice.

**Acceptance criteria**
- **Given** a toast has actions, **then** it shows at most two action buttons, verb-first (for example "View logs" and "Retry" on "Uptime Kuma couldn't start"; "Manage storage" on "Low disk space").
- **Given** "View logs", **then** it opens the app's logs (`AppLogs`) for that app and dismisses the toast.
- **Given** "Retry", **then** it re-runs the failed action (for example `apps.start`), the button shows a spinner, and on success the toast is replaced by the success toast for that action; on failure the toast stays with updated copy.
- **Given** "Manage storage", **then** it opens Settings › Storage (`SettingsStorage`). The "Manage storage" action is hidden until phase 7 ships (D-036).
- **Given** a member receives a toast whose action needs admin rights, **then** the action is not shown (the toast shows only its text and Dismiss).

**Implementation notes**
- API: `notifications.action_json` carries `{ kind: 'navigate', to: string, params?: object } | { kind: 'mutation', procedure: string, input: object, label: string }` (05 Canonical names); `label` is the button text for a mutation action. Only procedures on an allow-list (`apps.start`, `apps.restart`, `backups.runNow`, `settings.updates.check`) can be run from a toast.
- UI: Toast, Button (small, secondary).
- Edge: the app was uninstalled after the toast appeared; "View logs" shows the 404 state (US-STATE-21), not a crash.

### US-STATE-16 · Stack toasts and keep them in sync with notifications
**Feature:** F-STATE-05 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`
**As** anyone signed in, **I want** several notices to stay readable and to match my notification list, **so that** I don't miss or double-handle anything.

**Acceptance criteria**
- **Given** more than 3 toasts, **then** at most 3 are visible, newest on top; older ones wait in a queue and appear as visible ones leave; danger toasts are never dropped from the queue.
- **Given** the daemon emits `notification.created` for the signed-in user (or for all admins when the user is an admin), **then** a toast is shown in every open session of that user.
- **Given** the user dismisses a toast that came from a notification, **then** `notifications.markRead` is called and the notification stays in the Home notifications list as read; other open sessions remove the same toast within 2 s.
- **Given** the same notification kind and target fires again while its toast is visible (for example repeated start failures), **then** the existing toast updates instead of a new one stacking.
- **Given** a toast that did not come from a notification (a local mutation result), **then** it is not written to `notifications` and dismissing it only hides it.

**Implementation notes**
- API: `events.stream` (`notification.created`), `notifications.markRead`, `notifications.list` (to dedupe on reconnect).
- Data: `notifications` (`severity`, `title`, `body`, `action_json`, `read_at`).
- Edge: after an SSE reconnect, notifications created during the gap are fetched and only unread `warning`/`critical` ones are shown as toasts; `success`/`info` ones are not replayed.

### US-STATE-17 · Map error codes to plain copy
**Feature:** F-STATE-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`
**As** anyone signed in, **I want** errors explained in plain words with a next step, **so that** I understand what went wrong without reading technical messages.

**Acceptance criteria**
- **Given** a tRPC error with an `hlabsCode`, **then** the UI shows the title and body mapped for that code (for example `APP_PORT_IN_USE` → "<App> couldn't start" / "Port <port> is already in use by another program."), with values filled from `cause.params`.
- **Given** an error without an `hlabsCode` or with an unknown one, **then** the UI shows "Something went wrong" / "Try again. If it keeps happening, check the logs in Settings › Advanced." and the raw message is only logged to the browser console.
- **Given** any user-facing error surface (toast, inline dialog error, form error), **then** it never shows stack traces, file paths, container IDs or raw Docker/restic output.
- **Given** the error catalogue in `packages/api/src/errors.ts`, **then** a unit test fails if any code lacks copy in `apps/web/src/lib/error-copy.ts`.
- **Given** the error surface, **then** mutations started from a button show errors as a danger toast; errors inside a dialog or form show inline next to the cause (field errors on the field).

**Implementation notes**
- API: `TRPCError` + `cause: { hlabsCode, params }` (05 Conventions). Minimum codes with copy in phase 1: `ENGINE_UNAVAILABLE`, `ENGINE_START_FAILED`, `APP_PORT_IN_USE`, `AUTH_LOCKED`, `AUTH_INVALID_PASSWORD`, `JOB_EXCLUSIVE_RUNNING`, `NOT_FOUND`, `FORBIDDEN`, `DISK_FULL`.
- UI: Toast (danger), inline error text in Dialog and TextField.

### US-STATE-18 · Reconnect the event stream
**Feature:** F-STATE-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDaemonDown`
**As** anyone signed in, **I want** live updates to resume by themselves after a blip, **so that** statuses on screen are never silently stale.

**Acceptance criteria**
- **Given** the `events.stream` SSE connection drops, **then** the client reconnects with backoff 1 s, 2 s, 4 s, 8 s, 16 s, then every 30 s, each with up to 20% jitter.
- **Given** reconnection succeeds, **then** the client sends the last event id it received, and if the server cannot resume from it, the client invalidates all TanStack Query caches so every visible view refetches.
- **Given** the stream has been down for more than 5 s but `/healthz` returns 200, **then** the "Reconnecting…" banner is shown (US-STATE-19).
- **Given** `/healthz` has been unreachable for 10 s, **then** the SPA switches to the in-app "Can't reach hlabs" state (US-STATE-04) instead of the banner.
- **Given** a `session.revoked` event for the current session, **then** the client closes the stream, clears its caches and goes to the login page with the message "You've been signed out."

**Implementation notes**
- API: `events.stream` using tRPC v11 tracked events (`tracked(id, data)`) so `lastEventId` works; the daemon keeps the last 500 events in memory for resume.
- Edge: tab hidden for hours; on visibility the client checks `/healthz` first, then reconnects immediately instead of waiting for backoff.

### US-STATE-19 · Show an offline banner
**Feature:** F-STATE-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDaemonDown`
**As** anyone signed in, **I want** a small banner when my device or the connection to hlabs drops, **so that** I know why nothing is updating.

**Acceptance criteria**
- **Given** the browser reports `navigator.onLine === false`, **then** a banner "You're offline" is shown at the top of every screen within 1 s.
- **Given** the device is online but the event stream is reconnecting (US-STATE-18), **then** the banner reads "Reconnecting…".
- **Given** either banner is shown, **then** data stays visible (no skeletons replace it) and mutations fail fast with the warning toast "You're offline. Try again when you're connected." without calling the server.
- **Given** the connection returns, **then** the banner disappears and queries refetch; no success toast is shown.
- **Given** the banner, **then** it uses `role="status"`, does not cover the TabBar or window controls, and fits at phone width.

**Implementation notes**
- UI: slim GlassCard strip with StatusDot (warning). One banner at a time; offline wins over reconnecting.
- Edge: captive portals report online; the stream/`/healthz` check catches that case as "Reconnecting…".

### US-STATE-20 · Send signed-out and forbidden requests to the right place
**Feature:** F-STATE-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SysDialogs`, `NoAccess`
**As** anyone, **I want** expired sessions and missing permissions handled consistently, **so that** I'm never stuck on a broken screen.

**Acceptance criteria**
- **Given** any query or mutation returns `UNAUTHORIZED`, **then** the SPA goes to `/login?next=<current path>` and, after sign-in, returns to that path.
- **Given** a mutation returns `FORBIDDEN`, **then** a danger toast "You don't have access to that." is shown and nothing else changes.
- **Given** a signed-in user opens a page or app they can't use (a query for a whole page returns `FORBIDDEN`, for example a member opening an admin settings URL, or `/auth/verify` returns 403 for an app not shared with them), **then** the "You don't have access to this" page is shown at the same URL: a GlassCard with the heading "You don't have access to this", the body "Ask an admin if you need it." and a "Go to Home" button. There is no redirect and never the 404 page. This is the single access-denied rule for every feature file and applies from phase 1.
- **Given** the "You don't have access to this" page, **then** its document title is "No access · hlabs", it fits at phone width with a 16 px gutter, and the TabBar is still shown on the phone layout.
- **Given** a signed-in user opens a dashboard URL that matches no route before phase 8, **then** the same card is shown with the heading "Page not found" and a "Go to Home" button; from phase 8 the full 404 page (US-STATE-21) replaces it.
- **Given** a mutation returns `JOB_EXCLUSIVE_RUNNING`, **then** a warning toast shows the mapped copy naming the running task (for example "Wait for the backup to finish, then try again.").

**Implementation notes**
- API: a single TanStack Query `onError` handler plus a tRPC link that inspects `data.code` and `cause.hlabsCode`. `/auth/verify` answers 403 with the static version of the "You don't have access to this" page from the fallback bundle for app hostnames.
- UI: one `AccessDenied` component (GlassCard, Button) used by every route guard; the pre-phase-8 "Page not found" card reuses it with different copy.
- Edge: multiple parallel `UNAUTHORIZED` responses must trigger only one navigation.

### US-STATE-21 · Show a page-not-found screen
**Feature:** F-STATE-07 · **Priority:** P3 · **Phase:** 8 · **Screens:** `NotFound404`
**As** anyone signed in, **I want** a friendly page when a link leads nowhere, **so that** I can get back to what I was doing.

**Acceptance criteria**
- **Given** a signed-in user opens a dashboard URL that matches no route (or a route whose resource no longer exists, such as an uninstalled app), **then** the page shows the eyebrow "Page not found", a large "404", the heading "This page doesn't exist", and the body "If you followed a link to an app, it may have been uninstalled or renamed."
- **Given** the page, **then** "Go to Home" navigates to Home and "Search" opens Spotlight (the same as ⌘K) with focus in the search field.
- **Given** the page, **then** the document title is "Page not found · hlabs" and the heading is the page's `h1`.
- **Given** a signed-out visitor opens an unknown dashboard URL, **then** they go to the login page first and see the 404 page after signing in.
- **Given** the phone layout, **then** the page fits with a 16 px gutter and the TabBar is still shown.

**Implementation notes**
- API: `apps.get` / other `get` queries return `NOT_FOUND` → the route renders this page; `home.searchEverything` powers Search.
- UI: GlassCard, Button ("Go to Home" primary, "Search" secondary), TabBar.

### US-STATE-22 · Show not-found for unknown app addresses
**Feature:** F-STATE-07 · **Priority:** P3 · **Phase:** 8 · **Screens:** `NotFound404`
**As** anyone, **I want** an unknown app address to show the hlabs not-found page, **so that** an old bookmark to an uninstalled app doesn't show a raw proxy error.

**Acceptance criteria**
- **Given** a request to `https://<name>.hlabs.local` for which Caddy has no route (on the tailnet, apps are ports on `hlabs.<tailnet>.ts.net` and an unused port is simply not served, D-012), **then** Caddy responds 404 with the static version of the not-found page from the fallback bundle.
- **Given** the static version, **then** it shows the same copy as US-STATE-21, "Go to Home" links to the dashboard URL, and "Search" is hidden (it needs the dashboard).
- **Given** the static page, **then** it does not reveal which apps are installed or whether the name ever existed.

**Implementation notes**
- API: none. `NetworkService` adds a catch-all `*.hlabs.local` route in the Caddy base config serving `web-fallback/404.html` with status 404.
- Edge: the dashboard hostname was renamed (RenameHostname); the old name gets this page with "Go to Home" pointing to the new name.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
