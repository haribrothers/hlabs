# 04 · Data model

SQLite (WAL) via Drizzle ORM, schema in `packages/db/src/schema/*.ts`, migrations generated with `drizzle-kit` and committed. All ids are ULIDs (text). All timestamps are integer milliseconds UTC. Soft state that is cheap to rebuild (Docker container state, usage ring buffer) is **not** stored.

Secrets never go in SQLite in plain text: passwords are Argon2id hashes, TOTP secrets and backup/NAS passwords are stored in the OS keychain and referenced by `secret_ref`, or (headless Linux, no keychain) encrypted with a key in `<dataDir>/secret.key` (0600).

## Tables

### Identity
| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `users` | `id`, `username` (unique, lowercase), `display_name`, `role` (`admin`\|`member`), `password_hash`, `avatar_color`, `locale`, `created_at`, `last_active_at`, `disabled_at` | At least one enabled admin must always exist (enforced in service). |
| `user_totp` | `user_id` (pk), `secret_ref`, `enabled_at` | Pending secret held in memory until confirmed. |
| `recovery_codes` | `id`, `user_id`, `code_hash`, `used_at` | 10 codes, Argon2id-hashed. |
| `sessions` | `id` (random 32 bytes, stored hashed), `user_id`, `created_at`, `last_seen_at`, `expires_at`, `remember` (bool), `user_agent`, `ip`, `revoked_at` | Idle 12 h / remembered 30 days. |
| `login_attempts` | `id`, `username`, `ip`, `at`, `success` | Lockout: 5 failures / 15 min per username+IP → locked 15 min. |
| `invites` | `id`, `token_hash`, `role`, `display_name`, `created_by`, `created_at`, `expires_at` (7 days), `used_at`, `revoked_at` | Single-use. |
| `invite_app_access` | `invite_id`, `app_id` | Apps granted on accept. |
| `password_resets` | `id`, `user_id`, `token_hash`, `created_via` (`tray`\|`admin`), `expires_at` (15 min), `used_at` | Only created locally (tray) or by an admin. `token_hash` is null for tray resets, which apply directly. |

### Apps
| Table | Columns | Notes |
| --- | --- | --- |
| `app_sources` | `id`, `name`, `url` (git or https index), `kind` (`builtin`\|`git`\|`index`), `enabled`, `last_synced_at`, `last_error` | The built-in source can't be removed. |
| `catalog_apps` | `source_id`, `app_id`, `version`, `manifest_json`, `updated_at` | Cache of the store index; rebuilt on sync. |
| `apps` | `id` (= appId), `source_id`, `version`, `previous_version`, `state` (see 02 §2.5), `state_detail`, `hostname`, `port_fallback`, `autostart`, `auto_update`, `auth_mode` (`hlabs`\|`none`), `installed_at`, `updated_at`, `installed_by`, `custom` (bool, DeployCustom) | Desired state + last known state. |
| `app_env` | `app_id`, `key`, `value` or `secret_ref`, `is_secret` | User-provided env from manifest prompts / AppConfig. Keys that aren't a manifest prompt are variables someone added in AppConfig (set on the web service, D-165). A secret's `value` is null and `secret_ref` is `env`: its value is only in the app's 0600 `.env`. |
| `app_mounts` | `id`, `app_id`, `target` (container path key from manifest, or `/mnt/hlabs/<name>` for a folder given in AppPermissions), `storage_location_id`, `subpath`, `mode` (`ro`\|`rw`) | Folder access chosen in InstallSheet / AppPermissions (US-APP-17). |
| `app_access` | `app_id`, `user_id` | Members only; admins can open every app. |
| `app_images` | `image_id` (`sha256:…`), `app_id`, `ref`, `pulled_at`; key (`image_id`, `app_id`) | Images hlabs pulled for an app that weren't on the engine before (US-SYS-13, D-168): the only images "Free space" may remove. No foreign key, so rows outlive an uninstalled app; a row goes when its image is removed or found gone. |
| `home_layout` | `user_id`, `items_json`, `dock_json`, `hidden_json` | Ordered app ids + widgets per user (HomeEdit; at most 4 widgets, app widgets as `app:<appId>:<widgetId>`); `dock_json` = the person's pinned Dock apps, ordered, max 8 (D-054); `hidden_json` = apps they took off Home, still installed and not appended again as new (US-HOME-18). |

