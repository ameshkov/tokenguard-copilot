ALTER TABLE `usage_records` ADD `prompt_tokens_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_records` ADD `completion_tokens_cost` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_records` ADD `cached_tokens_cost` real DEFAULT 0 NOT NULL;

-- Step 2: Backfill — split historical estimated_cost proportionally
-- by token distribution. Uses CAST to avoid integer division truncation.
UPDATE `usage_records` SET
  `prompt_tokens_cost` = CASE
    WHEN (`prompt_tokens` + `completion_tokens` + `cached_tokens`) > 0
    THEN `estimated_cost` * CAST(`prompt_tokens` AS REAL)
         / (`prompt_tokens` + `completion_tokens` + `cached_tokens`)
    ELSE 0
  END,
  `completion_tokens_cost` = CASE
    WHEN (`prompt_tokens` + `completion_tokens` + `cached_tokens`) > 0
    THEN `estimated_cost` * CAST(`completion_tokens` AS REAL)
         / (`prompt_tokens` + `completion_tokens` + `cached_tokens`)
    ELSE 0
  END,
  `cached_tokens_cost` = CASE
    WHEN (`prompt_tokens` + `completion_tokens` + `cached_tokens`) > 0
    THEN `estimated_cost` * CAST(`cached_tokens` AS REAL)
         / (`prompt_tokens` + `completion_tokens` + `cached_tokens`)
    ELSE 0
  END;--> statement-breakpoint
ALTER TABLE `usage_records` DROP COLUMN `estimated_cost`;