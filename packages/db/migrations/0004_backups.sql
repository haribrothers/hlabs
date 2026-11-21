PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_backup_plan` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`schedule_cron` text DEFAULT '0 3 * * *' NOT NULL,
	`retention_json` text DEFAULT '{"daily":7,"weekly":4,"monthly":6}' NOT NULL,
	`include_json` text,
	`enabled` integer DEFAULT true NOT NULL,
	`pause_apps` integer DEFAULT true NOT NULL,
	CONSTRAINT "backup_plan_singleton" CHECK("__new_backup_plan"."id" = 1)
);
--> statement-breakpoint
INSERT INTO `__new_backup_plan`("id", "schedule_cron", "retention_json", "include_json", "enabled", "pause_apps") SELECT "id", "schedule_cron", "retention_json", "include_json", "enabled", "pause_apps" FROM `backup_plan`;--> statement-breakpoint
DROP TABLE `backup_plan`;--> statement-breakpoint
ALTER TABLE `__new_backup_plan` RENAME TO `backup_plan`;--> statement-breakpoint
-- The first shape ({ apps: 'all', homeFolders: 'all' }) meant "everything": null now says the same (D-134).
UPDATE `backup_plan` SET `include_json` = NULL;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `backup_runs` ADD `app_count` integer;--> statement-breakpoint
ALTER TABLE `backup_runs` ADD `folder_count` integer;--> statement-breakpoint
ALTER TABLE `backup_runs` ADD `retry` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `restores` ADD `job_id` text;--> statement-breakpoint
ALTER TABLE `restores` ADD `phase` text DEFAULT 'checking' NOT NULL;--> statement-breakpoint
ALTER TABLE `restores` ADD `user_id` text;