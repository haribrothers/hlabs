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
| `password_resets` | `id`, `user_id`, `token_hash`, `created_via` (`tray`\|`admin`), `expires_at` (15 min), `used_at` | Only created locally (tray) or by an admin. |

### Apps
| Table | Columns | Notes |
| --- | --- | --- |
| `app_sources` | `id`, `name`, `url` (git or https index), `kind` (`builtin`\|`git`\|`index`), `enabled`, `last_synced_at`, `last_error` | The built-in source can't be removed. |
| `catalog_apps` | `source_id`, `app_id`, `version`, `manifest_json`, `updated_at` | Cache of the store index; rebuilt on sync. |
| `apps` | `id` (= appId), `source_id`, `version`, `previous_version`, `state` (see 02 §2.5), `state_detail`, `hostname`, `port_fallback`, `autostart`, `auto_update`, `auth_mode` (`hlabs`\|`none`), `installed_at`, `updated_at`, `installed_by`, `custom` (bool, DeployCustom) | Desired state + last known state. |
| `app_env` | `app_id`, `key`, `value` or `secret_ref`, `is_secret` | User-provided env from manifest prompts / AppConfig. |
| `app_mounts` | `id`, `app_id`, `target` (container path key from manifest), `storage_location_id`, `subpath`, `mode` (`ro`\|`rw`) | Folder access chosen in InstallSheet / AppPermissions. |
| `app_access` | `app_id`, `user_id` | Members only; admins can open every app. |
| `home_layout` | `user_id`, `items_json`, `dock_json` | Ordered app ids + widgets per user (HomeEdit); `dock_json` = the person's pinned Dock apps, ordered, max 8 (D-054). |

### Storage, files, network
| Table | Columns | Notes |
| --- | --- | --- |
| `storage_locations` | `id`, `kind` (`local`\|`external`\|`smb`\|`nfs`), `name`, `path`, `mount_options`, `secret_ref`, `is_root` (bool), `status`, `last_seen_at` | Exactly one `is_root`. |
| `file_shares` | `id`, `path`, `protocol` (`smb`), `name`, `read_only`, `users_json` | FilesShare (P3). |
| `trash_items` | `id`, `owner_user_id`, `original_path`, `trash_path`, `deleted_at`, `size` | Auto-empty after 30 days. |
| `upload_sessions` | `id`, `user_id`, `path`, `size`, `received`, `created_at` | Resumable uploads. |

### Backups
| Table | Columns | Notes |
| --- | --- | --- |
| `backup_destinations` | `id`, `kind` (`local`\|`smb`\|`nfs`\|`s3`\|`sftp`\|`hlabs`), `name`, `config_json`, `repo_password_ref`, `status`, `used_bytes`, `snapshot_count`, `created_at` | |
| `backup_plan` | singleton row: `schedule_cron` (default `0 3 * * *`), `retention_json`, `include_json` (apps + home folders), `enabled` | BackupSchedule. |
| `backup_runs` | `id`, `destination_id`, `started_at`, `finished_at`, `status` (`running`\|`succeeded`\|`failed`\|`cancelled`), `trigger` (`schedule`\|`manual`\|`pre_update`), `bytes_added`, `files_changed`, `error`, `log_path` | |
| `restores` | `id`, `snapshot_id`, `destination_id`, `scope_json`, `status`, `started_at`, `finished_at`, `error` | |

### System
| Table | Columns | Notes |
| --- | --- | --- |
| `settings` | `key`, `value_json` | Typed keys in `packages/db/src/settings.ts`: `hostname`, `appearance:<userId>` (per user: wallpaper, accent, reduceTransparency, reduceMotion, showWidgets, showGreeting; D-010), `people` (showUserList, requireTotp, membersCanInstall, membersCanSeeUsage), `engine` (preferred, resources), `updates` (channel, auto hlabs/apps, backupBeforeUpdate), `remote` (tailscale state), `paused` (`{ at, appIds }`), `notifications` (admin channels: tray, ntfy), `notifications:<userId>` (per-user in-app switches, D-043), `ai` (MCP enabled, permissions), `onboarding` (completedAt, step, `setupTokenRef` → the setup token in the secret store; the daemon compares requests against its hash), `network` (`ports` {https, http} after fallback, `piholeDns`), `startup` (startAtLogin, autostartApps, keepAwake), `connections` (last-contacted time per outbound service, for Advanced › What hlabs connects to). |
| `jobs` | `id`, `kind`, `target`, `state` (`queued`\|`running`\|`succeeded`\|`failed`\|`cancelled`), `progress` (0–100), `message`, `payload_json`, `created_at`, `finished_at` | All long-running work. |
| `notifications` | `id`, `user_id` (null = all admins), `kind`, `severity` (`info`\|`success`\|`warning`\|`critical`), `title`, `body`, `action_json`, `created_at`, `read_at` | HomeNotifications. |
| `audit_log` | `id`, `at`, `user_id`, `action`, `target`, `detail_json`, `ip` | Security-relevant actions (logins, role changes, uninstall, restore, factory reset, settings changes). Kept 180 days. |
| `usage_samples` | `ts`, `resolution` (`1m`\|`1h`), `scope` (`host` or appId), `cpu`, `mem_bytes`, `net_rx`, `net_tx`, `disk_read`, `disk_write` | Downsampled history. |
| `mcp_tokens` | `id`, `name`, `token_hash`, `scopes_json`, `created_at`, `last_used_at`, `revoked_at` | SettingsAI (P3). |

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
| `catalog_apps` | `first_seen_at` (for the "New" sort) | 05-app-store |
| `apps` | `net_internet` (bool), `net_apps` (bool), `data_location_id` | 06-apps |
| `storage_locations` | `auto_mount` (default true), `apps_allowed` (default true) | 07-files |
| `backup_plan` | `pause_apps` (default true) | 08-usage-backups |
