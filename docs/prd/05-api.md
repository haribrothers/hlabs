# 05 · API

One tRPC v11 router tree in `packages/api`, implemented in `apps/daemon`. Every input and output has a Zod schema in `packages/api/src/schemas/`. The web app and the tray import the router **type** only.

## Conventions
- **Procedures:** `publicProcedure` (only: `system.health`, `onboarding.status`, `auth.listLoginUsers`, `auth.login`, `auth.verifyTotp`, `auth.useRecoveryCode`, `auth.resetPassword`, `invites.inspect`, `invites.accept`), `setupProcedure` (every other `onboarding.*` procedure, including `checkSystem`; requires the setup token header `x-hlabs-setup` while onboarding is incomplete, D-013), `authedProcedure` (any signed-in user), `adminProcedure` (role admin), `trayProcedure` (tray token from loopback).
- **Errors:** throw `TRPCError` with a code **and** an `hlabsCode` in `cause` from the catalogue in `packages/api/src/errors.ts` (e.g. `APP_PORT_IN_USE`, `ENGINE_UNAVAILABLE`, `AUTH_LOCKED`). The UI maps `hlabsCode` to user-facing copy; never show raw error messages.
- **Long work** returns `{ jobId }` immediately; progress arrives via `events.stream` (`job.progress`) and `jobs.get`.
- **Pagination:** cursor-based (`{ cursor?: string, limit: 1..200 }` → `{ items, nextCursor }`).
- **Naming:** `domain.verbNoun` (e.g. `apps.install`, `backups.listRuns`).

## Routers

| Router | Procedures (type) | Notes |
| --- | --- | --- |
| `system` | `health` (public query), `info` (authed query: version, hostname, OS, CPU, memory, uptime, engine), `restartDaemon` (admin mutation), `factoryReset` (admin mutation, requires password + typed confirmation) | |
| `onboarding` | `status` (public), `checkSystem` (setupProcedure, needs `x-hlabs-setup`), `createAdmin`, `setupTotp` / `confirmTotp`, `setStorage`, `connectRemote`, `installStarterApps`, `restoreFromBackup` (P3), `complete` | Only callable while onboarding is incomplete; `createAdmin` only if no users exist. |
| `auth` | `listLoginUsers` (public; empty when the user list is hidden), `login`, `verifyTotp`, `useRecoveryCode`, `logout`, `me`, `listSessions`, `revokeSession`, `resetPassword` (admin reset-link token only) | `/auth/verify` is plain HTTP, not tRPC. |
| `account` | `update` (display name, avatar color, locale), `changePassword`, `totp.begin` / `totp.confirm` / `totp.disable`, `recoveryCodes.regenerate` | Self-service for any user. |
| `users` | `list`, `get`, `updateRole`, `disable`, `enable`, `resetPasswordLink`, `delete`, `setAppAccess` (admin) | |
| `invites` | `create`, `list`, `revoke` (admin), `inspect` (public, by token), `accept` (public: username + password) | |
| `store` | `listApps` (filters: category, query, source), `getApp`, `listCategories`, `listUpdates`, `sources.list` / `add` / `remove` / `sync` | |
| `apps` | `list`, `get`, `install` (appId, env, mounts, hostname) → job, `start`, `stop`, `restart`, `update` → job, `uninstall` (keepData) → job, `setConfig` (env), `setMounts`, `setAutostart`, `setAutoUpdate`, `setAuthMode`, `logs` (tail + since), `moveData` → job (P3), `deployCustom` (compose YAML + meta) → job (P3) | `list` and `get` return each app's `urls { lan, tailnet? }` and are available to any signed-in user for the apps they can open. Members may only `list`/`get` their apps, plus `install` (built-in source, apps without risky permissions) when `people.membersCanInstall` is on. |
| `home` | `getLayout` (returns `{ items, dock }`), `saveLayout`, `saveDock`, `listWidgets`, `searchEverything` (apps, files, settings, actions for ⌘K) | |
| `files` | `list` (path, sort), `stat`, `mkdir`, `rename`, `move` → job when large, `copy`, `trash`, `restoreFromTrash`, `emptyTrash`, `preview` (returns a signed URL), `search` | Upload/download via `/api/files`. Paths are virtual (`/home`, `/shared`, `/drives/<id>`), resolved and jailed server-side. |
| `storage` | `summary` (used by apps, files, system, free), `locations.list` / `addNetwork` / `testNetwork` / `remove` / `eject`, `moveAll` → job | |
| `usage` | `current`, `history` (scope host or appId, range 1h/24h/7d/30d), `topApps` | Plus `usage.sample` events. |
| `backups` | `overview`, `destinations.list` / `add` / `test` / `update` / `remove`, `plan.get` / `plan.update`, `runNow` → job, `listRuns`, `getRun` (with log), `listSnapshots`, `restore` → job, `exportRepoPassword` | |
| `network` | `status` (LAN addresses, hostname, Tailscale state, tailnet URL), `setHostname` → job, `remote.connect` (returns login URL) / `remote.disconnect`, `caCertificate` (download), `ports` | |
| `settings` | `get`, `appearance.update`, `notifications.update`, `engine.get` / `engine.setResources` / `engine.switch` → job, `startup.update`, `updates.get` / `updates.check` / `updates.setChannel` / `updates.setAuto` | |
| `notifications` | `list`, `markRead`, `markAllRead`, `dismiss` | |
| `jobs` | `get`, `list` (active), `cancel` (where supported) | |
| `ai` (P3) | `get`, `setEnabled`, `tokens.create` / `list` / `revoke` | |
| `tray` | `status` (state, CPU, memory, free space, app count, last backup), `quickAction` (openDashboard, copyAddress, backupNow, pauseAll, resumeAll), `resetPassword` (username) | trayProcedure only. |
| `events` | `stream` (subscription, SSE) | Filtered per user. |

