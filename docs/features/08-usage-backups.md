# 08 · Live usage & backups

Live usage shows how hard the computer and each app are working right now and over the last hour, day or week, so an admin can spot the app that is eating memory or the network. Backups keep encrypted, deduplicated copies (restic) of every app's data and the chosen Home folders on one or more destinations, and let an admin restore a whole system, one app or a folder from any restore point.

**Screens:** `LiveUsage` (P1), `UsageLoading` (Nice to have), `BackupsOverview` (P2), `BackupSchedule` (Nice to have), `BackupAddDest` (P2), `BackupRunDetail` (P3), `RestoreFlow` (P2), `RestoreProgress` (P1), `RestoreChooseDest` (P2), `BackupIncluded` (P2).
**Depends on:** [02-onboarding](02-onboarding.md) (storage root, engine), [06-apps](06-apps.md) (app lifecycle), [07-files](07-files.md) (Home folders, restored files), [10-system-settings](10-system-settings.md) (storage, updates), [11-system-states](11-system-states.md) (notifications, dialogs), [04-home](04-home.md) (Dock, widgets).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-USE-01 | Host usage at a glance | P1 | 4 | `LiveUsage` |
| F-USE-02 | Usage history charts | P1 | 4 | `LiveUsage` |
| F-USE-03 | Per-app usage table | P1 | 4 | `LiveUsage` |
| F-USE-04 | Usage sampling and history storage | P1 | 4 | `LiveUsage` |
| F-USE-05 | Usage loading and unavailable states | Nice to have | 9 | `UsageLoading` |
| F-BKP-01 | Backups overview | P2 | 5 | `BackupsOverview` |
| F-BKP-02 | Backup runs | P2 | 5 | `BackupsOverview`, `BackupIncluded` |
| F-BKP-03 | Backup destinations | P2 | 5 | `BackupAddDest`, `BackupsOverview` |
| F-BKP-04 | Schedule and retention | Nice to have | 9 | `BackupSchedule` |
| F-BKP-05 | Failed backup details | P3 | 8 | `BackupRunDetail` |
| F-BKP-06 | Restore | P1 | 5 | `RestoreChooseDest`, `RestoreFlow`, `RestoreProgress` |

## User stories

### US-USE-01 · See host CPU, memory, storage and network at a glance
**Feature:** F-USE-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** an admin, **I want** four summary tiles for CPU, memory, storage and network, **so that** I can tell in one look whether the computer is under pressure.

**Acceptance criteria**
- **Given** I open Usage from the Dock, **when** data has loaded, **then** I see the title "Live usage", a subtitle describing the engine (e.g. "Container VM (Colima) · 4 CPUs · 8 GB allocated"), a time range control ("1 hour", "24 hours", "7 days") and four tiles: "CPU", "Memory", "Storage", "Network".
- **Given** host data, **then** the CPU tile shows total host CPU as a whole percent (e.g. "18%") and the CPU model and core count ("Apple M1 · 8 cores").
- **Given** host data, **then** the Memory tile shows used memory with one decimal in GB ("9.4 GB") and "of 16 GB · 5.1 GB by apps", where "by apps" is the sum of memory of all hlabs app containers.
- **Given** host data, **then** the Storage tile shows used space on the storage root's disk ("114 GB") and "of 256 GB used"; the Network tile shows inbound rate ("2.1 MB/s") and "↓ in · 0.3 MB/s ↑ out".
- **Given** the engine is Docker Engine on Linux (no VM), **then** the subtitle reads "Docker Engine · uses the whole computer" (chosen copy); with OrbStack or Docker Desktop it names the engine and its CPU/memory limits from engine info.
- **Given** CPU tile value is 90% or more for 3 consecutive samples, or memory is 90% or more of total, **then** that tile's value uses the warning colour and a Badge "High" (text, not colour only).
- Units: bytes use 1000-based units (KB, MB, GB) with at most one decimal; rates use "/s".

**Implementation notes**
- API: `usage.current` (host + per-app latest sample), `system.info` (CPU model, cores, total memory), `settings.engine.get` (engine name, VM limits), `storage.summary` (disk used/total).
- Data: none persisted for tiles; values come from the in-memory ring buffer.
- UI: GlassCard per tile with Sparkline (last 60 samples of that metric, series colour chart-1); Segmented for the time range; Dock with "Usage" as the current area.
- Edge cases: machine with no network traffic shows "0 KB/s"; storage root on an external drive reports that drive, not the system disk.

### US-USE-02 · Tiles update live and respect who may see them
**Feature:** F-USE-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** anyone signed in, **I want** the numbers to update by themselves and only show me what I'm allowed to see, **so that** the page is trustworthy without refreshing.

**Acceptance criteria**
- **Given** the page is open, **when** a `usage.sample` event arrives (every 5 s), **then** tiles, Sparklines and the table update in place without layout shift.
- **Given** the browser tab is hidden, **when** it becomes visible again, **then** the page refetches `usage.current` once and resumes live updates; no samples are buffered client-side while hidden.
- **Given** I am a member and either the global "Members can see live usage" setting (`people.membersCanSeeUsage`) or my own per-member switch (`users.can_see_usage`) is off, **then** Usage is not in my Dock or tab bar and navigating to it shows the standard "You don't have access to this" page (US-STATE-20); `usage.*` returns `FORBIDDEN` (D-029).
- **Given** I am a member and both switches are on, **then** I see host tiles and only the apps in my `app_access` in the table and charts.
- **Given** reduced motion is on, **then** value changes are not animated.

**Implementation notes**
- API: `usage.current`, `events.stream` (`usage.sample`, filtered per user permissions in the daemon). `usage.*` uses `authedProcedure` plus a service check of the role and, for members, both switches.
- UI: numbers use tabular figures; each tile has `aria-live="off"` (live regions would be too chatty); the value is reachable by screen readers on focus.
- Edge cases: SSE reconnect after daemon restart resumes updates without a page reload.

