CREATE TABLE `app_images` (
	`image_id` text NOT NULL,
	`app_id` text NOT NULL,
	`ref` text NOT NULL,
	`pulled_at` integer NOT NULL,
	PRIMARY KEY(`image_id`, `app_id`)
);
