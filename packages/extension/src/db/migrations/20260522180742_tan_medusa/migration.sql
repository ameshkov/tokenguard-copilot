-- Add updated_at column with default value for existing rows
ALTER TABLE `session_mappings` ADD `updated_at` text NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';

-- Update existing rows to set updated_at = created_at
UPDATE `session_mappings` SET `updated_at` = `created_at` WHERE `updated_at` = '1970-01-01T00:00:00.000Z';