### US-USE-03 · Change the time range
**Feature:** F-USE-02 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** an admin, **I want** to switch between the last hour, 24 hours and 7 days, **so that** I can see short spikes and longer trends.

**Acceptance criteria**
- **Given** the page opens, **then** "1 hour" is selected; my last choice is remembered per browser (local storage, guarded) and restored next time.
- **Given** I choose "24 hours" or "7 days", **then** the main chart and tile Sparklines load that range from `usage.history` and the chart heading changes to "CPU over the last 24 hours" / "CPU over the last 7 days".
- **Given** "1 hour" is selected, **then** the chart keeps appending live samples; for "24 hours" and "7 days" the chart refreshes every 60 s instead.
- **Given** history is shorter than the range (e.g. hlabs installed yesterday, "7 days" chosen), **then** the chart shows only the available data from its left edge with the empty span unlabelled, not zero-filled.
- **Given** the range is loading after a switch, **then** the previous chart stays visible and dimmed until the new data arrives (no flash to empty).

**Implementation notes**
- API: `usage.history` (scope `host` or appId, range `1h`/`24h`/`7d`); `30d` is supported by the API but not shown on this screen.
- UI: Segmented with `aria-label="Time range"`, arrow keys move between options.
- Edge cases: clock change or DST during the range does not produce duplicate x-axis labels (timestamps are UTC ms, labels local).

### US-USE-04 · Read a metric's history and its peak
**Feature:** F-USE-02 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** an admin, **I want** a large chart for the metric I pick with its peak called out, **so that** I can see when something spiked.

**Acceptance criteria**
- **Given** the page opens, **then** the main chart shows CPU with the heading "CPU over the last hour" and a caption "Peak 46% at 16:32" (the highest point in the range, local time; for "7 days" the caption includes the day, e.g. "Peak 61% on Tue 14:00").
- **Given** I click or press Enter on a tile, **then** that tile becomes selected (`aria-pressed="true"`) and the main chart switches to it: CPU → LineChart (percent); Network → LineChart with two series "In" (chart-1) and "Out" (chart-2); Memory → StackedBar of memory by app over time; Storage → one StackedBar "Storage by use" (Apps, Files, System, Free) from `storage.summary`, without a peak caption.
- **Given** the Memory StackedBar, **then** it shows the five apps with the most memory in the range in fixed order chart-1..chart-5 and "Other" (all remaining apps plus hlabs and the system) as chart-6.
- **Given** any chart, **then** series colours are assigned chart-1..chart-6 in fixed order and never reused within one chart; a legend names every series.
- **Given** I hover a point, **then** a tooltip shows the local time and value(s) formatted like the tiles.

**Implementation notes**
- API: `usage.history` returns points plus `peak { ts, value }` computed server-side for the requested metric; `storage.summary`.
- UI: LineChart, StackedBar, Sparkline from `packages/ui`; y-axis for CPU fixed 0–100%.
- Edge cases: a range where every value is 0 shows a flat line and "Peak 0%"; apps uninstalled during the range still appear under their name in the Memory chart.

### US-USE-05 · Use the charts with a keyboard and screen reader
**Feature:** F-USE-02 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** anyone signed in, **I want** charts I can step through without a mouse, **so that** the data is accessible to me.

**Acceptance criteria**
- **Given** focus is on a chart, **when** I press Left or Right, **then** the focused point moves one step and its tooltip is shown and announced (e.g. "16:32, CPU 46%"); Home and End jump to the first and last point.
- **Given** a StackedBar with several series, **when** I press Up or Down, **then** focus moves between series within the same bar.
- **Given** any chart (including Sparklines), **then** a visually hidden data table with the same values (time plus one column per series) is rendered next to it and linked with `aria-describedby`.
- **Given** a Sparkline in a tile, **then** it is decorative (`aria-hidden="true"`) because the tile's number and the main chart's table already carry the data.
- **Given** high-contrast or forced-colours mode, **then** series remain distinguishable by line style or pattern, not colour alone.

**Implementation notes**
- UI: chart rule from the design system — fixed series colour order chart-1..6, hidden data table, arrow-key stepping — applies to LineChart and StackedBar; test with axe and keyboard-only e2e.
- Edge cases: charts with more than 500 points step through a downsampled set of at most 200 points so keyboard stepping stays usable; the hidden table uses the same set.

### US-USE-06 · Sort the per-app table
**Feature:** F-USE-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** an admin, **I want** a table of apps with CPU, memory and network that I can sort, **so that** I can find the heaviest app quickly.

**Acceptance criteria**
- **Given** apps are installed, **then** the table shows columns "App", "CPU", "Memory", "Network", "Status" with one row per app (AppIcon plus name, e.g. "Immich · 7.2% · 1.8 GB · 1.4 MB/s · Running").
- **Given** the page opens, **then** rows are sorted by Memory descending and the header shows "Memory ↓".
- **Given** I activate a column header (click, Enter or Space), **then** the table sorts by that column descending; activating it again toggles ascending; the arrow moves to that header and `aria-sort` is set.
- **Given** "App" or "Status" is sorted, **then** it sorts alphabetically A–Z first.
- **Given** a live update arrives, **then** values update but the row order is re-evaluated at most every 10 s, so rows don't jump while I'm reading.
- **Given** the sort I chose, **then** it is remembered per browser.
- CPU in the table is the app's share of total host CPU (so the table and the CPU tile use the same scale); Network is in + out combined.

**Implementation notes**
- API: `usage.current` (per-app entries: appId, cpu, memBytes, netRx, netTx, state).
- UI: List/ListRow in a table layout with real `<table>` semantics on desktop; on phone (< 768px) rows collapse to App + the sorted column + Status.
- Edge cases: an app with several containers sums all its containers; hlabs system containers (Caddy etc. are not containers) never appear.

### US-USE-07 · See stopped and failing apps in the table
**Feature:** F-USE-03 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** an admin, **I want** each app's status next to its usage, **so that** I understand why an app uses nothing or too much.

