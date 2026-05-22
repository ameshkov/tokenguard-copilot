import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { sessionMappings, type SessionMapping } from '../db/schema.js';

/** Insert shape for a tool call ID mapping. */
export interface ToolCallMappingInsert {
  /** The tool call ID from a model response. */
  toolCallId: string;
  /** UUID of the session to map to. */
  sessionId: string;
  /** Hash of the workspace folder URI. */
  workspaceId: string;
  /** Display name of the model used. */
  modelName: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Insert shape for a content checksum mapping. */
export interface ChecksumMappingInsert {
  /** SHA-256 hex digest of content. */
  contentChecksum: string;
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
 * Stores mappings between tool call IDs / content
 * checksums and session IDs for chat debug session
 * attribution.
 */
export class SessionMappingRepository {
  constructor(private readonly db: Database) {}

  /**
   * Insert a tool call ID → session mapping.
   *
   * @param mapping - The tool call mapping to insert.
   * @returns The inserted row.
   * @throws If the tool call ID already exists (UNIQUE
   *   constraint).
   */
  insertToolCallMapping(mapping: ToolCallMappingInsert): SessionMapping {
    return this.db
      .insert(sessionMappings)
      .values({
        toolCallId: mapping.toolCallId,
        sessionId: mapping.sessionId,
        workspaceId: mapping.workspaceId,
        modelName: mapping.modelName,
        createdAt: mapping.createdAt,
      })
      .returning()
      .get();
  }

  /**
   * Insert a content checksum → session mapping.
   *
   * @param mapping - The checksum mapping to insert.
   * @returns The inserted row.
   */
  insertChecksumMapping(mapping: ChecksumMappingInsert): SessionMapping {
    return this.db
      .insert(sessionMappings)
      .values({
        contentChecksum: mapping.contentChecksum,
        sessionId: mapping.sessionId,
        workspaceId: mapping.workspaceId,
        modelName: mapping.modelName,
        createdAt: mapping.createdAt,
      })
      .returning()
      .get();
  }

  /**
   * Find a mapping by tool call ID.
   *
   * @param toolCallId - The tool call ID to look up.
   * @returns The matching row or `undefined`.
   */
  findByToolCallId(toolCallId: string): SessionMapping | undefined {
    return this.db
      .select()
      .from(sessionMappings)
      .where(eq(sessionMappings.toolCallId, toolCallId))
      .get();
  }

  /**
   * Find a mapping by content checksum.
   *
   * @param checksum - The content checksum to look up.
   * @returns The matching row or `undefined`.
   */
  findByContentChecksum(checksum: string): SessionMapping | undefined {
    return this.db
      .select()
      .from(sessionMappings)
      .where(eq(sessionMappings.contentChecksum, checksum))
      .get();
  }

  /**
   * Delete all mappings for the given session IDs.
   *
   * @param sessionIds - Session IDs whose mappings should
   *   be removed.
   */
  deleteBySessionIds(sessionIds: string[]): void {
    if (sessionIds.length === 0) return;
    this.db.delete(sessionMappings).where(inArray(sessionMappings.sessionId, sessionIds)).run();
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
}
