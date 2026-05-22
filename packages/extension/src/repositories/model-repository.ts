import { eq, and, ne } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { models, type Model, type NewModel } from '../db/schema.js';

/**
 * Data-access layer for the `models` table.
 *
 * Encapsulates all Drizzle queries for model rows.
 * No caching or business logic — pure data access.
 */
export class ModelRepository {
  /**
   * Creates a new ModelRepository.
   *
   * @param db - Drizzle database instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Inserts a new model row and returns it.
   *
   * @param model - The model data to insert.
   * @returns The inserted model row.
   */
  insert(model: NewModel): Model {
    return this.db.insert(models).values(model).returning().get();
  }

  /**
   * Returns all non-removed models, optionally filtered by
   * provider.
   *
   * @param providerId - Optional provider ID filter.
   * @returns Array of active model rows.
   */
  findActive(providerId?: string): Model[] {
    const conditions = [eq(models.removed, 0)];
    if (providerId) {
      conditions.push(eq(models.providerId, providerId));
    }
    return this.db
      .select()
      .from(models)
      .where(and(...conditions))
      .all();
  }

  /**
   * Returns all models including removed, optionally filtered
   * by provider.
   *
   * @param providerId - Optional provider ID filter.
   * @returns Array of all model rows.
   */
  findAll(providerId?: string): Model[] {
    if (providerId) {
      return this.db.select().from(models).where(eq(models.providerId, providerId)).all();
    }
    return this.db.select().from(models).all();
  }

  /**
   * Finds a model by its composite key (id + providerId).
   *
   * @param id - The model ID.
   * @param providerId - The provider ID.
   * @returns The model row or undefined.
   */
  findByKey(id: string, providerId: string): Model | undefined {
    return this.db
      .select()
      .from(models)
      .where(and(eq(models.id, id), eq(models.providerId, providerId)))
      .get();
  }

  /**
   * Checks whether a non-removed model with the given
   * composite key exists.
   *
   * @param id - The model ID.
   * @param providerId - The provider ID.
   * @returns True if a matching active model exists.
   */
  existsByKey(id: string, providerId: string): boolean {
    const row = this.db
      .select({ id: models.id })
      .from(models)
      .where(and(eq(models.id, id), eq(models.providerId, providerId), eq(models.removed, 0)))
      .get();
    return row !== undefined;
  }

  /**
   * Updates a model's mutable fields.
   *
   * @param id - The model ID.
   * @param providerId - The provider ID.
   * @param fields - Fields to update.
   * @returns The updated model row, or undefined if not found.
   */
  update(
    id: string,
    providerId: string,
    fields: Partial<
      Pick<
        Model,
        | 'displayName'
        | 'maxContextWindowTokens'
        | 'maxOutputTokens'
        | 'streaming'
        | 'vision'
        | 'temperature'
        | 'topP'
        | 'frequencyPenalty'
        | 'presencePenalty'
        | 'supportedReasoningEfforts'
        | 'defaultReasoningEffort'
        | 'reasoningEffortMap'
        | 'preserveReasoning'
        | 'inputCostPer1m'
        | 'outputCostPer1m'
        | 'cachedInputCostPer1m'
        | 'enabled'
      >
    >,
  ): Model | undefined {
    return this.db
      .update(models)
      .set({
        ...fields,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(models.id, id), eq(models.providerId, providerId)))
      .returning()
      .get();
  }

  /**
   * Soft-removes a model by setting `removed = 1`.
   *
   * @param id - The model ID.
   * @param providerId - The provider ID.
   * @returns True if a row was updated, false if not found.
   */
  softRemove(id: string, providerId: string): boolean {
    const result = this.db
      .update(models)
      .set({
        removed: 1,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(models.id, id), eq(models.providerId, providerId)))
      .returning()
      .get();
    return result !== undefined;
  }

  /**
   * Checks whether an active (non-removed) model with the given
   * display name exists.
   *
   * @param displayName - The display name to check. Returns
   *   false for null.
   * @param excludeId - Optional model ID to exclude from the
   *   check (for updates).
   * @param excludeProviderId - Optional provider ID paired with
   *   excludeId.
   * @returns True if a conflicting display name exists.
   */
  existsByDisplayName(
    displayName: string | null,
    excludeId?: string,
    excludeProviderId?: string,
  ): boolean {
    if (displayName === null) {
      return false;
    }
    const conditions = [eq(models.displayName, displayName), eq(models.removed, 0)];
    if (excludeId && excludeProviderId) {
      conditions.push(ne(models.id, excludeId));
    }
    const row = this.db
      .select({ id: models.id })
      .from(models)
      .where(and(...conditions))
      .get();
    return row !== undefined;
  }
}
