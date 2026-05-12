CREATE TABLE `models` (
	`id` text NOT NULL,
	`provider_id` text NOT NULL,
	`display_name` text,
	`max_context_window_tokens` integer NOT NULL,
	`max_prompt_tokens` integer NOT NULL,
	`streaming` integer DEFAULT 1 NOT NULL,
	`vision` integer DEFAULT 0 NOT NULL,
	`temperature` real,
	`top_p` real,
	`frequency_penalty` real,
	`presence_penalty` real,
	`supported_reasoning_efforts` text,
	`default_reasoning_effort` text,
	`preserve_reasoning` integer DEFAULT 0 NOT NULL,
	`input_cost_per_1m` real,
	`output_cost_per_1m` real,
	`cached_input_cost_per_1m` real,
	`enabled` integer DEFAULT 1 NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `provider_id`),
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `providers_name_unique` ON `providers` (`name`);--> statement-breakpoint
CREATE TABLE `usage_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`date` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_records_provider_id_model_id_date_unique` ON `usage_records` (`provider_id`,`model_id`,`date`);