### Storage, files, network
| Table | Columns | Notes |
| --- | --- | --- |
| `storage_locations` | `id`, `kind` (`local`\|`external`\|`smb`\|`nfs`), `name`, `path`, `mount_options`, `secret_ref`, `is_root` (bool), `status` (`ok`\|`unreachable`\|`ejected`: disconnected from Settings › Storage, left offline until reconnected, US-SYS-12), `last_seen_at` | Exactly one `is_root`. |
| `file_shares` | `id`, `path`, `protocol` (`smb`), `name`, `read_only`, `users_json` | FilesShare (P3). |
| `trash_items` | `id`, `owner_user_id`, `original_path` (virtual), `trash_path` (`<location>/.trash/<userId>/<id>-<name>`, on the same storage location as the item), `deleted_at`, `size` | Auto-empty after 30 days (checked hourly). |
| `upload_sessions` | `id`, `user_id`, `path` (the folder, virtual), `name`, `size`, `received`, `on_conflict` (`skip`\|`keepBoth`\|`replace`), `created_at`, `updated_at` (last chunk) | Resumable uploads (US-FILE-08…10); one per person, folder and name (unique). Removed with its partial file after 24 h without a chunk. |

### Backups
| Table | Columns | Notes |
| --- | --- | --- |
| `backup_destinations` | `id`, `kind` (`local`\|`smb`\|`nfs`\|`s3`\|`sftp`\|`hlabs`), `name`, `config_json`, `repo_password_ref`, `status`, `used_bytes`, `snapshot_count`, `created_at` | |
| `backup_plan` | singleton row: `schedule_cron` (default `0 3 * * *`), `retention_json`, `include_json` (`{ apps: string[], folders: string[], includeNewApps }`: app ids, Home folders as `users/<name>` and `shared`; D-134), `enabled` | BackupSchedule. |
| `backup_runs` | `id`, `destination_id`, `started_at`, `finished_at`, `status` (`running`\|`succeeded`\|`failed`\|`cancelled`), `trigger` (`schedule`\|`manual`\|`pre_update`), `bytes_added`, `files_changed`, `error`, `log_path` | |
| `restores` | `id`, `snapshot_id`, `destination_id`, `scope_json`, `status`, `started_at`, `finished_at`, `error` | |

