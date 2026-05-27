DROP TABLE IF EXISTS `reasoning_cache`;--> statement-breakpoint
CREATE TABLE `reasoning_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`fingerprint` text NOT NULL,
	`message_fingerprint` text NOT NULL,
	`reasoning_content` text,
	`reasoning` text,
	`reasoning_details` text,
	`created_at` text NOT NULL,
	CONSTRAINT `reasoning_cache_fingerprint_message_fingerprint_unique` UNIQUE(`fingerprint`,`message_fingerprint`)
);