## Non-tRPC HTTP
| Route | Purpose |
| --- | --- |
| `GET /healthz` | 200 when ready; 503 with `{ reason }` otherwise. |
| `GET /auth/verify` | Caddy forward_auth. Reads session cookie + `X-Forwarded-Host`; 200 with `X-Hlabs-User`, `X-Hlabs-Role` or 302 to login / 403 "no access" page. |
| `POST /api/files/upload` (tus-style chunks) | Resumable uploads, 8 MB chunks. |
| `GET /api/files/download?path=` | Range support, zip for folders (streamed). |
| `GET /api/files/preview/:token` | Short-lived signed preview URLs (images, video, PDF, text). |
| `POST /mcp` | MCP streamable HTTP (P3, token auth, off by default). |

## Canonical names (use exactly these)
- Error when an exclusive job blocks another: `JOB_EXCLUSIVE_RUNNING` (not `JOB_CONFLICT` or `SYSTEM_BUSY`). Common password: `PASSWORD_TOO_COMMON`. Username taken: `USERNAME_TAKEN`.
- `/healthz` 503 reasons: `starting`, `updating`, `migration_failed`, `storage_unavailable`; `daemon_unreachable` is produced by Caddy's error page, and `update_stuck` is a **client-side** state (updating for more than 10 minutes), not a server reason. Engine problems never fail `/healthz`; they surface as `engine.status` events and `SysEngineStopped`.
- Notification `action_json`: `{ kind: 'navigate', to: string, params?: object } | { kind: 'mutation', procedure: string, input: object, label: string }`.
- Backup errors: `BACKUP_REPO_PASSWORD_WRONG` (wrong repository password) and `BACKUP_DEST_UNREACHABLE` (destination can't be reached), everywhere including onboarding restore.
- Access-denied behaviour: a signed-in user who opens a page or app they can't use gets the "You don't have access to this" page (US-STATE-20), never a redirect or a 404. Unknown URLs get the 404 page.

## Contract additions from the feature files
These were added while writing user stories and are **part of the API contract** (same weight as the tables above). When implementing a router, read this section too. Where an addition changes an input or output above, the addition wins.

### From [01 · Install & menu-bar app](../features/01-install-tray.md)

- `tray.status` output extended: `appsRunning`, `appsExpected`, `paused`, `engine { name, running, managedByHlabs }`, `dashboardUrl`, `backup { configured, lastSucceededAt, running, progress, lastFailed }`, `updateChannel`, `autoUpdate`, `exclusiveJobRunning`, `onboardingComplete`, `reduceTransparency`.
- `tray.listUsers` (trayProcedure query): enabled users with `id`, `username`, `displayName`, `role`, `totpEnabled`.
- `tray.resetPassword` input changed to `{ username, newPassword, disableTotp }` (applies directly; writes `password_resets` with `created_via = tray`).
- `tray.setStartAtLogin` (trayProcedure mutation): `{ enabled }`, confirms the tray applied a start-at-login change (D-042).
- `tray.appLogs` (trayProcedure query): `{ appId, tail?, since?, follow? }` → log lines, for `hlabs logs --app` (D-035).
- `settings.startup.update` emits `startup.changeRequested` (tray-scoped event) instead of changing login items itself (D-042).
- `settings.notifications.update` for members accepts only their own `notifications:<userId>` switches (D-043).
- `tray.startEngine` (trayProcedure mutation): starts the detected engine.
- `tray.diagnostics` (trayProcedure query): redacted plain-text diagnostics report.
- `tray.uninstallInfo` (trayProcedure query): `appCount`, `dataBytes`, `storageRoot`, `colimaManaged`.
- `tray.uninstall` (trayProcedure mutation): `{ keepData, removeColima }` → `{ jobId }`.
- `events.stream` accepts the tray token (tray-scoped events only).
- Data: new `settings` key `paused` (`{ at, appIds }`).

### From [02 · Onboarding](../features/02-onboarding.md)

- `tray.setupUrl` (trayProcedure query): returns the onboarding URL including the one-time setup token; null when onboarding is complete.
- `onboarding.confirmSystem({ startAtLogin })`: saves the start-at-login choice and advances the step to `account` once blocking checks pass.
- `onboarding.installEngine` → `{ jobId }`: installs and starts hlabs-managed Colima (macOS only); progress is exposed through `onboarding.checkSystem`.
- `onboarding.checkSystem` input `{ includeLog?: boolean }` and output `engine.install { state, progress, lastLogLine, log? }` (shape addition to an existing procedure).
- `onboarding.setStep({ step })`: advances past an optional step without action (skip two-factor, skip remote access); only the next step is accepted.
- `storage.listDrives` (admin query): connected external volumes with path, name, free space, file system and writability.
- `onboarding.findBackups` (query): discovered restic repositories on the LAN and connected drives (P3).
- `onboarding.listRestorePoints({ destination, password })`: opens a repository and returns its snapshots (P3).
- Error codes: `ONBOARDING_SETUP_TOKEN_REQUIRED`, `ONBOARDING_COMPLETE`, `ONBOARDING_USERS_EXIST`, `ONBOARDING_INCOMPLETE`, `ENGINE_INSTALL_UNSUPPORTED`, `ENGINE_DOWNLOAD_TIMEOUT`, `STORAGE_NOT_WRITABLE`, `NAS_UNREACHABLE`, `NAS_AUTH_FAILED`, `NAS_READ_ONLY`, `TAILSCALE_HTTPS_DISABLED`, `USERNAME_INVALID`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_COMMON`.

### From [03 · Sign in](../features/03-sign-in.md)

- `auth.login` returns `{ status: 'ok', redirectTo }` or `{ status: 'totp_required', challengeId }`; `auth.verifyTotp` and `auth.useRecoveryCode` take `{ challengeId, code }` and return `{ redirectTo }` (shape detail, not new procedures).
- `auth.me` adds `mustSetupTotp: boolean` (shape detail).
- `auth.resetPassword` input is `{ token, newPassword }` only (recovery codes never reset a password, D-009).
- No new procedures.

### From [04 · Home](../features/04-home.md)
- `home.saveDock` (authed mutation): input `{ appIds: string[] }` (max 8, ordered) → `{ dock: string[] }`; ids that aren't installed apps the caller can open are dropped. Stored in `home_layout.dock_json` (D-054, US-HOME-22).

- `home.getWidgetData` (authed query): input `{ widgetIds: string[] }` → `{ [widgetId]: { status: "ok" | "app_not_running" | "error", data?, updatedAt } }`. Covers system widgets not served by an existing query (`myFiles`, `sharedApps`, `appStatus`) and manifest app widgets (proxied by the daemon, 5 s timeout, results filtered by the caller's app access).
- `notifications.unreadCount` (authed query): `{ count: number }` for the bell badge without paging the list.

### From [05 · App Store & installing](../features/05-app-store.md)

- `store.getHome` (authed query): `{ featured, collections, totalApps }` from enabled sources' indexes.
- `store.sources.inspect` (admin query): url → `{ kind, format, name, appCount, signed, keyFingerprint }` before adding.
- `apps.retryInstall` (admin mutation): `{ appId, portOverrides? }` → `{ jobId }`; only from `install_failed`.
- `apps.updateAll` (admin mutation): queues updates for all pending apps → `{ jobIds }`.
- `store.listApps` gains `sort`, `installedOnly`, `arm64Only`; `store.listUpdates` returns pending, recent (14 days), `rolledBack` and last check time.

### From [06 · Using & managing apps](../features/06-apps.md)

- `apps.getConfig` (admin query): env entries with secrets masked, manifest prompts, hostname, host port, mounts, network access.
- `apps.revealSecret` (admin mutation): returns one secret value; audit-logged.
- `apps.setConfig` input extended with `hostname?` and `hostPort?`; applies and restarts, rolling back on unhealthy.
- `apps.setPermissions` (admin mutation): mounts plus `{ internet, apps }` network access, one restart, rollback on unhealthy.
- `apps.watchLogs` (admin subscription, `appId`, `service?`): streams `app.log` lines while subscribed.
- `GET /api/apps/:appId/logs/download?service=` (admin, non-tRPC streaming).
- `usage.appDetail` (admin query): current, today's average CPU, 24 h peak memory, disk, per-container stats.
- Data model: `apps.net_internet`, `apps.net_apps`, `apps.data_location_id`. Manifest: `web.embed` (boolean, **default false** = open in a new tab; see 06).

### From [07 · Files](../features/07-files.md)

- `files.recent` (authed query): the 50 most recently modified files across the caller's Home and, if allowed, Shared.
- `files.listTrash` (authed query, paginated): the caller's `trash_items`.
- `files.openWith` (authed query, path): running apps the caller can open whose `app_mounts` contain the path, with their URLs.
- `files.shares.get` / `files.shares.set` / `files.shares.remove` (authed; members only for folders in their Home): SMB network shares (P3).
- `storage.locations.discover` (admin query): SMB/NFS servers found by mDNS with share counts.
- Event `storage.locationChanged` on the event bus: drive added, removed, mounted or offline.
- `/api/files/upload/:id` with `HEAD` (offset), `PATCH` (8 MB chunk) and `DELETE` (cancel); `POST /api/files/upload` takes `onConflict`.
- `GET /api/files/download` accepts repeated `path` parameters (zip); `GET /api/files/preview/:token` accepts `w` for thumbnails.
- Virtual path roots `/users/<username>` (admin, all Home folders) and `/appdata/<appId>` (admin, read only), in addition to `/home`, `/shared`, `/drives/<id>`.

### From [08 · Live usage & backups](../features/08-usage-backups.md)

- `backups.plan.estimate` (admin query): input `{ retention: { daily, weekly, monthly } }` → `{ items: [{ destinationId, name, estimatedBytes | null }] }`.
- `backups.getSnapshot` (admin query): input `{ destinationId, snapshotId }` → `{ snapshot, items: [{ kind: 'app'|'folder', id, label, sizeBytes, installed }] }`.
- `backups.plan.update` gains `pauseApps: boolean`; `backups.runNow` gains optional `destinationId`; `usage.history` output gains `peak { ts, value }` (input/output changes, no new procedures).
- Error codes added to `packages/api/src/errors.ts`: `BACKUP_DEST_UNREACHABLE`, `BACKUP_DEST_AUTH_FAILED`, `BACKUP_DEST_FULL`, `BACKUP_DEST_DUPLICATE`, `BACKUP_REPO_LOCKED`, `BACKUP_REPO_PASSWORD_WRONG`, `BACKUP_PREHOOK_FAILED`, `BACKUP_INTERRUPTED`, `RESTORE_NOT_CANCELLABLE`, `JOB_EXCLUSIVE_RUNNING`.

### From [09 · Settings · account & people](../features/09-account-people.md)

- `account.get` (authed query): profile, `passwordChangedAt`, `totpEnabledAt`, `recoveryCodesUnused`, `homeFolderBytes`, `adminName`.
- `users.getPolicy` / `users.updatePolicy` (admin): `showUserList`, `requireTotp`, `membersCanInstall`, `membersCanSeeUsage`, stored in `settings` key `people`.
- `users.setAppAccess` input extended with `canSeeShared` and `canSeeUsage`.
- `invites.update` (admin): change `displayName`, `role`, `appIds` of a pending invite.
- `invites.list` output includes `url` for pending invites (admin only).
- `settings.notifications.test` (admin): send a test notification to the in-app list, the tray (OS notification) and, if configured, the ntfy topic (D-033). No email.
- `POST /api/appearance/wallpaper` (non-tRPC, authed): upload a custom wallpaper image.
- `auth.me` output includes the caller's appearance; `settings.appearance.update` becomes per user (any signed-in user).
- Event `access.changed` on `events.stream`, sent to the affected user.
- Data: `users.password_changed_at`, `users.can_see_shared`, `users.can_see_usage`; `invites.token_ref`; `settings` keys `people` and `appearance:<userId>`; appearance gains `reduceMotion`, `showWidgets`, `showGreeting`.

### From [10 · Settings · system](../features/10-system-settings.md)

- `network.setPorts` (admin mutation): `{ http: number, https: number }`.
- `network.setPiholeDns` (admin mutation): `{ enabled: boolean }`.
- `GET /ca.crt` (non-tRPC, unauthenticated, port 80 only): Caddy internal CA root certificate.
- `storage.summary` output adds `backupCacheBytes`, `hlabsBytes`, `reclaimableImageBytes`.
- `storage.pruneImages` (admin mutation → job).
- `storage.moveAllPlan` (admin query): destination → sizes, free space, estimate, blockers.
- `files.emptyTrash` input adds `allUsers?: boolean` (admin only).
- `settings.engine.restart` (admin mutation → job).
- `settings.engine.planSwitch` (admin query): target → version, sizes, estimates, removable size.
- `settings.updates.install` (admin mutation → job `system_update`). Named `install`, not `apply`, because tRPC reserves `apply`, `call` and `then` as procedure names.
- `settings.updates.setAuto` input: `{ hlabs, apps, backupBeforeUpdate }`.
- `system.logs` (admin query): `{ source: 'daemon' | 'proxy' | 'installs', since?, limit }`.
- `system.diagnostics` (admin mutation → job) and `GET /api/diagnostics/:jobId` (admin session, 15-minute expiry).
- `system.connections` (admin query): outbound services with purpose, state and last contact.
- `ai.setPermissions` (admin mutation), `ai.activity` (admin query, paginated). (No `ai.confirmRequest`: assistants can't install or update apps, D-037.)

### From [11 · System states](../features/11-system-states.md)

- `settings.engine.start` — admin mutation, no input, returns `{ jobId }` (job kind `engine_start`); returns the existing job id if one is already running; errors `ENGINE_START_FAILED`, `JOB_EXCLUSIVE_RUNNING`.
- `GET /healthz` 503 body schema: `{ reason: "starting" | "updating" | "migration_failed" | "storage_unavailable" | "daemon_unreachable", step?: number, steps?: number, stepLabel?: string }`; `daemon_unreachable` is produced by Caddy's error handler, not the daemon. Schema lives in `packages/api/src/health.ts`.
- `system.health` (public) response includes `version`.
- `system.status` event payload gains `state: "ready" | "updating"`.
- `events.stream` uses tracked event ids and accepts `lastEventId` for resume (last 500 events buffered).
- Error codes added to the catalogue: `ENGINE_START_FAILED`, `AUTH_INVALID_PASSWORD`, `DISK_FULL` (an exclusive-job clash is always `JOB_EXCLUSIVE_RUNNING`).

### From phase 0 · Foundations

- The router tree, schemas and access levels live in `packages/api/src/router.ts`; the daemon implements procedures as handlers keyed by path (`AppHandlers` in `packages/api/src/handlers.ts`). A procedure without a handler throws `NOT_IMPLEMENTED`.
- `events.stream` accepts a session or the tray token (tray-scoped events only reach the tray).
- General error codes in the catalogue: `NOT_IMPLEMENTED`, `VALIDATION_FAILED` (bad input), `NOT_FOUND`, `AUTH_REQUIRED` (signed out), `ACCESS_DENIED` (signed in but not allowed), `INTERNAL`, `DAEMON_STARTING` (API called before `/healthz` is ready), `JOB_NOT_CANCELLABLE` (`jobs.cancel` on a job kind that can't be cancelled). The tRPC error shape carries `data.hlabsCode` and optional `data.detail`.
- Event `system.test` (`{ message }`), emitted only in development by `POST /dev/emit-test-event`, to prove the event stream reaches the browser.
- Placeholder output schemas (`pending`) are replaced by the story that implements each procedure.
- Until sign-in ships (phase 1), `pnpm dev` sets `HLABS_DEV_ANONYMOUS_ADMIN=1` so the dashboard can call signed-in procedures such as `events.stream`. The daemon refuses to start with it when `NODE_ENV=production`; phase 1 removes it.

### From phase 1 · Core, first run and sign in

- `onboarding.status` (public) returns `{ completed, step, hasUsers }` and nothing else; `step` is one of `welcome | system | account | twoFactor | storage | remote | apps | done` (04 `settings.onboarding.step`). The enabled steps and "Step N of M" come from the step registry (D-041), not from this procedure.
- Setup-token check (D-013): every `setupProcedure` first fails with `ONBOARDING_COMPLETE` once onboarding is done, then requires `x-hlabs-setup` to match the setup token (compared by SHA-256 hash in constant time) or fails with `ONBOARDING_SETUP_TOKEN_REQUIRED`. This check comes before any session check.
- The daemon's dashboard base URL for the printed setup URL is `HLABS_DASHBOARD_URL` (default `http://127.0.0.1:<port>`; `pnpm dev` points it at Vite, `http://127.0.0.1:5173`). The setup URL is `<dashboard>/setup?token=<token>`.
- Development only (never registered in production): `GET /dev/setup-url` → `{ url }` (null once onboarding is complete) , `POST /dev/complete-onboarding` and `POST /dev/reset-onboarding` (`{ step? }`, removes users and keeps or remakes the setup token), so e2e can reach both sides of the first-run gate and start each spec from a known step.
- Secret store (07 §7.7): `HLABS_SECRET_STORE=keychain|file` picks the backend. Default: `keychain` for a production desktop install (service `dev.hlabs`, D-050), `file` for headless Linux and for development and tests (AES-256-GCM, key in `<dataDir>/secret.key`, mode 0600), so development never touches the login keychain.
- `onboarding.setStep({ step })` accepts only the next enabled step after a step that can be passed without action (`welcome` in phase 1; skip two-factor, remote access and starter apps join with their stories). Asking for the step that is already saved is a no-op; anything else fails with `ONBOARDING_STEP_INVALID` (PRECONDITION_FAILED, new). The step registry and "next enabled step" live in `@hlabs/shared` (`ONBOARDING_STEPS`, `enabledOnboardingSteps`, `nextOnboardingStep`, `stepperOnboardingSteps`); the API's `onboardingStepSchema` is built from it.
- Dashboard routes: `/setup` opens onboarding (the welcome screen) and each step lives at `/setup/<step>` (for example `/setup/system`); these are the "onboarding routes" the stories refer to.
- `ONBOARDING_COMPLETE` maps to `FORBIDDEN` (was PRECONDITION_FAILED), as US-ONB-03 requires.
- The Stepper counts `stepperOnboardingSteps()` (the enabled steps without `welcome` and `done`), so "Step N of M" has M = 4 in phase 1 and 6 once every phase has shipped.
- `onboarding.checkSystem` output (US-ONB-04): `{ cpu { model, arch }, os { platform, name, version, headless }, engine { kind, version, state: running | stopped | missing, level }, disk { freeBytes, path, level }, ports { http { port, inUse, use }, https { port, inUse, use }, level }, canContinue }`, where `level` is `ok | warning | error`. Disk is measured at the default storage root: `error` below 10 GB (blocks Continue), `warning` below 30 GB. A taken port is a `warning` and falls back to 8080 (http) / 8443 (https). `engine.install` joins with US-ONB-05. The check is read-only.
- `onboarding.confirmSystem({ startAtLogin })` re-runs the check and fails with `ENGINE_UNAVAILABLE` (no running engine) or `DISK_FULL` (under 10 GB) if a blocking check fails; otherwise it saves `settings.startup.startAtLogin`, the chosen ports in `settings.network.ports`, and moves the step to `account` (a later saved step is kept). Called from `welcome`, it fails with `ONBOARDING_STEP_INVALID`.
- `onboarding.installEngine` (US-ONB-05) → `{ jobId }` (job kind `engine_install`): macOS only (`ENGINE_INSTALL_UNSUPPORTED`, now BAD_REQUEST, elsewhere); only when no engine is found (`VALIDATION_FAILED` otherwise); returns the running job's id instead of starting a second install. `checkSystem.engine.install` is `{ jobId, state, progress, lastLogLine, hlabsCode, log? }` for the latest install job, or null. The install log is `<dataDir>/engine/install.log`.
- Development only: `HLABS_DEV_IGNORE_ENGINES=1` makes engine detection ignore every engine except hlabs's own Colima (profile `hlabs`), to try the install on a Mac that already has OrbStack or Docker Desktop.
- A failed `engine_install` (US-ONB-06) writes a last log line `<stage>: <reason>` (stages: `<colima|lima|docker> download`, `colima start`), then deletes the `hlabs` Colima profile if it was created and everything in `<dataDir>/engine` except `install.log`, all before the job is marked failed (so a retry during cleanup gets the same job back). Retry is `onboarding.installEngine` again, which re-detects engines first.
- Development and e2e only: `HLABS_DEV_NO_ENGINE_INSTALL=1` makes `onboarding.installEngine` fail with `ENGINE_INSTALL_UNSUPPORTED`, so an e2e run on a machine without an engine never downloads or starts Colima. Playwright sets it for both e2e daemons.
- `checkSystem.engine.state` (US-ONB-07) adds `noAccess` (a socket exists but this account can't open it: on Linux, not in the `docker` group) and reports `stopped` with its `kind` when OrbStack or Docker Desktop is installed on a Mac but not running (their socket is gone when they're quit), so hlabs doesn't install Colima next to them. `installEngine` only runs when the check says `missing`.
- `onboarding.confirmSystem({ startAtLogin })` emits `startup.changeRequested` when the choice changes (same effect as `settings.startup.update`, D-042). The onboarding switch is hidden until the tray ships (phase 4) and on headless Linux; until then the default (on) is saved.
- Sessions (07 §7.3, from US-ONB-08): the `hlabs_session` cookie (32 random bytes, SHA-256 stored; HttpOnly, Secure, SameSite=Lax, Path=/; `Max-Age` only with remember me). Until Caddy serves `hlabs.local` (phase 2) the cookie is host-only; `Domain=.hlabs.local` and the tailnet host are added then. `auth.me` (a real session only; the development anonymous admin gets `AUTH_REQUIRED`) now also returns `csrfToken`.
- CSRF: every mutation made with a session needs `x-hlabs-csrf` equal to `auth.me`'s `csrfToken` (derived from the session id), and an `Origin`, when sent, must be the dashboard's; otherwise `CSRF_REJECTED` (FORBIDDEN, new). Setup-token calls and public procedures carry no session and aren't affected.
- Setup access once an admin exists (US-ONB-03): the setup token no longer works; setup procedures need the admin's session (`AUTH_REQUIRED` without one, `ACCESS_DENIED` for a member), with CSRF on mutations.
- `onboarding.createAdmin` (US-ONB-10): once any user exists it fails with `ONBOARDING_USERS_EXIST` (CONFLICT) for every caller, before the session check, so a stale setup tab learns an admin exists; the count check and the insert run in one transaction, so of two simultaneous calls exactly one succeeds.
- `onboarding.setupTotp` (US-ONB-11) returns `{ otpauthUrl, secret }` (the `qrSvg` field is removed: the dashboard draws the QR code); it needs the admin's session, keeps the secret pending in memory (a new call replaces it) and refuses when two-factor is already on. `onboarding.confirmTotp({ code })` checks RFC 6238 (SHA-1, 6 digits, 30 s, ±1 step): a wrong code is `TOTP_INVALID_CODE`, and 5 wrong codes in 15 minutes give `AUTH_LOCKED` for 15 minutes (`detail.until`). On success the secret goes to the secret store (`totp:<userId>`), `user_totp.enabled_at` is set, 10 recovery codes `xxxx-xxxx` (letters and digits without 0/o/1/l/i) are stored as Argon2id hashes and returned once, and `totp.enable` is audited. The step stays `twoFactor` until Continue (US-ONB-12).
- US-ONB-12: `auth.me` adds `totpEnabled`. `onboarding.setStep` also moves past `twoFactor` (to `storage`): Continue after two-factor is on, or Skip for now (US-ONB-13).
