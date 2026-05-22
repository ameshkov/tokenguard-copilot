CREATE TABLE `session_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`tool_call_id` text UNIQUE,
	`content_checksum` text,
	`session_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`model_name` text NOT NULL,
	`created_at` text NOT NULL
);
