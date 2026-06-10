PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_models` (
	`id` text NOT NULL,
	`provider_id` text NOT NULL,
	`display_name` text,
	`max_context_window_tokens` integer NOT NULL,
	`max_output_tokens` integer NOT NULL,
	`streaming` integer DEFAULT 1 NOT NULL,
	`vision` integer DEFAULT 0 NOT NULL,
	`temperature` real,
	`top_p` real,
	`frequency_penalty` real,
	`presence_penalty` real,
	`default_reasoning_effort` text,
	`reasoning_effort_map` text,
	`preserve_reasoning` integer DEFAULT 1 NOT NULL,
	`input_cost_per_1m` real,
	`output_cost_per_1m` real,
	`cached_input_cost_per_1m` real,
	`cache_control` text,
	`custom_fields` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `models_id_provider_id_pk` PRIMARY KEY(`id`, `provider_id`),
	CONSTRAINT `models_provider_id_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_models`(`id`, `provider_id`, `display_name`, `max_context_window_tokens`, `max_output_tokens`, `streaming`, `vision`, `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`, `default_reasoning_effort`, `reasoning_effort_map`, `preserve_reasoning`, `input_cost_per_1m`, `output_cost_per_1m`, `cached_input_cost_per_1m`, `cache_control`, `custom_fields`, `enabled`, `removed`, `created_at`, `updated_at`) SELECT `id`, `provider_id`, `display_name`, `max_context_window_tokens`, `max_output_tokens`, `streaming`, `vision`, `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`, `default_reasoning_effort`, `reasoning_effort_map`, `preserve_reasoning`, `input_cost_per_1m`, `output_cost_per_1m`, `cached_input_cost_per_1m`, `cache_control`, `custom_fields`, `enabled`, `removed`, `created_at`, `updated_at` FROM `models`;--> statement-breakpoint
DROP TABLE `models`;--> statement-breakpoint
ALTER TABLE `__new_models` RENAME TO `models`;--> statement-breakpoint
PRAGMA foreign_keys=ON;