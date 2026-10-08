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
    - [Session Fingerprint](#session-fingerprint-computefingerprint)
    - [Message Fingerprint](#message-fingerprint-computemessagefingerprint)
    - [How the Two Fingerprints Work Together](#how-the-two-fingerprints-work-together)
- [Message Skipping vs Selective Backfill](#message-skipping-vs-selective-backfill)
- [Debug Logging](#debug-logging)
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

### VS Code's Built-in Mechanism

VS Code provides `LanguageModelThinkingPart` to carry reasoning
tokens. Within a multi-turn **agentic scenario** — where VS Code
orchestrates a loop of model calls, tool invocations, and follow-up
prompts — the runtime re-sends `LanguageModelThinkingPart` objects
for previous assistant messages in each subsequent request. The
extension can extract reasoning fields directly from these parts,
which carry `presentFields` metadata recording exactly which server
fields were originally returned.

### The Limitation

When the agentic script **finishes** and the user sends a **new
message** into the same chat, VS Code starts a fresh request cycle.
It does **not** re-send the `LanguageModelThinkingPart` objects from
previous turns. The reasoning is lost — the model receives the
assistant's text and tool calls but none of the thinking tokens that
preceded them.

### Why the Database Is Needed

The SQLite reasoning cache acts as a **persistent fallback**. It
stores reasoning fields keyed by a dual-fingerprint scheme:

- **Session fingerprint** — identifies the conversation (derived
  from system + user message prefix).
- **Message fingerprint** — identifies each assistant message by
  its content and tool calls.

When VS Code does not provide thinking parts (after the agent script
finishes, or in non-agentic scenarios), the extension retrieves
cached reasoning from the database and backfills it into the API
request. This ensures the model always has access to prior thinking
tokens, regardless of whether VS Code re-sends them.

### Two-Tier Strategy

The extension uses a two-tier approach to reasoning preservation:

1. **Primary source — VS Code thinking parts.** When VS Code
   provides `LanguageModelThinkingPart` for a message (typically
   within an active agentic loop), the extension extracts reasoning
   fields directly from the parts. This is the most accurate source
   because thinking parts carry `presentFields` metadata that
   records exactly which server fields were returned.

2. **Fallback — database cache.** When VS Code does not provide
   thinking parts (after the agent script finishes, or when the
   user sends a new message into an existing chat), the extension
   falls back to the reasoning cache. The cache stores exactly the
   fields the server originally returned, so selective backfill
   preserves the correct field set.

This two-tier strategy ensures reasoning is preserved both within
active agentic loops (via thinking parts) and across non-contiguous
chat turns (via the database cache).

## Architecture Overview

The reasoning preservation system uses a two-tier strategy with four
layers:

```text
ChatHandler.handle()
       │
       ├─ translateMessages()          ← Primary: extract from
       │   thinkingPartsToReasoning()     VS Code thinking parts
       │   sets reasoning fields on       (presentFields metadata)
       │   OpenAIMessage directly
       │
       ├─ backfillReasoning()          ← Fallback: read from cache
       │   skips if reasoning already     (only when thinking parts
       │   present on the message          were not provided)
       │   computes fingerprints
       │   repo.get() → inject fields
       │
       ├─ POST /v1/chat/completions
       │
       └─ cacheReasoning()             ← Store for future turns
           computes fingerprints
           repo.cache()
       │
       ▼
┌──────────────────────────────────────────────┐
│       ReasoningCacheService                  │
│  (backfillReasoning / cacheReasoning /       │
│   computeFingerprint +                       │
│   computeMessageFingerprint)                 │
├──────────────────────────────────────────────┤
│       ReasoningCacheRepository               │
│  (cache / get / deleteExpired / deleteAll)   │
├──────────────────────────────────────────────┤
│       SQLite + Drizzle (reasoning_cache)     │
│  (fingerprint, message_fingerprint, fields)  │
└──────────────────────────────────────────────┘
```

| Layer | Responsibility |
| --- | --- |
| `translateMessages()` | **Primary source.** Extracts reasoning from `LanguageModelThinkingPart` objects via `thinkingPartsToReasoning()`, setting fields directly on `OpenAIMessage` when thinking parts are available. |
| `ChatHandler.backfillReasoning()` | **Fallback.** Skips messages that already have reasoning (from thinking parts). For remaining messages, looks up cached reasoning by fingerprint and injects fields from the database. Returns the indices of cache-injected messages so the debug logger can attribute the reasoning source. |
| `ChatHandler.cacheReasoning()` | Stores reasoning fields from the API response into the cache for future turns. |
| `ReasoningCacheService` | Computes session and message fingerprints, orchestrates conditional backfill and cache logic. |
| `ReasoningCacheRepository` | CRUD operations on the `reasoning_cache` table. |
| SQLite / Drizzle | Persistent storage keyed by `(fingerprint, messageFingerprint)`. |

The utility `thinkingPartsToReasoning()` in
`utils/reasoning-conversion.ts` converts `LanguageModelThinkingPart`
objects into `ReasoningFields`, using `presentFields` metadata to
determine which provider-dependent fields to populate. When a thinking
part was built from a signed reasoning detail, its `signature`,
`type` (`detailType`), `index` (`detailIndex`), `format`
(`detailFormat`), and `id` (`detailId`) are round-tripped through
thinking-part `metadata` so the reconstructed `reasoning_details` block
keeps the same identity as the original provider response. Dropping the
`format` (or `index`) for a signed reasoning detail causes upstream
providers to reject the preserved `thinking` block with the
`Invalid signature in thinking block` error, because the `format` tag
is what tells the provider how to interpret the signature.

Streamed `reasoning_details` deltas (OpenRouter sends reasoning text
chunk-by-chunk, with the `signature` only on the final chunk of a
block) are merged by `mergeReasoningDetails()` during SSE
accumulation. Deltas are grouped by block identity
(`type` + `index` + `format`) and their `text`/`summary`/`data` are
concatenated into a single detail entry per block, so the
backfilled assistant message never splits one reasoning block across
multiple array items. Matching is wildcard-aware: OpenRouter only
attaches `index`/`format` to some chunks of a block (and the
`signature` to the final one), so a delta that omits `index` or
`format` still merges into an existing block of the same `type`. An
exact (type + index + format) pass runs first so distinct indexed
blocks stay separate even with wildcard deltas. Without this, a block
would be split into two entries — one without a `signature` — and the
upstream provider would reject the preserved `thinking` block with
`Invalid signature in thinking block`.

Periodic cleanup runs via `ReasoningCacheCleanupService`, which
deletes expired entries every 30 minutes.

## Provider-Dependent Reasoning Fields

Different providers return reasoning in different response fields. The
extension normalises all of them into a single `ReasoningFields`
interface.

**File:** `packages/extension/src/utils/reasoning.ts`

```typescript
export interface ReasoningDetail {
  type: string;            // e.g. "reasoning.text", "reasoning.summary",
                           //      "reasoning.encrypted"
  text?: string;
  summary?: string;
  data?: string;
  signature?: string;      // Anthropic signature (final chunk only)
  index?: number;
  format?: string;         // e.g. "anthropic-claude-v1"
  id?: string;
  [key: string]: unknown;  // round-trips any other provider field
}

export interface ReasoningFields {
  reasoning_content?: string;       // DeepSeek, Qwen, Kimi, GLM, MiMo
  reasoning?: string;               // Anthropic (plaintext via OpenRouter)
  reasoning_details?: ReasoningDetail[]; // Anthropic (structured)
}
```

Within `ReasoningFields`, the `reasoning_details` array is the only
structured form and carries **identity fields** that providers use to
validate a signed `thinking` block:

- `signature` — cryptographic signature covering the block's text;
  present only on the final chunk of a streamed block.
- `format` — tag telling the provider how to interpret `signature`
  (e.g. `anthropic-claude-v1`). Without it the signature cannot be
  validated.
- `index` — sequential position among interleaved reasoning blocks;
  disambiguates multiple blocks of the same `type`.
- `id` — provider-assigned block identifier (e.g. `blk_01`).

These fields must be preserved **verbatim** across both preservation
tiers. Dropping `index` or `format`, or stranding `signature` on a
fragment without its identity, causes the provider to reject the next
request with `Invalid signature in thinking block`. The
[Architecture Overview](#architecture-overview) explains how the
extension round-trips these fields through thinking-part metadata and
merges streamed deltas into one entry per block.

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
  messageFingerprint: text('message_fingerprint').notNull(),
  reasoningContent: text('reasoning_content'),
  reasoning: text('reasoning'),
  reasoningDetails: text('reasoning_details'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  unique().on(table.fingerprint, table.messageFingerprint),
]);
```

Key design points:

- **Composite unique key** `(fingerprint, messageFingerprint)`
  ensures one entry per assistant message per conversation.
  `fingerprint` is the session-level conversation fingerprint,
  and `messageFingerprint` is a per-message hash derived from
  the assistant message's `content` and `tool_calls`.
- This dual-key approach is resilient to conversation rollbacks
  in Copilot Chat — if the user rolls back and the same
  assistant message reappears at a different index, it still
  matches by content.
- **`reasoningDetails`** is stored as a JSON string and parsed
  back on retrieval.
- **`createdAt`** enables TTL-based cleanup (30-day expiry).

The `models` table also carries reasoning-related columns:

```typescript
defaultReasoningEffort: text('default_reasoning_effort'),
reasoningEffortMap: text('reasoning_effort_map'),   // JSON
preserveReasoning: integer('preserve_reasoning').notNull().default(1),
```

And the `usage_records` table tracks reasoning token consumption:

```typescript
reasoningTokens: integer('reasoning_tokens').notNull().default(0),
```

### Repository Layer

**File:** `packages/extension/src/repositories/reasoning-cache-repository.ts`

| Method | Purpose |
| --- | --- |
| `cache(fingerprint, messageFingerprint, fields)` | Upserts reasoning fields for a specific assistant message |
| `get(fingerprint, messageFingerprint)` | Retrieves cached reasoning fields |
| `deleteExpired()` | Removes entries older than 30 days |
| `deleteAll()` | Clears all entries (testing only) |

The `cache` method uses `onConflictDoUpdate` for upsert
semantics: if a row already exists for the given
`(fingerprint, messageFingerprint)`, it is updated in place.

## End-to-End Flow

### Turn 1: Initial Request

```text
User sends message
       │
       ▼
ChatHandler.handle()
       │
       ├─ translateMessages()
       │   Converts VS Code LanguageModelChatMessage[]
       │   → OpenAIMessage[]
       │   (reasoning fields are not yet present)
       │
       ├─ backfillReasoning()
       │   No previous cache → no-op
       │
       ├─ buildRequestBody()
       │   Merges reasoningEffortMap into the API body:
       │   e.g., { enable_thinking: true,
       │          preserve_thinking: true }
       │
       ├─ POST /v1/chat/completions
       │
       ├─ handleStreaming() / handleNonStreaming()
       │   ├─ Extracts reasoning from each SSE delta
       │   ├─ Accumulates into ReasoningCollector.fields
       │   └─ Reports LanguageModelThinkingPart to VS Code
       │
       └─ cacheReasoning()
           Computes session FP from
             (system+user prefix + response content)
           Computes message FP from
             (response content + tool_calls)
           Stores fields at (sessionFP, messageFP)
```

### Turn 2+: Backfill and Re-request

```text
User sends follow-up message
       │
       ▼
ChatHandler.handle()
       │
       ├─ translateMessages()
       │   Collects LanguageModelThinkingPart from
       │   previous assistant messages (if VS Code
       │   re-sends them in an agentic loop).
       │   Calls thinkingPartsToReasoning() to set
       │   reasoning fields on the OpenAIMessage.
       │
       ├─ backfillReasoning()
       │   ├─ Computes session FP
       │   │   (same system+user prefix)
       │   ├─ For each assistant message:
       │   │   ├─ If reasoning fields already present
       │   │   │   (from thinking parts) → skip
       │   │   ├─ Computes message FP from
       │   │   │   (msg.content + msg.tool_calls)
       │   │   ├─ repo.get(sessionFP, msgFP)
       │   │   │   → cached fields
       │   │   └─ Injects only the cached fields
       │   │       (selective backfill)
       │
       ├─ buildRequestBody()
       │   Merges reasoningEffortMap again
       │
       ├─ POST /v1/chat/completions
       │   (body now includes preserved reasoning in
       │    the assistant message)
       │
       ├─ handleStreaming()
       │   Extracts Turn 2 reasoning as before
       │
       └─ cacheReasoning()
           Computes session FP + message FP
           Stores Turn 2 fields at (sessionFP, msgFP)
```

The same pattern works with **tool calls**: the message
fingerprint includes `tool_calls` (sorted by `id`, with
the `type` field stripped and all keys sorted), ensuring
the cache lookup works for tool-using conversations.

## Fingerprint Computation

The cache uses a **dual-fingerprint** scheme:

### Session Fingerprint (`computeFingerprint`)

A SHA-256 hash that uniquely identifies a conversation
regardless of how many turns have elapsed.

**Algorithm:**

```text
1. Collect all system and user messages before the
   first assistant message (in order, concatenated
   with null separators).
2. Determine the "key part":
   - If the first assistant has tool_calls
     → all tool call IDs, sorted alphabetically
       and joined with null separators.
   - Otherwise → the first assistant's content
3. SHA-256(prefixParts.join('\0') + '\0' + keyPart)
```

Sorting tool call IDs by name makes the fingerprint
stable even when the model returns tool calls in a
different order across requests (e.g. on a retry or
when VS Code reorders the tool call array between
turns). The same conversation always hashes to the
same value.

The session fingerprint is stable across turns because
it considers the prefix (all messages before the first
assistant response) and a key part derived *from* that
first assistant response.

### Message Fingerprint (`computeMessageFingerprint`)

A SHA-256 hash that uniquely identifies a single assistant
message by its **client-visible fields** (`content` and
`tool_calls`). Reasoning fields are excluded.

**Normalization rules:**

- **Content normalization**: Empty string `""` and `null`
  are treated as equivalent — both serialize to `null`.
- **Tool call normalization**: `tool_calls` are sorted by
  `id`, the `type: "function"` field is stripped (always
  implied), and all object keys are sorted alphabetically
  at every nesting level.
- **Deterministic serialization**: Uses `JSON.stringify`
  with a key-sorting replacer, ensuring the same logical
  content always produces the same hash regardless of key
  order.
- **Model-agnostic**: The message fingerprint does **not**
  include the model name, so reasoning cached with one
  model can be retrieved when switching models mid-session.

If both content and tool calls are empty/absent, the
message fingerprint is `null` and caching/backfill is
skipped for that message.

### How the Two Fingerprints Work Together

The composite key `(sessionFP, messageFP)` ensures:

- Entries are scoped to a specific conversation (session FP
  prevents cross-conversation collisions).
- Each assistant message is identified by its content, not
  its position — resilient to conversation rollbacks where
  Copilot may replay messages in a different order.

## Message Skipping vs Selective Backfill

During backfill, each assistant message follows one of
three paths:

1. **Already has reasoning fields (from thinking parts)**:
   The message is skipped entirely — no cache lookup is
   performed. Thinking parts in `translateMessages` are
   the **primary source** and always take precedence.

2. **No reasoning fields, but cache entry exists**:
   Only the fields present in the cache entry are injected
   (selective backfill). A cache entry with only
   `reasoning_content` will not set `reasoning` or
   `reasoning_details`.

3. **No reasoning fields and no cache entry**:
   Nothing is set — the message is sent as-is. No
   placeholder or fallback value is injected.

## Debug Logging

The **Chat Debug** log (written by `ChatDebugLogger`)
surfaces which two-tier source produced each assistant
message's reasoning, plus a structured summary of the
fields that will reach the provider. This makes the
cache-vs-thinking-part distinction observable when
investigating `Invalid signature in thinking block`
errors.

### Source Attribution

`backfillReasoning()` returns the indices of assistant
messages whose reasoning was **injected from the cache**.
These indices are threaded through `ChatHandler` →
`logChatDebugRequest` → `ChatDebugLogger`. For each
assistant message that carries reasoning, the log
renders one of:

```text
🧠 Reasoning · source: cache
🧠 Reasoning · source: thinking-part
```

- `cache` — VS Code did not re-send
  `LanguageModelThinkingPart` (the agentic loop finished
  or the user sent a new message), so reasoning was
  restored from the SQLite cache.
- `thinking-part` — reasoning was extracted from
  `LanguageModelThinkingPart` metadata (the primary
  source) and the cache was not consulted for this
  message.

### Field Summary

Below the reasoning text, a `Fields:` block lists every
provider-dependent field present on the message:

```text
Fields:
  reasoning_content (27 chars)
  reasoning_details (2 block(s)):
    [0] type=reasoning.text index=0 format=anthropic-
        claude-v1 signature=152c id=blk_01 text=27c
    [1] type=reasoning.summary index=1 format=—
        signature=null id=— text=12c
```

The same summary is rendered for the **response**
reasoning fields, so a round-trip can be audited end to
end: the identity fields (`index`, `format`,
`signature`, `id`) that the provider needs to validate a
signed `thinking` block are visible at a glance.

## TTL and Cleanup

Cache entries expire after 30 days. Cleanup is handled by
`ReasoningCacheCleanupService`:

- Runs immediately on extension activation.
- Runs every 30 minutes thereafter.
- Deletes all rows where `createdAt < now - 30d`.

The service is registered in `extension.ts` as a VS Code `Disposable`,
so cleanup stops when the extension deactivates.

```typescript
context.subscriptions.push(ctx.reasoningCacheCleanup.startPeriodicCleanup());
```

## Configuration

Reasoning preservation is configured per model through two mechanisms:

### 1. Model Defaults (models.dev snapshot)

**File:** `assets/models.dev.json` (refreshed manually via
`pnpm run fetch:models-dev`)

The bundled snapshot of models.dev provides context/output limits,
costs, and capabilities (vision, reasoning options) for known models.
It does not carry reasoning-preservation settings per entry —
`preserveReasoning`, `reasoningEffortMap`, and `defaultReasoningEffort`
are configured per model in the database row (below) or pre-filled from
the provider's `/models` response (`reasoning.supported_efforts`).

As a universal default, `deriveDefaults` enables `preserveReasoning`
for every model and additionally enables `cacheControl`
(`{ enabled: true, maxMarkers: 4 }`) for Qwen models of version 3.7 or
older — those pair with the Alibaba-style request bodies and benefit
from prompt caching. The user can still override both in the model
configuration dialog.

### 2. Database Model Row

The `models` table stores user-overridable defaults that take
precedence over the bundled JSON:

| Column | Default | Description |
| --- | --- | --- |
| `defaultReasoningEffort` | `null` | Per-model default effort level |
| `reasoningEffortMap` | `null` | JSON-stringified effort map |
| `preserveReasoning` | `1` | Whether reasoning preservation is enabled |

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
const reasoningCacheService = new ReasoningCacheService(reasoningCacheRepo, deps.logger);
const modelDefaults = new ModelDefaultsService({ logger: deps.logger });

this.modelRegistry = new ModelRegistry(
  modelRepo, providerRepo, deps.secrets, this.chatDebugLogger,
  this.tokenCounter, reasoningCacheService, this.usageTracker,
  this.contentRules, modelDefaults, deps.logger, deps.version,
);
```

The `ModelDefaultsService` reads the bundled models.dev snapshot
(`assets/models.dev.json`) for context, costs, and capabilities, and
merges those defaults into models fetched from a provider's `/models`
endpoint. In `ModelRegistry`, each chat request creates a
`ChatHandler` with the same shared `ReasoningCacheService` instance.

## Summary

```text
Turn 1                    Turn 2
   │                        │
   ├─ POST (no reasoning)   ├─ POST (with backfill)
   │                        │
   ├─ extract reasoning     ├─ extract reasoning
   │                        │
   └─ cache                 └─ cache
       (sessFP, msgFP_A1)       (sessFP, msgFP_A2)
                                ↑
                           repo.get(sessFP, msgFP_A1)
```

Key design decisions:

- **Dual fingerprint**: Session FP scopes entries to a
  conversation; message FP identifies each assistant
  message by content, not position.
- **Rollback resilience**: Because messages are keyed by
  content hash, replaying the same assistant message at
  a different index still hits the cache.
- **Model-agnostic**: Message FP excludes the model name
  so reasoning survives mid-session model switches.
- **Selective backfill**: When using cached reasoning,
  only fields present in the cache entry are injected.
  When using thinking parts, only fields recorded in
  `presentFields` metadata are set.
- **Placeholder detection**: Very short strings (≤ 1
  char) are treated as placeholders and replaced with
  cached content.
- **TTL-based eviction**: Cache entries live for 24
  hours, with periodic cleanup every 30 minutes.
- **Upsert semantics**: If the same
  `(fingerprint, messageFingerprint)` pair is written
  twice, the second write updates the existing row.
