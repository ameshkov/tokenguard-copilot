PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`content_fingerprint` text,
	`session_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`model_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_session_mappings`(`id`, `content_fingerprint`, `session_id`, `workspace_id`, `model_name`, `created_at`, `updated_at`) SELECT `id`, `content_checksum`, `session_id`, `workspace_id`, `model_name`, `created_at`, `updated_at` FROM `session_mappings`;--> statement-breakpoint
DROP TABLE `session_mappings`;--> statement-breakpoint
ALTER TABLE `__new_session_mappings` RENAME TO `session_mappings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;