### System
| Table | Columns | Notes |
| --- | --- | --- |
| `settings` | `key`, `value_json` | Typed keys in `packages/db/src/settings.ts`: `hostname`, `appearance:<userId>` (per user: wallpaper `dusk`/`ocean`/`forest`/`custom`, accent, reduceTransparency, reduceMotion (null until the person sets it: the device's setting decides, D-167), showWidgets, showGreeting, customWallpaper `{ ext: jpg|png|webp, uploadedAt }` or null, the photo itself at `<dataDir>/wallpapers/<userId>.<ext>`; D-010), `people` (showUserList, requireTotp, membersCanInstall, membersCanSeeUsage), `engine` (preferred, resources: `{ cpus, memoryBytes, diskBytes }` for hlabs's Colima), `updates` (channel, auto hlabs/apps, backupBeforeUpdate; `lastCheckedAt`, `latest` `{ version, notes[], url }` \| null and `announced` (the newest version `update.available` went out for) from the last check, US-SYS-24; `announcedApps` (each app's update already announced after a store sync, `<version>#<revision>`, US-STORE-16); `autoNight` `{ hlabs, apps }`: the local nights automatic updates last ran, once a night, US-SYS-26), `remote` (`mode`: `off` \| `tailscale` \| `subnetRouter` (D-107), Tailscale `state`, `tailnetName`, `nodeName` (D-102), `dashboardPort` (443, or another tailnet port after a clash, D-103), `serve`: the Serve entries hlabs created), `paused` (`{ at, appIds, untilRestart }`; `untilRestart` when "Quit hlabs" stopped them, D-120, so the next start resumes them), `notifications` (admin channels: tray, ntfy), `notifications:<userId>` (per-user in-app switches, D-043), `filesSetUp:<userId>` (Files has made Photos, Documents and Downloads in that person's Home once, US-FILE-01), `ai` (MCP enabled, permissions), `onboarding` (completedAt, step, `setupTokenRef` → the setup token in the secret store; the daemon compares requests against its hash), `network` (`ports` {https, http} after fallback, `returnTo` {https, http} \| null: the ports "Use port 8443" moved away from, which the next start goes back to when free (US-SYS-42), `dns`: the local DNS server hlabs keeps records in (`kind`: `none` \| `adguard` \| `pihole` (with its `address`; the app password in the secret store as `dns:pihole`) \| `manual`; `owned`: the records hlabs wrote, the only ones it removes; `lastSyncAt`; `problem`: `unreachable` \| `auth` \| null), D-106), `startup` (startAtLogin, autostartApps, keepAwake), `connections` (last-contacted time per outbound service, e.g. `engineDownload`, `updateCheck`, for Advanced › What hlabs connects to). |
| `jobs` | `id`, `kind`, `target`, `state` (`queued`\|`running`\|`succeeded`\|`failed`\|`cancelled`), `progress` (0–100), `message`, `error_code` (hlabsCode when failed), `payload_json`, `created_at`, `finished_at` | All long-running work. Jobs left `queued` or `running` by a crash are marked `failed` with `error_code = INTERNAL` on the next start. |
| `notifications` | `id`, `user_id` (null = all admins), `kind`, `target` (what it's about, such as an app id; nullable, US-STATE-16), `severity` (`info`\|`success`\|`warning`\|`critical`), `title`, `body`, `action_json` (up to two actions, 05 Canonical names), `created_at`, `read_at` | HomeNotifications. |
| `audit_log` | `id`, `at`, `user_id`, `action`, `target`, `detail_json`, `ip` | Security-relevant actions (logins, role changes, uninstall, restore, factory reset, settings changes). Kept 180 days. |
| `usage_samples` | `ts`, `resolution` (`1m`\|`1h`), `scope` (`host` or appId), `cpu`, `mem_bytes`, `net_rx`, `net_tx`, `disk_read`, `disk_write` | Downsampled history (US-USE-09): averages over the minute or hour starting at `ts`; network and disk are bytes/s; a column is null when no sample in the period had it. 1m points kept 7 days, 1h points 90 days. |
| `mcp_tokens` | `id`, `name`, `token_hash`, `scopes_json`, `created_at`, `last_used_at`, `revoked_at` | SettingsAI (P3). |

The value shape and default of every `settings` key are the Zod schemas in `packages/db/src/settings.ts`; reads fall back to the default when a row is missing or invalid.

## Invariants (enforce in services, test them)
1. At least one enabled admin exists.
2. A member only sees apps in `app_access`; admins see all.
3. `apps.hostname` is unique and matches `^[a-z0-9-]{1,40}$`.
4. Exactly one storage location has `is_root = 1`.
5. Only one `jobs` row of kind `system_update`, `restore`, `move_all_data`, `engine_switch`, `rename_host` or `factory_reset` may be `running` at a time; these are exclusive with all app jobs (D-020).

## Columns added by the feature files
These columns were introduced while writing the stories and are part of the schema:

| Table | Added | Used by |
| --- | --- | --- |
| `users` | `password_changed_at`, `can_see_shared` (default false), `can_see_usage` (default false), `share_password_ref` (network-share password in the form the share server needs, D-051) | 09-account-people, 07-files |
| `invites` | `token_ref` (keychain ref so an admin can copy the link again while it's pending) | 09-account-people |
| `app_sources` | kind `local`; `public_key` (pinned ed25519 key) | 05-app-store |
| `app_sources` | `problems_json` (apps left out at the last sync and why, `[{ appId, file, line?, message }]`, US-STORE-27; migration 0008); `last_error` holds an hlabs code; `public_key` is the pinned minisign public key text (D-160) | 05-app-store |
| `catalog_apps` | `first_seen_at` (for the "New" sort); `version_seen_at` (when this version or revision first reached the catalogue: "released 2 days ago" in Updates, D-158; migration 0007) | 05-app-store |
| `apps` | `net_internet` (bool), `net_apps` (bool), `data_location_id` | 06-apps. `net_*` are set at install from manifest `permissions.network` (`internet`: both on; `lan`: internet off; `none`: both off) and changed in AppPermissions (US-APP-18, D-165). |
| `storage_locations` | `auto_mount` (default true), `apps_allowed` (default true) | 07-files |
| `backup_plan` | `pause_apps` (default true) | 08-usage-backups |
| `backup_runs` | `app_count`, `folder_count`, `retry` (the 30-minute retry of a scheduled run, D-046) | 08-usage-backups (US-BKP-03, US-BKP-07) |
| `restores` | `job_id`, `phase` (`checking`\|`stopping`\|`safety`\|`copying`\|`swap`\|`starting`\|`done`), `user_id`, `steps_json` | 08-usage-backups (US-BKP-20…22) |
| `apps` | `state` value `reinstalling` (02 §2.5) | 06-apps (US-APP-25) |
| `jobs` | `kind` value `app_reinstall` (an app job: serial per app, refused while an exclusive job runs) | 06-apps (US-APP-25) |
| `app_public` (new table, migration 0010) | `app_id` (PK, cascade on the app), `address` (`https://photos.example.com`), `hostname` (unique, lowercase, one label under the Cloudflare domain, D-171, D-179), `access` (`hlabs`\|`ownLogin`), `enabled_by` (set null when that user goes), `enabled_at` (kept when only the access or name changes) | 06-apps (US-APP-27…29, D-150). A row means the app is public; removed when it's made private. |
| `sessions` | `public_host` (migration 0010): a session signed in on a public app's address (`photos.example.com`, D-178) counts on that host only, never on the dashboard or another app; null for the dashboard's sessions. Ended when the app is made private or gets a new public name Also the public dashboard's sessions (US-SYS-46, D-182): `public_host` is the dashboard's public name, `remember` false, `expires_at` 12 hours on; ended when the dashboard is made private | 06-apps (US-APP-28), 10 (US-SYS-46) |
| `settings.public.dashboard` | `{ hostname, recordId, since, by, access: { appId, emails } \| null } \| null`: the public dashboard (US-SYS-45, 48, D-182); `access` is the Cloudflare Access application hlabs made. Job kinds `dashboard_public_on`, `dashboard_public_off`, `dashboard_access`. | 10-system-settings (US-SYS-45…48) |
| `jobs` | `kind` values `public_on`, `public_off` (app jobs, `target` the app) and `public_off_all`, `public_setup`, `public_remove`. Not exclusive: they run one at a time among themselves, and `public_off` / `public_off_all` start even while an exclusive job runs (D-179) | 06-apps, 10-system-settings (US-APP-27, US-SYS-43, 44) |
| `settings` | key `public` `{ cloudflare: { domain, zoneId, accountId, tunnelId, credential: 'signIn'\|'token', records: [{ id, name }], setUpAt, setUpBy } \| null }` (`records`: the DNS records hlabs made, the only ones it changes or deletes, D-171); the Cloudflare credential is keychain item `cloudflare-credential` (JSON `{ kind, token, zoneId, accountId, domain }`), never here; the tunnel's credentials file is `<dataDir>/cloudflare/tunnel.json` (0600) and cloudflared's config `<dataDir>/cloudflare/cloudflared.yml`; Visits come from `<dataDir>/logs/public/access*.log` (Caddy's, kept 7 days, never in backups or diagnostics) | 10-system-settings (US-SYS-43) |
| `app_sources` | `kind` `local` for a folder library under the storage root; `problem_count` (apps left out at the last sync) | 05-app-store (US-STORE-27, D-149) |
| `jobs` | `kind` values `diagnostics` (the bundle, US-SYS-28) and `daemon_restart` (stops the apps, then hlabsd exits 75 to be started again; not exclusive, refused while an exclusive job runs, US-SYS-31) | 10-system-settings |
| `settings` | key `connections`: last contact per outbound service, written as it happens (at most once a minute each): `updateCheck`, `engineDownload`, `tailscale`, `backup:<destinationId>`, `ntfy`, `cloudflare` (D-169, US-SYS-43) | 10-system-settings (US-SYS-29) |
| (files in the data dir) | `logs/installs.log` (+ `installs.1.log`): a line per app job step, pino's format, 5 MB each; `logs/factory-reset.log`: each factory reset's audit entry and what it left, kept across the reset; `factory-reset.json`: written last by a reset, the next start deletes `hlabs.db` before opening it; `diagnostics/<jobId>.zip` (0600): a bundle, deleted 15 minutes after it's ready or at the next start (D-169, D-170) | 10-system-settings (US-SYS-27, 28, 38) |
