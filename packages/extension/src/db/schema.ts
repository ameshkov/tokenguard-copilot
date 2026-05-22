import { sqliteTable, text, integer, real, primaryKey, unique } from 'drizzle-orm/sqlite-core';

/**
 * Providers table — stores OpenAI-compatible API provider
 * configurations.
 *
 * API keys are stored separately in VS Code SecretStorage,
 * keyed by the provider `id`.
 */
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  baseUrl: text('base_url').notNull(),
  removed: integer('removed').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** TypeScript type for a selected provider row. */
export type Provider = typeof providers.$inferSelect;

/** TypeScript type for inserting a new provider. */
export type NewProvider = typeof providers.$inferInsert;

/**
 * Models table — stores per-model configuration for registered
 * Copilot Chat providers.
 *
 * Each model belongs to a provider and is identified by the
 * composite key (id, providerId).
 */
export const models = sqliteTable(
  'models',
  {
    id: text('id').notNull(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    displayName: text('display_name'),
    maxContextWindowTokens: integer('max_context_window_tokens').notNull(),
    maxOutputTokens: integer('max_output_tokens').notNull(),
    streaming: integer('streaming').notNull().default(1),
    vision: integer('vision').notNull().default(0),
    temperature: real('temperature'),
    topP: real('top_p'),
    frequencyPenalty: real('frequency_penalty'),
    presencePenalty: real('presence_penalty'),
    supportedReasoningEfforts: text('supported_reasoning_efforts'),
    defaultReasoningEffort: text('default_reasoning_effort'),
    reasoningEffortMap: text('reasoning_effort_map'),
    preserveReasoning: integer('preserve_reasoning').notNull().default(0),
    inputCostPer1m: real('input_cost_per_1m'),
    outputCostPer1m: real('output_cost_per_1m'),
    cachedInputCostPer1m: real('cached_input_cost_per_1m'),
    enabled: integer('enabled').notNull().default(1),
    removed: integer('removed').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.providerId],
    }),
  ],
);

/** TypeScript type for a selected model row. */
export type Model = typeof models.$inferSelect;

/** TypeScript type for inserting a new model. */
export type NewModel = typeof models.$inferInsert;

/**
 * Usage records table — daily aggregated token usage per
 * model.
 *
 * Each row represents one day of usage for a specific model.
 * Counters are incremented (upserted) on each request
 * completion.
 */
export const usageRecords = sqliteTable(
  'usage_records',
  {
    id: integer('id').primaryKey({
      autoIncrement: true,
    }),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    modelId: text('model_id').notNull(),
    date: text('date').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),
    requestCount: integer('request_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    estimatedCost: real('estimated_cost').notNull().default(0),
  },
  (table) => [unique().on(table.providerId, table.modelId, table.date)],
);

/** TypeScript type for a selected usage record row. */
export type UsageRecord = typeof usageRecords.$inferSelect;

/** TypeScript type for inserting a new usage record. */
export type NewUsageRecord = typeof usageRecords.$inferInsert;

/**
 * Settings table — generic key-value store for extension
 * configuration.
 *
 * Each row stores a single setting identified by its key.
 * Values are stored as text and parsed by the consuming
 * service.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** TypeScript type for a selected settings row. */
export type Setting = typeof settings.$inferSelect;

/** TypeScript type for inserting a new settings row. */
export type NewSetting = typeof settings.$inferInsert;

/**
 * Session mappings table — maps tool call IDs and content
 * checksums to chat debug session IDs.
 *
 * Used by the session tracker to attribute incoming chat
 * requests to existing sessions. Each row maps either a
 * `toolCallId` or a `contentChecksum` (or both) to a
 * `sessionId`.
 */
export const sessionMappings = sqliteTable('session_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toolCallId: text('tool_call_id').unique(),
  contentChecksum: text('content_checksum'),
  sessionId: text('session_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  modelName: text('model_name').notNull(),
  createdAt: text('created_at').notNull(),
});

/** TypeScript type for a selected session mapping row. */
export type SessionMapping = typeof sessionMappings.$inferSelect;

/** TypeScript type for inserting a new session mapping. */
export type NewSessionMapping = typeof sessionMappings.$inferInsert;