**Acceptance criteria**
- **Given** an app is `running`, **then** Status shows a StatusDot and "Running".
- **Given** an app is `stopped`, **then** its CPU, Memory and Network show "—", Status shows "Stopped", and it sorts below all running apps regardless of sort direction.
- **Given** an app is in `error`, `starting`, `updating` or `restarting`, **then** Status shows "Error", "Starting", "Updating" or "Restarting" with the matching StatusDot colour and text.
- **Given** no apps are installed, **then** the table area shows "No apps yet" and a Button "Browse the App Store".
- **Given** a member views the page (both switches on, D-029), **then** only apps they have access to are listed.

**Implementation notes**
- API: `usage.current`; state from `apps.list` and `app.stateChanged` events.
- Data: `apps.state`.
- Edge cases: app uninstalled while the page is open disappears on the next `app.stateChanged`.

### US-USE-08 · Sample host and app usage every 5 seconds
**Feature:** F-USE-04 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** an admin, **I want** hlabs to measure usage continuously in the background, **so that** the page has data the moment I open it.

**Acceptance criteria**
- **Given** the daemon is ready, **then** the scheduler samples host CPU, memory, disk and network and per-container stats every 5 s (±1 s) and keeps the last hour (720 samples) in an in-memory ring buffer.
- **Given** a sample is taken, **then** a `usage.sample` event is emitted and `usage.current` returns it.
- **Given** a single container stats call takes longer than 3 s or fails, **then** that app's values are marked missing for that sample and the rest of the sample is still published.
- **Given** the engine is stopped, **then** host samples continue and per-app stats are skipped.
- **Given** sampling runs on a machine with 30 running containers, **then** the sampler's own CPU use stays under 2% of one core on average (measured in a perf test).

**Implementation notes**
- Architecture §2.11: Node `os` + `systeminformation` for host; `docker.getContainer().stats({ stream: false })` per container, calls in parallel with a concurrency limit of 8.
- Network and disk rates are deltas between consecutive samples; the first sample after start reports no rate.
- Edge cases: counter reset (container restarted) gives a negative delta → treat as 0.

### US-USE-09 · Keep usage history at the right resolution
**Feature:** F-USE-04 · **Priority:** P1 · **Phase:** 4 · **Screens:** `LiveUsage`
**As** an admin, **I want** a week of detail and longer trends kept without filling my disk, **so that** history is useful and cheap.

**Acceptance criteria**
- **Given** the ring buffer, **then** every minute the daemon writes one `1m` point per scope (host and each app) with averaged values into `usage_samples`.
- **Given** `1m` points, **then** every hour one `1h` point per scope is written (average), `1m` points older than 7 days and `1h` points older than 90 days are deleted.
- **Given** `usage.history` range `1h`, **then** it serves 5 s points from the ring buffer, falling back to `1m` points for any part of the hour before the daemon started; `24h` serves `1m` points; `7d` serves `1h` points.
- **Given** the daemon restarts, **then** no history is lost except samples not yet flushed (at most 1 minute).

**Implementation notes**
- Data: `usage_samples` (`ts`, `resolution`, `scope`, `cpu`, `mem_bytes`, `net_rx`, `net_tx`, `disk_read`, `disk_write`); index on (`scope`, `resolution`, `ts`).
- API: `usage.history`.
- Edge cases: an app uninstalled keeps its history until it ages out.

### US-USE-10 · Show a loading state before usage arrives
**Feature:** F-USE-05 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `UsageLoading`
**As** anyone signed in, **I want** a calm placeholder while usage loads, **so that** the page doesn't jump or show zeros.

**Acceptance criteria**
- **Given** `usage.current` has not resolved, **then** the title "Live usage", engine subtitle and time range control are shown and the content area shows skeleton tiles, chart and table rows with `aria-busy="true"` and the accessible label "Loading usage".
- **Given** data arrives, **then** skeletons are replaced in place with no layout shift.
- **Given** loading takes less than 300 ms, **then** no skeleton is shown at all.
- **Given** reduced motion is on, **then** skeletons do not shimmer.

**Implementation notes**
- UI: GlassCard skeletons sized like the real tiles; TanStack Query `isPending`.
- Edge cases: switching time range never goes back to the full-page skeleton (see US-USE-03).

### US-USE-11 · Handle usage that can't be loaded
**Feature:** F-USE-05 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `UsageLoading`
**As** anyone signed in, **I want** a clear message when usage can't be read, **so that** I know it's not my apps using zero.

**Acceptance criteria**
- **Given** loading has not finished after 10 s or the request fails, **then** the skeleton is replaced with "Can't load usage right now" and a Button "Try again" that refetches.
- **Given** the engine is stopped, **then** host tiles load normally and the table area says "The container engine is stopped, so app usage isn't available." with a link to Settings › Engine & startup (admins only).
- **Given** the SSE stream drops, **then** the last values stay visible with a small "Paused · reconnecting" label until the stream resumes.

**Implementation notes**
- API: `usage.current`, `events.stream` (`engine.status`); error mapping via `hlabsCode` (`ENGINE_UNAVAILABLE`).
- UI: Button, Toast not used (inline message only).

### US-BKP-01 · See the last backup's status
**Feature:** F-BKP-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** the top of Backups to tell me when the last backup ran and what it covers, **so that** I know my data is safe.

**Acceptance criteria**
- **Given** the last run succeeded, **then** the header shows "Last backup 2 hours ago" (relative time) and "11 apps and 3 Home folders · next backup tonight at 03:00", plus Buttons "Restore…" and "Back up now".
- **Given** the last run failed, **then** the header reads "Last backup failed · 24 Sep, 03:00" in the critical colour with a "Details" link to `BackupRunDetail`, and the next-backup line is unchanged.
- **Given** no successful backup in more than twice the scheduled interval, **then** the header shows a warning Badge "Overdue".
- **Given** no destination exists yet, **then** the header reads "No backups yet" with "Add a destination to start backing up your apps and Home folders." (chosen copy), "Back up now" and "Restore…" are disabled, and "+ Add a destination" is the primary Button.
- **Given** I'm a member, **then** Backups is not in my Dock, tab bar or Settings sections, and `backups.*` returns `FORBIDDEN`.

