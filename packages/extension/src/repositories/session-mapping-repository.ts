import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { sessionMappings, type SessionMapping } from '../db/index.js';

/** Insert shape for a content fingerprint mapping. */
export interface FingerprintMappingInsert {
  /** SHA-256 hex digest of the conversation fingerprint. */
  contentFingerprint: string;
  /** UUID of the session to map to. */
  sessionId: string;
  /** Hash of the workspace folder URI. */
  workspaceId: string;
  /** Display name of the model used. */
  modelName: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * Data access layer for the `session_mappings` table.
 *
 * Stores mappings between conversation fingerprints and
 * session IDs for chat debug session attribution.
 */
export class SessionMappingRepository {
  constructor(private readonly db: Database) {}

  /**
   * Insert a content fingerprint → session mapping.
   *
   * @param mapping - The fingerprint mapping to insert.
   * @returns The inserted row.
   */
  insertFingerprintMapping(mapping: FingerprintMappingInsert): SessionMapping {
    return this.db
      .insert(sessionMappings)
      .values({
        contentFingerprint: mapping.contentFingerprint,
        sessionId: mapping.sessionId,
        workspaceId: mapping.workspaceId,
        modelName: mapping.modelName,
        createdAt: mapping.createdAt,
        updatedAt: mapping.createdAt,
      })
      .returning()
      .get();
  }

  /**
   * Find a mapping by content fingerprint.
   *
   * @param fingerprint - The content fingerprint to look up.
   * @returns The matching row or `undefined`.
   */
  findByContentFingerprint(fingerprint: string): SessionMapping | undefined {
    return this.db
      .select()
      .from(sessionMappings)
      .where(eq(sessionMappings.contentFingerprint, fingerprint))
      .get();
  }

  /** Delete all session mappings. */
  deleteAll(): void {
    this.db.delete(sessionMappings).run();
  }

  /**
   * Get all distinct session IDs across all mappings.
   *
   * @returns Array of unique session IDs.
   */
  getDistinctSessionIds(): string[] {
    const rows = this.db
      .selectDistinct({ sessionId: sessionMappings.sessionId })
      .from(sessionMappings)
      .all();
    return rows.map((r) => r.sessionId);
  }

  /**
   * Update the updatedAt timestamp for all mappings belonging
   * to a session.
   *
   * Called when a session is resolved or new tool calls are
   * registered, keeping the session fresh for TTL cleanup.
   *
   * @param sessionId - The session ID to update.
   * @param timestamp - ISO 8601 timestamp.
   */
  bumpSession(sessionId: string, timestamp: string): void {
    this.db
      .update(sessionMappings)
      .set({ updatedAt: timestamp })
      .where(eq(sessionMappings.sessionId, sessionId))
      .run();
  }

  /**
   * Delete all session mappings where updatedAt is older than
   * the cutoff timestamp.
   *
   * @param cutoffIso - ISO 8601 timestamp (e.g., from
   *   `new Date(Date.now() - ttlMs).toISOString()`).
   * @returns The number of deleted rows.
   */
  deleteExpired(cutoffIso: string): number {
    const result = this.db
      .delete(sessionMappings)
      .where(sql`${sessionMappings.updatedAt} < ${cutoffIso}`)
      .run();
    return Number(result.changes);
  }
}
