CREATE TABLE `app_public` (
	`app_id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`hostname` text NOT NULL,
	`access` text NOT NULL,
	`enabled_by` text,
	`enabled_at` integer NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enabled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_public_hostname_unique` ON `app_public` (`hostname`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `public_host` text;