**Implementation notes**
- API: `backups.overview` (last run, next run time, included counts, destinations summary, plan summary); live updates from `backup.run` events.
- Data: `backup_runs`, `backup_plan`, `backup_destinations`.
- UI: GlassCard, Button, Badge; Settings shell with "Backups" selected.
- Edge cases: "tonight"/"tomorrow"/weekday wording follows local time; when the plan is disabled the line reads "Scheduled backups are off".

### US-BKP-02 · See destinations and the schedule summary
**Feature:** F-BKP-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** to see where backups go and how often, **so that** I can check the setup without opening each setting.

**Acceptance criteria**
- **Given** destinations exist, **then** under "Destinations" each row shows the name and location ("NAS · nas.local/Backups"), "Encrypted · 38 GB used · 42 restore points", a status Badge ("Healthy", "Unreachable" or "Needs attention") and an "Edit" Button.
- **Given** no destination is off-site (no S3, SFTP or another hlabs), **then** below "+ Add a destination" the hint "An off-site copy (cloud or another drive) protects against theft or fire" is shown; otherwise it is hidden.
- **Given** the plan, **then** "Schedule and retention" shows "Every day at 03:00" and "Keeps 7 daily, 4 weekly and 6 monthly restore points" with a "Change" Button that opens `BackupSchedule`. The "Change" Button is hidden until phase 9 ships (D-036).
- **Given** a destination has not been reachable at the last run or the last health check (every 6 h), **then** its Badge is "Unreachable".

**Implementation notes**
- API: `backups.overview`, `backups.destinations.list`.
- Data: `backup_destinations` (`status`, `used_bytes`, `snapshot_count`), `backup_plan`.
- UI: List/ListRow, Badge, Button.

### US-BKP-03 · Review recent runs and run history
**Feature:** F-BKP-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** a history of backup runs with failures stand out, **so that** I notice patterns such as the NAS sleeping.

**Acceptance criteria**
- **Given** runs exist, **then** "Recent runs" lists the latest 5 runs, newest first, e.g. "Today, 03:00 · 11 apps · 1.2 GB changed · 6 min · Succeeded" and "24 Sep, 03:00 · NAS was not reachable · Failed · Details".
- **Given** a failed run, **then** its row shows the plain reason from the error catalogue and a "Details" Button opening `BackupRunDetail`. "Details" links and buttons (here, in the header and in failure notifications) are hidden until phase 8 ships (D-036).
- **Given** runs exist, **then** a BarChart above the list shows the last 30 runs, bar height = data changed, succeeded bars in chart-1 and failed runs drawn as a full-height marker in the critical colour with a "Failed" label in its tooltip.
- **Given** the chart, **then** it follows the chart rules (hidden data table with date, status, data changed; Left/Right steps through runs).
- **Given** a run is in progress, **then** it appears first as "Now · Backing up… 42%" with a Progress bar updated from `job.progress`.

**Implementation notes**
- API: `backups.listRuns` (cursor pagination, limit 30), `backups.overview`.
- Data: `backup_runs` (`status`, `bytes_added`, `started_at`, `finished_at`, `error`, `trigger`).
- UI: BarChart, List/ListRow, Badge, Progress.
- Edge cases: pre-update runs (`trigger: pre_update`) show "Before updating Immich" instead of the app count.

### US-BKP-04 · Back up now
**Feature:** F-BKP-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** to start a backup immediately, **so that** I have a fresh copy before I change something.

**Acceptance criteria**
- **Given** I press "Back up now", **then** a manual run starts for every destination, the button becomes "Backing up…" with progress and is disabled, and a Toast says "Backup started".
- **Given** a run is already running, **when** `backups.runNow` is called, **then** it returns the existing job id (no second run).
- **Given** a restore, system update, move-all-data or factory reset job is running, **then** "Back up now" is disabled with the tooltip "Wait for the current task to finish" and the API returns `JOB_EXCLUSIVE_RUNNING`.
- **Given** the run finishes, **then** the header, recent runs and chart update without a reload and a success or failure notification is created.
- The tray quick action "Back up now" calls the same service.

**Implementation notes**
- API: `backups.runNow` → `{ jobId }`, `jobs.get`, `events.stream` (`job.progress`, `backup.run`); tray `tray.quickAction(backupNow)`.
- Data: `jobs` (kind `backup`), `backup_runs` (`trigger: manual`).

### US-BKP-05 · Run a backup
**Feature:** F-BKP-02 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** each backup to copy app data consistently and safely, **so that** restores actually work.

**Acceptance criteria**
- **Given** the plan's schedule fires or a manual run starts, **then** for each destination in turn a `backup_runs` row is created with status `running`.
- **Given** the run starts, **then** for each included app with `backup.preHook`, the hook runs first (e.g. `pg_dumpall`); then, if "Pause apps briefly for a consistent copy" is on, services listed in `backup.pause` are paused; then `restic backup` runs over `app-data/<appId>` (minus manifest `backup.exclude`) and the included Home folders, tagged `app:<id>` and `run:<runId>`.
- **Given** any run, **then** it also backs up the system part (02 §2.9), tagged `system` and `run:<runId>`: an online copy of `hlabs.db` made with the SQLite backup API, `<dataDir>/apps/*` (compose files, `.env`, manifests) and the secrets bundle (TOTP secrets, app secrets, NAS and S3 credentials) encrypted with the destination's repo password. A run whose system part fails is marked `failed`.
- **Given** the copy finishes or fails, **then** paused apps are always resumed (even on error or daemon shutdown), and the log records "Resuming apps: …".
- **Given** the run succeeds, **then** status becomes `succeeded` with `bytes_added`, `files_changed`, duration, and destination `used_bytes`/`snapshot_count` are refreshed.
- **Given** the daemon crashes mid-run, **then** on restart the run is marked `failed` with "hlabs stopped during the backup", any paused apps are resumed and the restic lock is removed with `restic unlock`.
- **Given** the computer was asleep at the scheduled time, **then** the missed run starts within 5 minutes of wake (at most one catch-up run).

