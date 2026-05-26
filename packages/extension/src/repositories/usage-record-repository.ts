import { eq, and, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { usageRecords, type UsageRecord } from '../db/schema.js';

/**
 * Input type for upserting a usage record — all fields
 * required except the auto-increment `id`.
 */
export interface UsageRecordUpsert {
  providerId: string;
  modelId: string;
  date: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  requestCount: number;
  errorCount: number;
  estimatedCost: number;
}

/**
 * Data-access layer for the `usage_records` table.
 *
 * Encapsulates all Drizzle queries for usage record rows.
 * No caching or business logic — pure data access.
 */
export class UsageRecordRepository {
  /**
   * Creates a new UsageRecordRepository.
   *
   * @param db - Drizzle database instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Upserts a daily aggregate record. On conflict
   * (providerId + modelId + date), increments
   * counters by adding the new values.
   *
   * @param record - The usage data to upsert.
   */
  upsert(record: UsageRecordUpsert): void {
    this.db
      .insert(usageRecords)
      .values(record as unknown as typeof usageRecords.$inferInsert)
      .onConflictDoUpdate({
        target: [usageRecords.providerId, usageRecords.modelId, usageRecords.date],
        set: {
          promptTokens: sql`${usageRecords.promptTokens} + ${record.promptTokens}`,
          completionTokens: sql`${usageRecords.completionTokens} + ${record.completionTokens}`,
          cachedTokens: sql`${usageRecords.cachedTokens} + ${record.cachedTokens}`,
          reasoningTokens: sql`${usageRecords.reasoningTokens} + ${record.reasoningTokens}`,
          requestCount: sql`${usageRecords.requestCount} + ${record.requestCount}`,
          errorCount: sql`${usageRecords.errorCount} + ${record.errorCount}`,
          estimatedCost: sql`${usageRecords.estimatedCost} + ${record.estimatedCost}`,
        },
      })
      .run();
  }

  /**
   * Returns all usage records for a provider.
   *
   * @param providerId - The provider ID.
   * @returns Array of usage records.
   */
  findByProvider(providerId: string): UsageRecord[] {
    return this.db.select().from(usageRecords).where(eq(usageRecords.providerId, providerId)).all();
  }

  /**
   * Returns all usage records for a specific model.
   *
   * @param providerId - The provider ID.
   * @param modelId - The model ID.
   * @returns Array of usage records.
   */
  findByModel(providerId: string, modelId: string): UsageRecord[] {
    return this.db
      .select()
      .from(usageRecords)
      .where(and(eq(usageRecords.providerId, providerId), eq(usageRecords.modelId, modelId)))
      .all();
  }

  /**
   * Returns all usage records, optionally filtered by
   * provider, model, and/or date range. All filter
   * parameters are optional — when omitted, no filter
   * is applied for that dimension.
   *
   * @param filters - Optional filter criteria.
   * @param filters.providerId - Provider ID filter.
   * @param filters.modelId - Model ID filter (requires
   *   providerId).
   * @param filters.dateFrom - Start date (ISO format,
   *   inclusive).
   * @param filters.dateTo - End date (ISO format,
   *   inclusive).
   * @returns Array of matching usage records.
   */
  findByDateRange(filters?: {
    providerId?: string;
    modelId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): UsageRecord[] {
    const conditions = [];

    if (filters?.providerId) {
      conditions.push(eq(usageRecords.providerId, filters.providerId));
    }
    if (filters?.modelId && filters?.providerId) {
      conditions.push(eq(usageRecords.modelId, filters.modelId));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(usageRecords.date, filters.dateFrom));
    }
    if (filters?.dateTo) {
      conditions.push(lte(usageRecords.date, filters.dateTo));
    }

    if (conditions.length === 0) {
      return this.db.select().from(usageRecords).all();
    }
    return this.db
      .select()
      .from(usageRecords)
      .where(and(...conditions))
      .all();
  }

  /**
   * Deletes all usage records for a given provider.
   *
   * @param providerId - The provider ID.
   * @returns Number of deleted rows.
   */
  deleteByProvider(providerId: string): number {
    const result = this.db
      .delete(usageRecords)
      .where(eq(usageRecords.providerId, providerId))
      .run();
    return Number(result.changes);
  }

  /**
   * Deletes all usage records for a given model.
   *
   * @param providerId - The provider ID.
   * @param modelId - The model ID.
   * @returns Number of deleted rows.
   */
  deleteByModel(providerId: string, modelId: string): number {
    const result = this.db
      .delete(usageRecords)
      .where(and(eq(usageRecords.providerId, providerId), eq(usageRecords.modelId, modelId)))
      .run();
    return Number(result.changes);
  }

  /**
   * Deletes all usage records from the table.
   */
  deleteAll(): void {
    this.db.delete(usageRecords).run();
  }
}
