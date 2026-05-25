import { eq, and, lt } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { reasoningCache, type ReasoningCacheRow } from '../db/schema.js';
import type { ReasoningFields } from '../utils/reasoning.js';

/** TTL for cache entries: 24 hours in milliseconds. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Data-access layer for the `reasoning_cache` table.
 *
 * Stores and retrieves reasoning fields from assistant
 * messages, keyed by a conversation fingerprint and the
 * zero-based assistant message index.
 */
export class ReasoningCacheRepository {
  constructor(private readonly db: Database) {}

  /**
   * Caches reasoning fields for a specific assistant message.
   *
   * Uses upsert semantics: if a row already exists for the
   * given fingerprint + assistantIndex, it is updated.
   *
   * @param fingerprint - Conversation fingerprint.
   * @param assistantIndex - Zero-based index among assistant
   *   messages in the conversation.
   * @param fields - The reasoning fields to cache.
   */
  cache(fingerprint: string, assistantIndex: number, fields: ReasoningFields): void {
    const now = new Date().toISOString();
    this.db
      .insert(reasoningCache)
      .values({
        fingerprint,
        assistantIndex,
        reasoningContent: fields.reasoning_content ?? null,
        reasoning: fields.reasoning ?? null,
        reasoningDetails: fields.reasoning_details
          ? JSON.stringify(fields.reasoning_details)
          : null,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [reasoningCache.fingerprint, reasoningCache.assistantIndex],
        set: {
          reasoningContent: fields.reasoning_content ?? null,
          reasoning: fields.reasoning ?? null,
          reasoningDetails: fields.reasoning_details
            ? JSON.stringify(fields.reasoning_details)
            : null,
          createdAt: now,
        },
      })
      .run();
  }

  /**
   * Retrieves cached reasoning fields for a specific
   * assistant message.
   *
   * @param fingerprint - Conversation fingerprint.
   * @param assistantIndex - Zero-based index among assistant
   *   messages in the conversation.
   * @returns The cached reasoning fields, or `null` if no
   *   cache entry exists.
   */
  get(fingerprint: string, assistantIndex: number): ReasoningFields | null {
    const row = this.db
      .select()
      .from(reasoningCache)
      .where(
        and(
          eq(reasoningCache.fingerprint, fingerprint),
          eq(reasoningCache.assistantIndex, assistantIndex),
        ),
      )
      .get() as ReasoningCacheRow | undefined;

    if (!row) return null;

    return {
      reasoning_content: row.reasoningContent ?? undefined,
      reasoning: row.reasoning ?? undefined,
      reasoning_details: row.reasoningDetails
        ? (JSON.parse(row.reasoningDetails) as ReasoningFields['reasoning_details'])
        : undefined,
    };
  }

  /**
   * Deletes all cache entries older than 24 hours.
   */
  deleteExpired(): void {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    this.db.delete(reasoningCache).where(lt(reasoningCache.createdAt, cutoff)).run();
  }

  /**
   * Deletes all cache entries. Useful for testing.
   */
  deleteAll(): void {
    this.db.delete(reasoningCache).run();
  }
}
