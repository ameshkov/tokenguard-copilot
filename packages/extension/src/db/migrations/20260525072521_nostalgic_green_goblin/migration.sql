CREATE TABLE `reasoning_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`fingerprint` text NOT NULL,
	`assistant_index` integer NOT NULL,
	`reasoning_content` text,
	`reasoning` text,
	`reasoning_details` text,
	`created_at` text NOT NULL,
	CONSTRAINT `reasoning_cache_fingerprint_assistant_index_unique` UNIQUE(`fingerprint`,`assistant_index`)
);
