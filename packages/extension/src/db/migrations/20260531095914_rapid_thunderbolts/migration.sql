CREATE TABLE `content_rules` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`enabled` integer DEFAULT 1 NOT NULL,
	`match_role` text,
	`match_message_number` integer,
	`match_model_pattern` text,
	`match_content_pattern` text,
	`match_tool_present` text,
	`match_tool_absent` text,
	`regex_pattern` text NOT NULL,
	`regex_flags` text DEFAULT '' NOT NULL,
	`substitution` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
