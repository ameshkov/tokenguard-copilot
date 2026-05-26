# Reasoning Preservation

This document explains how the extension preserves language model
reasoning (thinking tokens) across multi-turn conversations.

## Table of Contents

- [What is Reasoning?](#what-is-reasoning)
- [Why Preserve Reasoning?](#why-preserve-reasoning)
- [Architecture Overview](#architecture-overview)
- [Provider-Dependent Reasoning Fields](#provider-dependent-reasoning-fields)
- [The Reasoning Cache](#the-reasoning-cache)
    - [Database Schema](#database-schema)
    - [Repository Layer](#repository-layer)
- [End-to-End Flow](#end-to-end-flow)
    - [Turn 1: Initial Request](#turn-1-initial-request)
    - [Turn 2+: Backfill and Re-request](#turn-2-backfill-and-re-request)
- [Fingerprint Computation](#fingerprint-computation)
- [Placeholder Handling](#placeholder-handling)
- [TTL and Cleanup](#ttl-and-cleanup)
- [Configuration](#configuration)

## What is Reasoning?

Reasoning (also called "thinking tokens") refers to the internal
chain-of-thought tokens a language model generates before producing
its final answer. These tokens:

- Are returned separately from the main `content` in the API response.
- Are billed as output tokens, often at a different rate.
- May be hidden from the end user or shown in a special UI element.
- Must be **re-sent** to the model on subsequent turns for
  context-dependent models to maintain coherence.

The VS Code proposed API provides `LanguageModelThinkingPart`:

```typescript
declare module 'vscode' {
  export class LanguageModelThinkingPart {
    value: string | string[];
    id?: string;
    metadata?: { readonly [key: string]: any };
    constructor(
      value: string | string[],
      id?: string,
      metadata?: { readonly [key: string]: any },
    );
  }
}
```

The extension extracts reasoning strings from API responses, wraps
them in `LanguageModelThinkingPart`, and reports them via the VS Code
progress callback so Copilot Chat can display them in the chat UI.

## Why Preserve Reasoning?

Many reasoning-capable models (DeepSeek, Qwen, Anthropic Claude)
require the assistant's previous thinking tokens to be included in the
message history for context-dependent responses. If the reasoning is
stripped between turns:

- The model may lose context about its previous chain of thought.
- The quality of follow-up responses degrades.
- The conversation may feel disjointed or repetitive.

VS Code Copilot Chat **does not** preserve reasoning parts across
turns by default — the `LanguageModelThinkingPart` objects are passed
to the chat UI but are not included in subsequent
`LanguageModelChatRequestMessage` arrays. The extension's reasoning
cache solves this by storing the reasoning server-side and
re-injecting it before each API call.

## Architecture Overview

The reasoning preservation system has four layers:

```text
┌─────────────────────────────────────────────┐
│              ChatHandler                     │
│  (orchestrates translate → backfill → POST  │
│   → extract → cache)                        │
├─────────────────────────────────────────────┤
│           ReasoningCacheService              │
│  (backfillReasoning / cacheReasoning /       │
│   computeFingerprint)                       │
├─────────────────────────────────────────────┤
│          ReasoningCacheRepository           │
│  (cache / get / deleteExpired / deleteAll)   │
├─────────────────────────────────────────────┤
│      SQLite + Drizzle (reasoning_cache)      │
│  (fingerprint, assistant_index, fields)     │
└─────────────────────────────────────────────┘
```

| Layer | Responsibility |
| --- | --- |
| `ChatHandler` | Calls `backfillReasoning` before the API request and `cacheReasoning` after a successful response |
| `ReasoningCacheService` | Computes conversation fingerprints, orchestrates backfill and cache logic |
| `ReasoningCacheRepository` | CRUD operations on the `reasoning_cache` table |
| SQLite / Drizzle | Persistent storage keyed by `(fingerprint, assistantIndex)` |

Periodic cleanup runs via `ReasoningCacheCleanupService`, which
deletes expired entries every 30 minutes.

## Provider-Dependent Reasoning Fields

Different providers return reasoning in different response fields. The
extension normalises all of them into a single `ReasoningFields`
interface.

**File:** `packages/extension/src/utils/reasoning.ts`

```typescript
export interface ReasoningFields {
  reasoning_content?: string;       // DeepSeek, Qwen, Kimi, GLM, MiMo
  reasoning?: string;               // Anthropic (plaintext via OpenRouter)
  reasoning_details?: Array<{       // Anthropic (structured via OpenRouter)
    type: string;
    text?: string;
  }>;
}
```

Two extraction functions are provided:

| Function | Returns | Purpose |
| --- | --- | --- |
| `extractReasoning(source)` | Single longest string or `null` | Displaying to VS Code as a `LanguageModelThinkingPart` |
| `extractReasoningFields(source)` | `ReasoningFields` or `null` | Caching and backfill |

`extractReasoningFields` preserves all three fields separately.
`extractReasoning` returns only the longest candidate (used to pick
the best value for display).

## The Reasoning Cache

### Database Schema

The `reasoning_cache` table stores one row per assistant message per
conversation.

**File:** `packages/extension/src/db/schema.ts`

```typescript
export const reasoningCache = sqliteTable('reasoning_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fingerprint: text('fingerprint').notNull(),
  assistantIndex: integer('assistant_index').notNull(),
  reasoningContent: text('reasoning_content'),    // DeepSeek/Qwen/Kimi/GLM/MiMo
  reasoning: text('reasoning'),                    // Anthropic plaintext
  reasoningDetails: text('reasoning_details'),     // JSON-stringified
  createdAt: text('created_at').notNull(),
}, (table) => [unique().on(table.fingerprint, table.assistantIndex)]);
```

Key design points:

- **Composite unique key** `(fingerprint, assistantIndex)` ensures one
  entry per assistant message per conversation. The fingerprint
  identifies the conversation, and the assistant index is the
  zero-based position of the assistant message within that
  conversation.
- **`reasoningDetails`** is stored as a JSON string and parsed back
  on retrieval.
- **`createdAt`** enables TTL-based cleanup (24-hour expiry).

The `models` table also carries reasoning-related columns:

```typescript
defaultReasoningEffort: text('default_reasoning_effort'),
reasoningEffortMap: text('reasoning_effort_map'),   // JSON
preserveReasoning: integer('preserve_reasoning').notNull().default(0),
```

And the `usage_records` table tracks reasoning token consumption:

```typescript
reasoningTokens: integer('reasoning_tokens').notNull().default(0),
```

### Repository Layer

**File:** `packages/extension/src/repositories/reasoning-cache-repository.ts`

| Method | Purpose |
| --- | --- |
| `cache(fingerprint, assistantIndex, fields)` | Upserts reasoning fields for a specific assistant message |
| `get(fingerprint, assistantIndex)` | Retrieves cached reasoning fields |
| `deleteExpired()` | Removes entries older than 24 hours |
| `deleteAll()` | Clears all entries (testing only) |

The `cache` method uses `onConflictDoUpdate` for upsert semantics: if
a row already exists for the given `(fingerprint, assistantIndex)`, it
is updated in place.

## End-to-End Flow

### Turn 1: Initial Request

```text
User sends message
       │
       ▼
ChatHandler.handle()
       │
       ├─ translateMessages()
       │   Converts VS Code LanguageModelChatMessage[] → OpenAIMessage[]
       │   (reasoning fields are not yet present)
       │
       ├─ backfillReasoning()
       │   No previous cache → no-op
       │
       ├─ buildRequestBody()
       │   Merges reasoningEffortMap into the API body:
       │   e.g., { enable_thinking: true, preserve_thinking: true }
       │
       ├─ POST /v1/chat/completions
       │
       ├─ handleStreaming() / handleNonStreaming()
       │   ├─ Extracts reasoning from each SSE delta
       │   ├─ Accumulates into ReasoningCollector.fields
       │   └─ Reports LanguageModelThinkingPart to VS Code
       │
       └─ cacheReasoning()
           Computes fingerprint from (system+user messages + response content)
           Stores fields at (fingerprint, assistantIndex=0)
```

`cacheReasoning` computes the assistant index by counting existing
assistant messages in the translated array. On Turn 1 there are none,
so `assistantIndex = 0`.

### Turn 2+: Backfill and Re-request

```text
User sends follow-up message
       │
       ▼
ChatHandler.handle()
       │
       ├─ translateMessages()
       │   The previous assistant message is now in the array,
       │   but WITHOUT reasoning fields (VS Code doesn't preserve
       │   LanguageModelThinkingPart across turns).
       │
       ├─ backfillReasoning()
       │   ├─ Computes the same fingerprint (same system+user prefix)
       │   ├─ repo.get(fingerprint, assistantIndex=0) → cached fields
       │   └─ Injects cached fields into assistant message[0]:
       │       msg.reasoning_content = cached.reasoning_content
       │       msg.reasoning = cached.reasoning
       │       msg.reasoning_details = cached.reasoning_details
       │
       ├─ buildRequestBody()
       │   Merges reasoningEffortMap again
       │
       ├─ POST /v1/chat/completions
       │   (body now includes preserved reasoning in the
       │    assistant message)
       │
       ├─ handleStreaming()
       │   Extracts Turn 2 reasoning as before
       │
       └─ cacheReasoning()
           Stores Turn 2 fields at (fingerprint, assistantIndex=1)
```

The same pattern works with **tool calls**: the fingerprint uses
`tool_calls[0].id` instead of `content`, ensuring the cache lookup
survives multi-step tool-using conversations.

## Fingerprint Computation

The fingerprint is a SHA-256 hash that uniquely identifies a
conversation regardless of how many turns have elapsed.

**Algorithm:**

```text
1. Collect all system and user messages before the first assistant
   message (in order, concatenated with null separators).
2. Determine the "key part":
   - If the first assistant has tool_calls → tool_calls[0].id
   - Otherwise → the first assistant's content
3. SHA-256(prefixParts.join('\0') + '\0' + keyPart)
```

The fingerprint is stable across turns because it only considers
messages *before* the first assistant message. New user messages
appended after the first assistant message do not change the hash.

**Two code paths use this fingerprint:**

| Path | Key part source |
| --- | --- |
| `backfillReasoning` (Turn 2+) | First assistant message already in the array |
| `cacheReasoning` (Turn 1) | `response.content` or `response.firstToolCallId` parameter (assistant not yet in array) |

If no key part can be determined (empty content, no tool calls), the
fingerprint is `null` and caching / backfill is skipped.

## Placeholder Handling

Some agent frameworks supply a placeholder reasoning value (a single
character like `"."`) to satisfy API formatting requirements without
providing real reasoning content.

During backfill, the service checks: if the agent-provided reasoning
string is ≤ 1 character long, it is treated as a placeholder and
**replaced** with the cached value. This ensures real reasoning
content is always used when available.

## TTL and Cleanup

Cache entries expire after 24 hours. Cleanup is handled by
`ReasoningCacheCleanupService`:

- Runs immediately on extension activation.
- Runs every 30 minutes thereafter.
- Deletes all rows where `createdAt < now - 24h`.

The service is registered in `extension.ts` as a VS Code `Disposable`,
so cleanup stops when the extension deactivates.

```typescript
context.subscriptions.push(ctx.reasoningCacheCleanup.startPeriodicCleanup());
```

## Configuration

Reasoning preservation is configured per model through two mechanisms:

### 1. Model Defaults (bundled JSON)

**File:** `assets/model-defaults.json`

Each model entry can include:

| Field | Type | Purpose |
| --- | --- | --- |
| `preserveReasoning` | `boolean` | Master switch for reasoning preservation |
| `defaultReasoningEffort` | `string` | Default effort level (`"none"`, `"high"`, etc.) |
| `reasoningEffortMap` | `object` | Maps effort levels to provider-specific body parameters |

Example for `qwen-3.6-plus`:

```json
{
  "defaultReasoningEffort": "high",
  "reasoningEffortMap": {
    "none": { "enable_thinking": false },
    "high": { "enable_thinking": true, "preserve_thinking": true }
  },
  "preserveReasoning": true
}
```

Example for `deepseek-v4-pro`:

```json
{
  "reasoningEffortMap": {
    "none": { "thinking": { "type": "disabled" } },
    "high": { "reasoning_effort": "high", "thinking": { "type": "enabled" } },
    "xhigh": { "reasoning_effort": "max", "thinking": { "type": "enabled" } }
  },
  "preserveReasoning": true
}
```

### 2. Database Model Row

The `models` table stores user-overridable defaults that take
precedence over the bundled JSON:

| Column | Default | Description |
| --- | --- | --- |
| `defaultReasoningEffort` | `null` | Per-model default effort level |
| `reasoningEffortMap` | `null` | JSON-stringified effort map |
| `preserveReasoning` | `0` | Whether reasoning preservation is enabled |

### 3. Reasoning Effort at Request Time

When building the API request body, `buildRequestBody` resolves the
effective effort level:

1. Use `ctx.reasoningEffort` (user's selection in the model picker),
   falling back to `ctx.model.defaultReasoningEffort`.
2. If an effort map exists and the resolved level is in the map, merge
   the map entry's key-value pairs into the body.
3. If no map exists, no provider-specific parameters are added.

This allows models to declare arbitrary provider-specific parameters
(e.g., `enable_thinking`, `thinking.type`, `reasoning_effort`) through
a generic key-value mechanism without hardcoding provider logic.

## Dependency Injection Wiring

The reasoning cache service is created once and shared across all
model requests:

```typescript
// packages/extension/src/context.ts
const reasoningCacheRepo = new ReasoningCacheRepository(deps.db);
const reasoningCacheService = new ReasoningCacheService(reasoningCacheRepo);

this.modelRegistry = new ModelRegistry(
  modelRepo, providerRepo, deps.secrets, getDefaults,
  this.chatDebugLogger, this.tokenCounter,
  reasoningCacheService,
  this.usageTracker,
);
```

In `ModelRegistry`, each chat request creates a `ChatHandler` with the
same shared `ReasoningCacheService` instance.

## Summary

```text
Turn 1                    Turn 2                    Turn 3
   │                        │                        │
   ├─ POST (no reasoning)   ├─ POST (with backfill)  ├─ POST (with backfill)
   │                        │                        │
   ├─ extract reasoning     ├─ extract reasoning     ├─ extract reasoning
   │                        │                        │
   └─ cache (idx=0)         └─ cache (idx=1)         └─ cache (idx=2)
                                ↑                        ↑
                           repo.get(fp, 0)          repo.get(fp, 0)
                                                     repo.get(fp, 1)
```

Key design decisions:

- **Fingerprint stability**: The hash ignores all messages after the
  first assistant, so it remains constant across turns.
- **Three-field normalisation**: Backfill copies the longest reasoning
  string to all three fields for cross-provider compatibility.
- **Placeholder detection**: Very short strings (≤ 1 char) are treated
  as placeholders and replaced with cached content.
- **TTL-based eviction**: Cache entries live for 24 hours, with
  periodic cleanup every 30 minutes.
- **Upsert semantics**: If the same `(fingerprint, assistantIndex)`
  pair is written twice, the second write updates the existing row.
