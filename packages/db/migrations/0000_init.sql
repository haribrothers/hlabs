CREATE TABLE `app_access` (
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`app_id`, `user_id`),
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_access_user_idx` ON `app_access` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_env` (
	`app_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`secret_ref` text,
	`is_secret` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`app_id`, `key`),
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `app_mounts` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`target` text NOT NULL,
	`storage_location_id` text NOT NULL,
	`subpath` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'rw' NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storage_location_id`) REFERENCES `storage_locations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `app_mounts_app_idx` ON `app_mounts` (`app_id`);--> statement-breakpoint
CREATE TABLE `app_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`public_key` text,
	`last_synced_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`version` text NOT NULL,
	`previous_version` text,
	`state` text NOT NULL,
	`state_detail` text,
	`hostname` text NOT NULL,
	`port_fallback` integer,
	`autostart` integer DEFAULT true NOT NULL,
	`auto_update` integer DEFAULT false NOT NULL,
	`auth_mode` text DEFAULT 'hlabs' NOT NULL,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`installed_by` text,
	`custom` integer DEFAULT false NOT NULL,
	`net_internet` integer DEFAULT true NOT NULL,
	`net_apps` integer DEFAULT true NOT NULL,
	`data_location_id` text,
	FOREIGN KEY (`source_id`) REFERENCES `app_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`installed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`data_location_id`) REFERENCES `storage_locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_hostname_unique` ON `apps` (`hostname`);--> statement-breakpoint
CREATE UNIQUE INDEX `apps_port_fallback_unique` ON `apps` (`port_fallback`);--> statement-breakpoint
CREATE TABLE `catalog_apps` (
	`source_id` text NOT NULL,
	`app_id` text NOT NULL,
	`version` text NOT NULL,
	`manifest_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	PRIMARY KEY(`source_id`, `app_id`),
	FOREIGN KEY (`source_id`) REFERENCES `app_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `home_layout` (
	`user_id` text PRIMARY KEY NOT NULL,
	`items_json` text DEFAULT '[]' NOT NULL,
	`dock_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `backup_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`config_json` text NOT NULL,
	`repo_password_ref` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`used_bytes` integer,
	`snapshot_count` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_plan` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`schedule_cron` text DEFAULT '0 3 * * *' NOT NULL,
	`retention_json` text DEFAULT '{"daily":7,"weekly":4,"monthly":6}' NOT NULL,
	`include_json` text DEFAULT '{"apps":"all","homeFolders":"all"}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`pause_apps` integer DEFAULT true NOT NULL,
	CONSTRAINT "backup_plan_singleton" CHECK("backup_plan"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`bytes_added` integer,
	`files_changed` integer,
	`error` text,
	`log_path` text,
	FOREIGN KEY (`destination_id`) REFERENCES `backup_destinations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `backup_runs_started_idx` ON `backup_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `restores` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`destination_id` text,
	`scope_json` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	FOREIGN KEY (`destination_id`) REFERENCES `backup_destinations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `invite_app_access` (
	`invite_id` text NOT NULL,
	`app_id` text NOT NULL,
	PRIMARY KEY(`invite_id`, `app_id`),
	FOREIGN KEY (`invite_id`) REFERENCES `invites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`token_ref` text,
	`role` text NOT NULL,
	`display_name` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`ip` text NOT NULL,
	`at` integer NOT NULL,
	`success` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_lookup_idx` ON `login_attempts` (`username`,`ip`,`at`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text,
	`created_via` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_idx` ON `password_resets` (`token_hash`);--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_codes_user_idx` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`remember` integer DEFAULT false NOT NULL,
	`user_agent` text,
	`ip` text,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_totp` (
	`user_id` text PRIMARY KEY NOT NULL,
	`secret_ref` text NOT NULL,
	`enabled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`avatar_color` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL,
	`last_active_at` integer,
	`disabled_at` integer,
	`password_changed_at` integer,
	`can_see_shared` integer DEFAULT false NOT NULL,
	`can_see_usage` integer DEFAULT false NOT NULL,
	`share_password_ref` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `file_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`protocol` text DEFAULT 'smb' NOT NULL,
	`name` text NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	`users_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_shares_name_unique` ON `file_shares` (`name`);--> statement-breakpoint
CREATE TABLE `storage_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`mount_options` text,
	`secret_ref` text,
	`is_root` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_seen_at` integer,
	`auto_mount` integer DEFAULT true NOT NULL,
	`apps_allowed` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_locations_one_root_idx` ON `storage_locations` (`is_root`) WHERE "storage_locations"."is_root" = 1;--> statement-breakpoint
CREATE TABLE `trash_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`original_path` text NOT NULL,
	`trash_path` text NOT NULL,
	`deleted_at` integer NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trash_items_owner_idx` ON `trash_items` (`owner_user_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`target` text,
	`detail_json` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target` text,
	`state` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`message` text,
	`payload_json` text,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_state_idx` ON `jobs` (`state`);--> statement-breakpoint
CREATE TABLE `mcp_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tokens_token_hash_unique` ON `mcp_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`action_json` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_samples` (
	`ts` integer NOT NULL,
	`resolution` text NOT NULL,
	`scope` text NOT NULL,
	`cpu` real,
	`mem_bytes` integer,
	`net_rx` integer,
	`net_tx` integer,
	`disk_read` integer,
	`disk_write` integer,
	PRIMARY KEY(`scope`, `resolution`, `ts`)
);