**Implementation notes**
- Architecture §2.9; manifest `backup` section (06-app-manifest).
- Data: `backup_plan.include_json` (default: all installed apps and all users' Home folders; newly installed apps are included automatically), `backup_runs`, `jobs`.
- Log: one line per step with `HH:MM:SS`, written to `log_path`; never log passwords, keys or env values.
- Edge cases: an app in `error` state is still backed up (its data folder), without pausing; an app removed since the plan was saved is skipped.

### US-BKP-06 · Apply retention after each run
**Feature:** F-BKP-02 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** old restore points pruned automatically, **so that** backups don't fill the destination.

**Acceptance criteria**
- **Given** a successful run, **then** `restic forget --prune` runs with the plan's retention (default `--keep-daily 7 --keep-weekly 4 --keep-monthly 6`).
- **Given** pruning fails, **then** the run stays `succeeded` but the destination Badge becomes "Needs attention" and the log includes the error.
- **Given** a failed run, **then** no forget/prune happens.
- **Given** pre-update snapshots, **then** they are subject to the same retention.

**Implementation notes**
- Data: `backup_plan.retention_json` (`{ daily, weekly, monthly }`).
- Edge cases: prune on a large S3 repo may take longer than the backup; it runs inside the same job and progress shows "Tidying up old restore points".

### US-BKP-07 · Handle failed runs
**Feature:** F-BKP-02 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** failures retried briefly and then reported clearly, **so that** a sleeping NAS doesn't silently break my backups.

**Acceptance criteria**
- **Given** a network operation inside a run fails (e.g. the destination can't be reached), **then** the daemon retries it twice, 5 s apart, then fails the run (e.g. `BACKUP_DEST_UNREACHABLE`, "NAS was not reachable") (D-046).
- **Given** a scheduled run fails, **then** it is retried once, 30 minutes later; if that retry also fails, the next attempt is the next scheduled run (D-046).
- **Given** a failure, **then** `backup_runs.status = failed`, `error` holds the hlabsCode, the log ends with "Backup stopped. Next attempt: <time>" (the 30-minute retry time, or the next scheduled time if the retry has already been used).
- **Given** a failure, **then** a notification (severity `warning`; `critical` after 3 consecutive failed runs, D-046) is created for all admins with the action "Details" opening `BackupRunDetail`.
- Mapped errors (add to `packages/api/src/errors.ts`): `BACKUP_DEST_UNREACHABLE`, `BACKUP_DEST_AUTH_FAILED`, `BACKUP_DEST_FULL`, `BACKUP_REPO_LOCKED`, `BACKUP_REPO_PASSWORD_WRONG`, `BACKUP_PREHOOK_FAILED`, `BACKUP_INTERRUPTED`.

**Implementation notes**
- API: `notifications.list`; `backup.run` event.
- Data: `backup_runs`, `notifications`.

### US-BKP-08 · Choose a destination type and fill in its details
**Feature:** F-BKP-03 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupAddDest`
**As** an admin, **I want** to add a place to store backups, **so that** my data survives a broken disk.

**Acceptance criteria**
- **Given** I press "+ Add a destination", **then** a Dialog "Add a backup destination" shows four options: "Cloud storage" (S3-compatible, e.g. Backblaze B2), "Network drive" (SMB or NFS share), "External drive" (USB or Thunderbolt), "Another hlabs" (Over Tailscale).
- **Given** "Cloud storage", **then** fields are "Endpoint", "Bucket", "Access key" and "Secret key" (masked); Endpoint must be an https URL.
- **Given** "Network drive", **then** I can pick an existing network storage location or enter a share address (`smb://host/share` or `host:/path` for NFS), username and password; **given** "External drive", **then** I pick from connected drives and a folder name (default "hlabs-backups").
- **Given** "Another hlabs", **then** I pick from hlabs machines found on my tailnet, or enter its tailnet name; the target must have the backup receiver app installed, otherwise I see "Install the Backup receiver app on that hlabs first."
- **Given** required fields are empty, **then** "Test connection" and "Add destination" are disabled; "Cancel" closes without saving.

**Implementation notes**
- API: `backups.destinations.add`, `storage.locations.list`, `network.status` (tailnet peers).
- Data: `backup_destinations` (`kind` `s3`\|`smb`\|`nfs`\|`local`\|`hlabs`; SFTP is supported by the API only, no UI in v1), secrets in keychain via `secret_ref`.
- UI: Dialog, Segmented or List for type, TextField, Button.

### US-BKP-09 · Test the connection and add the destination
**Feature:** F-BKP-03 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupAddDest`
**As** an admin, **I want** to check a destination works before saving it, **so that** the first backup doesn't fail.

**Acceptance criteria**
- **Given** I press "Test connection", **then** hlabs checks reachability, credentials and write access within 20 s and shows "Connected" or a mapped error inline (e.g. "Access key or secret key is wrong").
- **Given** I press "Add destination", **then** the test runs again if not passed, `restic init` creates the repository with the encryption password, the destination appears in the list and a Toast says "Destination added".
- **Given** the location already contains an hlabs restic repository, **then** the form switches to "Backups already exist here. Enter their encryption password to use them." and the password field becomes editable; a wrong password shows "That password doesn't open these backups".
- **Given** a destination is added, **then** its first backup runs at the next scheduled time and an `audit_log` entry `backup.destination.add` is written.

**Implementation notes**
- API: `backups.destinations.test`, `backups.destinations.add`.
- Data: `backup_destinations`, `audit_log`.
- Edge cases: adding the same location twice returns `BACKUP_DEST_DUPLICATE`; a destination on the storage root's own disk is refused with "Pick a different disk than the one hlabs stores data on".

### US-BKP-10 · See the encryption password once
**Feature:** F-BKP-03 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupAddDest`
**As** an admin, **I want** to see and save the backup encryption password, **so that** I can restore even if this computer is lost.

**Acceptance criteria**
- **Given** the Add dialog opens, **then** a random password (6 words from a diceware list, separated by hyphens) is generated and shown in the "Encryption password" field with a Copy button, and the warning "Save this password somewhere safe. Without it, these backups can't be restored, not even by the admin."
- **Given** I add the destination, **then** the password is stored in the OS keychain and never shown again in this dialog.
- **Given** I later choose Edit › "Show encryption password", **then** I must re-enter my admin password; the password is then shown and an `audit_log` entry `backup.password.export` is written.
- **Given** I cancel the dialog, **then** the generated password is discarded.

**Implementation notes**
- API: `backups.destinations.add` (password in input), `backups.exportRepoPassword` (requires admin password).
- Data: `backup_destinations.repo_password_ref`; security 07 §7.7.
- Edge cases: the password never appears in logs, API responses other than `exportRepoPassword`, or diagnostics.

### US-BKP-11 · Edit or remove a destination
**Feature:** F-BKP-03 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupsOverview`
**As** an admin, **I want** to update credentials or stop using a destination, **so that** backups keep working when things change.

**Acceptance criteria**
- **Given** I press "Edit", **then** I can rename the destination and update its credentials (not its type or location), and "Save" re-tests before saving.
- **Given** I choose "Remove destination", **then** a confirmation Dialog says "Stop backing up to NAS? Existing backups stay on the NAS and can be added again later." with "Remove"; nothing is deleted at the destination.
- **Given** a run to that destination is in progress, **then** Remove is disabled until it finishes.
- **Given** removal, **then** past `backup_runs` for it remain in history and an `audit_log` entry is written.

**Implementation notes**
- API: `backups.destinations.update`, `backups.destinations.remove`, `backups.exportRepoPassword`.
- UI: Dialog, TextField, Menu.

### US-BKP-12 · Choose how often backups run
**Feature:** F-BKP-04 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `BackupSchedule`
**As** an admin, **I want** to pick the backup frequency and start time, **so that** backups run when the computer is idle.

**Acceptance criteria**
- **Given** I press "Change", **then** a Dialog "Backup schedule" opens with "How often": "Every day" (Recommended), "Every 6 hours" (For busy apps), "Every week", and a "Start at" time field (default 03:00, 15-minute steps).
- **Given** "Every day" at 03:00, **then** the saved cron is `0 3 * * *`; "Every 6 hours" starting 03:00 saves `0 3-23/6 * * *` (03, 09, 15, 21); "Every week" saves Sunday at the start time (`0 3 * * 0`).
- **Given** I press "Save", **then** the plan updates, the overview summary reads e.g. "Every 6 hours from 03:00", the next-backup line updates and an `audit_log` entry is written; "Cancel" discards changes.

**Implementation notes**
- API: `backups.plan.get`, `backups.plan.update`.
- Data: `backup_plan.schedule_cron`.
- UI: Dialog, List with radio semantics, Badge for "Recommended", TextField (time).

### US-BKP-13 · Set how many restore points to keep
**Feature:** F-BKP-04 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `BackupSchedule`
**As** an admin, **I want** to set daily, weekly and monthly restore points and see the space it needs, **so that** I balance history against disk space.

**Acceptance criteria**
- **Given** the dialog, **then** "Restore points to keep" shows Daily (7), Weekly (4) and Monthly (6), each with "–" (Fewer) and "+" (More) buttons.
- Limits: Daily 1–30, Weekly 0–12, Monthly 0–24; at a limit the matching button is disabled.
- **Given** any change, **then** "Estimated space on NAS: about 45 GB" updates within 1 s (debounced 300 ms); with several destinations one line per destination is shown.
- **Given** no backup has run yet, **then** the estimate line reads "Estimate available after the first backup".
- **Given** I save, **then** new retention applies at the next run's prune.

**Implementation notes**
- API: `backups.plan.estimate` (new, see API additions), `backups.plan.update`.
- Data: `backup_plan.retention_json`.
- UI: Stepper for each count with `aria-label` "Daily restore points" etc.
- Estimate: current repo size × (new total points ÷ current snapshot count), rounded to the nearest 5 GB; documented as an estimate.

### US-BKP-14 · Pause apps briefly for a consistent copy
**Feature:** F-BKP-04 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `BackupSchedule`
**As** an admin, **I want** to choose whether apps pause during backup, **so that** I can trade a few seconds of downtime for consistent data.

**Acceptance criteria**
- **Given** the dialog, **then** a Switch "Pause apps briefly for a consistent copy" (on by default) shows beneath it the names of apps that would pause, e.g. "Vaultwarden and Paperless pause for a few seconds".
- **Given** no installed app declares `backup.pause`, **then** the Switch is hidden.
- **Given** the Switch is off, **then** runs skip pausing but still run `backup.preHook`s.

**Implementation notes**
- API: `backups.plan.update` (`pauseApps: boolean`).
- Data: new column `backup_plan.pause_apps` (bool, default true) — see Open questions.
- UI: Switch.

### US-BKP-15 · Understand why a backup failed
**Feature:** F-BKP-05 · **Priority:** P3 · **Phase:** 8 · **Screens:** `BackupRunDetail`
**As** an admin, **I want** a plain explanation and the full log of a failed run, **so that** I can fix the cause.

**Acceptance criteria**
- **Given** I press "Details" on a failed run, **then** a Dialog shows "Backup failed · 24 Sep, 03:00" and "NAS · nas.local/Backups · stopped after 12 seconds".
- **Given** the error code, **then** "What happened:" shows the catalogue text, e.g. "hlabs couldn't reach your NAS. It may have been asleep or off. Nothing was lost; the next backup includes everything since the last successful one."
- **Given** the run's log, **then** "Log" lists each line with its time in a monospace, scrollable, selectable block (e.g. "03:00:07 Retrying (1/2): host did not respond").
- **Given** the log is longer than 500 lines, **then** the last 500 are shown with "Showing the last 500 lines".
- **Given** the Dialog, **then** Escape and "Close" close it and focus returns to the "Details" button.

**Implementation notes**
- API: `backups.getRun` (run + log text).
- Data: `backup_runs.error`, `backup_runs.log_path`.
- UI: Dialog, List.

### US-BKP-16 · Download the log or try again
**Feature:** F-BKP-05 · **Priority:** P3 · **Phase:** 8 · **Screens:** `BackupRunDetail`
**As** an admin, **I want** to retry right away or keep the log, **so that** I can confirm the fix or ask for help.

**Acceptance criteria**
- **Given** I press "Try again now", **then** `backups.runNow` starts a manual run to that destination, the Dialog closes and the new run appears at the top of "Recent runs".
- **Given** another backup or an exclusive job is running, **then** "Try again now" is disabled with "A backup is already running" or "Wait for the current task to finish".
- **Given** I press "Download log", **then** a text file named `hlabs-backup-2026-09-24-0300.log` downloads with the full log.

**Implementation notes**
- API: `backups.runNow` (optional `destinationId`), `backups.getRun`.
- Edge cases: runs whose log file was cleaned up show "The log for this run is no longer available" and hide "Download log".

### US-BKP-17 · Start a restore and pick a restore point
**Feature:** F-BKP-06 · **Priority:** P2 · **Phase:** 5 · **Screens:** `RestoreFlow`, `RestoreChooseDest`
**As** an admin, **I want** to choose which restore point to go back to, **so that** I get the data from before something went wrong.

**Acceptance criteria**
- **Given** I press "Restore…", **then** step 1 "Choose a destination" lists healthy destinations; with exactly one it is selected automatically and I land on step 2 ("Step 2 of 3").
- **Given** step 2 "Choose what to restore", **then** "Restore point · from NAS" lists snapshots newest first with labels such as "Today, 03:00 · 1.2 GB changed", "Weekly · 20 Sep", "Monthly · 1 Sep"; the newest is selected.
- **Given** the destination is unreachable, **then** the list shows "Can't reach NAS right now" with "Try again".
- **Given** I press "Back", **then** I return to step 1 (or close the flow if step 1 was skipped).

**Implementation notes**
- API: `backups.listSnapshots` (destinationId), `backups.destinations.list`.
- UI: Dialog with step indicator, List with radio semantics.

### US-BKP-18 · Choose apps or folders and how to restore
**Feature:** F-BKP-06 · **Priority:** P2 · **Phase:** 5 · **Screens:** `RestoreFlow`
**As** an admin, **I want** to restore one app, some folders or everything, either in place or as a copy, **so that** I only undo what I need.

**Acceptance criteria**
- **Given** a restore point is selected, **then** "Apps and folders" lists each app and Home folder in that snapshot with its size ("Vaultwarden · 210 MB", "Home › Documents · 5.1 GB"), each with a checkbox; none are selected at first.
- **Given** I select every item, **then** the scope is whole system and the button reads "Restore everything"; a whole-system restore with "Replace current data" also restores the system part (02 §2.9: database, app config folders and secrets bundle) and then restarts the daemon, and the confirmation says "hlabs restarts when the restore finishes."
- **Given** "How to restore", **then** I choose "Replace current data" ("The app restarts with yesterday's data", wording follows the chosen point) or "Restore as a copy" ("Puts files in Home › Restored").
- **Given** "Restore as a copy", **then** items are restored to my Home › Restored › `<date time>` › `<item>`, no app is stopped and nothing is replaced.
- **Given** an app in the snapshot is no longer installed, **then** with "Replace current data" it is disabled with "Install Immich first to restore it in place"; "Restore as a copy" still works.
- **Given** nothing is selected, **then** "Restore" is disabled.

**Implementation notes**
- API: `backups.getSnapshot` (new, items with sizes), `backups.restore`.
- Data: `restores.scope_json` (`{ mode: 'replace'|'copy', apps: [], folders: [] }`).
- UI: List/ListRow with checkbox, List with radio semantics.

### US-BKP-19 · Confirm a restore with my password
**Feature:** F-BKP-06 · **Priority:** P2 · **Phase:** 5 · **Screens:** `RestoreFlow`
**As** an admin, **I want** to confirm a restore deliberately, **so that** I can't replace data by accident.

**Acceptance criteria**
- **Given** I press "Restore" with "Replace current data", **then** a confirmation Dialog names what happens: "Replace Vaultwarden with its data from yesterday, 03:00? Vaultwarden stops until the restore finishes." and asks for my password.
- **Given** a wrong password, **then** the Dialog shows "That password isn't right" and nothing starts.
- **Given** "Restore as a copy", **then** the password is still required but the text reads "Copy Vaultwarden's data from yesterday, 03:00 to Home › Restored?".
- **Given** a backup, update, move or other exclusive job is running, **then** "Restore" is disabled with "Wait for the current task to finish".
- **Given** confirmation, **then** `backups.restore` returns a job id, an `audit_log` entry `backup.restore` is written and step 3 opens.

**Implementation notes**
- API: `backups.restore` (snapshotId, destinationId, scope, password) → `{ jobId }`.
- Data: `restores`, `jobs` (kind `restore`, exclusive per invariant 5), `audit_log`. Security 07 §7.8.

### US-BKP-20 · Watch a restore in progress
**Feature:** F-BKP-06 · **Priority:** P1 · **Phase:** 5 · **Screens:** `RestoreProgress`
**As** an admin, **I want** to see each step of the restore, **so that** I know how long my app will be down.

**Acceptance criteria**
- **Given** a replace restore of one app, **then** "Step 3 of 3" shows "Restoring Vaultwarden" and "From yesterday, 03:00 · replacing current data", with steps: "Stopped Vaultwarden", "Saved a safety copy of current data", "Copying data from NAS", "Starting Vaultwarden" (several apps: "Restoring 3 apps", one stop/start step each).
- **Given** a step completes, **then** it shows a check and its duration ("12 s"); the running step shows a Progress bar and bytes ("134 of 210 MB").
- **Given** the job runs, **then** it follows the order Stop → Safety copy → Restore → Start (D-024): it stops affected apps, moves current data aside as the safety copy, runs `restic restore` into a staging dir, swaps staging in and starts the apps, waiting for their health checks (120 s).
- **Given** the restore has not reached swap-in, **then** a "Cancel restore" Button is shown next to "Hide"; from swap-in on it is hidden (US-BKP-22).
- **Given** I press "Hide", **then** the Dialog closes, the restore continues, and a notification "Vaultwarden restored" (or failure) arrives when done; reopening Backups shows the progress again.
- **Given** the page is reloaded mid-restore, **then** progress is restored from `jobs.get`.
- The note "If anything goes wrong, hlabs puts the safety copy back automatically." is shown throughout.

**Implementation notes**
- API: `jobs.get`, `events.stream` (`job.progress` with step id and bytes), `backups.restore`.
- Data: `restores`, `jobs`; staging and safety copies sit beside the target on the same filesystem so the swap is a rename: `<appDataDir>/.restore/<restoreId>/` for app data, `<storageRoot>/.restore/<restoreId>/` for Home folders and `<dataDir>/.restore/<restoreId>/` for the system part (02 §2.9).
- UI: Stepper, Progress, Button.

### US-BKP-21 · Roll back automatically if a restore fails
**Feature:** F-BKP-06 · **Priority:** P1 · **Phase:** 5 · **Screens:** `RestoreProgress`
**As** an admin, **I want** hlabs to put my data back if the restore goes wrong, **so that** a failed restore never leaves me worse off.

**Acceptance criteria**
- **Given** copying fails (destination unreachable, wrong password, disk full), **then** staging is discarded, current data is moved back, apps start, the restore is marked `failed` and the screen says "Restore didn't finish. Vaultwarden is back to how it was." with the reason.
- **Given** an app fails its health check after swap-in, **then** the safety copy is moved back, the app is started again and the same message is shown.
- **Given** the daemon crashes during the restore, **then** on restart it detects the unfinished restore and rolls back (before swap-in) or completes the start step (after swap-in), and marks the restore accordingly.
- **Given** success, **then** the safety copy and staging are deleted, the restore is `succeeded` and the screen shows "Vaultwarden restored" with "Done".
- **Given** there isn't enough free space for staging plus the safety copy, **then** the restore refuses to start with "Not enough free space to restore safely. Free up 1.2 GB and try again." before stopping any app.

**Implementation notes**
- Data: `restores.status`, `restores.error`, `notifications`.
- Edge cases: test each failure point (before stop, during copy, after swap, during start) in integration tests with a fake restic.

### US-BKP-22 · Cancel a restore only before swap-in
**Feature:** F-BKP-06 · **Priority:** P1 · **Phase:** 5 · **Screens:** `RestoreProgress`
**As** an admin, **I want** to stop a restore I started by mistake while that is still safe, **so that** my current data is untouched.

**Acceptance criteria**
- **Given** the restore is stopping apps, saving the safety copy or copying from the destination, **then** the progress screen shows a "Cancel restore" Button; when swap-in starts the button is hidden (D-024).
- **Given** the restore is stopping apps, saving the safety copy or copying from the destination, **when** I press "Cancel restore" (which calls `jobs.cancel`), **then** staging is discarded, current data is moved back, apps start again and the restore is `cancelled`.
- **Given** swap-in has started, **then** `jobs.cancel` returns `RESTORE_NOT_CANCELLABLE` and the restore continues to the end (with automatic rollback on failure).
- **Given** a restore is running, **then** no backup, app install, update or uninstall can start (exclusive job) and those actions show "Wait for the current task to finish".

**Implementation notes**
- API: `jobs.cancel` (supported for kind `restore` until the swap step), new error `RESTORE_NOT_CANCELLABLE`.
- Data: `jobs`, invariant 5 in 04-data-model.

### US-BKP-23 · Choose what's included in backups
**Feature:** F-BKP-02 · **Priority:** P2 · **Phase:** 5 · **Screens:** `BackupIncluded`, `BackupsOverview`
**As** an admin, **I want** to choose which apps and folders every backup copies, **so that** I don't spend space on things I can reinstall.

**Acceptance criteria**
- **Given** Backups, **when** I select the "11 apps and 3 Home folders" link under the last-backup card, **then** the "What's included" Dialog opens with two columns: "Apps" (one checkbox per installed app with its size) and "Files" (one checkbox per Home folder plus "Shared", with sizes).
- **Given** a new installation, **then** every app and every Home folder is ticked and "Include new apps automatically" is on (the default in `backup_plan.include_json`).
- **Given** an app whose manifest has `backup.exclude`, **then** its row shows what's left out (for example "480 MB · library excluded").
- **Given** the Dialog, **then** a card reads "Always included · hlabs settings, users and app setup · Needed to restore the whole system on a new computer" and it can't be turned off (the system part, 02 §2.9).
- **Given** I change a tick, **then** the estimate "About N GB per full copy" updates from `backups.plan.estimate`, with "Later backups only copy what changed".
- **Given** "Save", **then** `backups.plan.update` stores the choice and the overview line changes (e.g. "10 apps and 3 Home folders"); "Cancel" discards it.
- **Given** "Include new apps automatically" is off, **when** an app is installed later, **then** it is not ticked and the overview shows "1 app not backed up" until I include it.

**Implementation notes**
- API: `backups.plan.get`, `backups.plan.update` (`include` + `includeNewApps`), `backups.plan.estimate`.
- Data: `backup_plan.include_json` (`{ apps: string[], folders: string[], includeNewApps: boolean }`).
- UI: Dialog, List of checkbox rows with AppIcon tiles, Switch, GlassCard for the notes.
- Edge: unticking every app and folder still backs up the system part; the Save button stays enabled.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
