ALTER TABLE `catalog_apps` ADD `version_seen_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `catalog_apps` SET `version_seen_at` = `first_seen_at`;