-- US-FILE-08: upload sessions gain the file's name, what to do on a name conflict and the last chunk's time. The table
-- was never used before phase 5, so it is made again rather than altered (SQLite can't add NOT NULL columns).
DROP TABLE `upload_sessions`;--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`on_conflict` text DEFAULT 'keepBoth' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_sessions_target_idx` ON `upload_sessions` (`user_id`,`path`,`name`);
