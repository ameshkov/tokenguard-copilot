import { eq, asc, and, ne } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { contentRules, type ContentRule, type NewContentRule } from '../db/index.js';

/**
 * Data-access layer for the `content_rules` table.
 *
 * Encapsulates all Drizzle queries for content rule rows.
 * No caching or business logic — pure data access.
 *
 * matchToolPresent and matchToolAbsent are stored as
 * JSON-serialized string arrays. Callers work with the
 * serialized form directly; serialization and
 * deserialization are handled at the service layer.
 */
export class ContentRulesRepository {
  /**
   * Creates a new ContentRulesRepository.
   *
   * @param db - Drizzle database instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Returns all content rules ordered by sortOrder ascending.
   *
   * @returns Array of all content rule rows.
   */
  findAll(): ContentRule[] {
    return this.db.select().from(contentRules).orderBy(asc(contentRules.sortOrder)).all();
  }

  /**
   * Finds a content rule by ID.
   *
   * @param id - The rule ID.
   * @returns The content rule row or undefined.
   */
  findById(id: string): ContentRule | undefined {
    return this.db.select().from(contentRules).where(eq(contentRules.id, id)).get();
  }

  /**
   * Inserts a new content rule and returns it.
   *
   * @param rule - The content rule data to insert.
   * @returns The inserted content rule row.
   */
  insert(rule: NewContentRule): ContentRule {
    return this.db.insert(contentRules).values(rule).returning().get();
  }

  /**
   * Updates mutable fields of a content rule.
   *
   * `updatedAt` is automatically refreshed to the current
   * time.
   *
   * @param id - The rule ID.
   * @param changes - Fields to update (partial NewContentRule).
   * @returns The updated content rule row, or undefined if not
   *   found.
   */
  update(id: string, changes: Partial<NewContentRule>): ContentRule | undefined {
    return this.db
      .update(contentRules)
      .set({
        ...changes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(contentRules.id, id))
      .returning()
      .get();
  }

  /**
   * Deletes a content rule by ID.
   *
   * @param id - The rule ID.
   * @returns True if a row was deleted, false if not found.
   */
  delete(id: string): boolean {
    const result = this.db.delete(contentRules).where(eq(contentRules.id, id)).run();
    return result.changes > 0;
  }

  /**
   * Reorders content rules by assigning new sortOrder values
   * based on the provided ordered ID list.
   *
   * Runs inside a transaction. Throws if any ID in the list
   * does not correspond to an existing rule.
   *
   * @param orderedIds - Rule IDs in the desired order.
   */
  reorder(orderedIds: string[]): void {
    this.db.transaction(() => {
      for (let i = 0; i < orderedIds.length; i++) {
        const result = this.db
          .update(contentRules)
          .set({ sortOrder: i })
          .where(eq(contentRules.id, orderedIds[i]))
          .run();
        if (result.changes === 0) {
          throw new Error(`Content rule with id "${orderedIds[i]}" not found`);
        }
      }
    });
  }

  /**
   * Checks whether a content rule with the given name exists.
   *
   * @param name - The name to check.
   * @param excludeId - Optional ID to exclude from the check
   *   (for update scenarios).
   * @returns True if a rule with the name exists.
   */
  nameExists(name: string, excludeId?: string): boolean {
    const conditions = [eq(contentRules.name, name)];
    if (excludeId) {
      conditions.push(ne(contentRules.id, excludeId));
    }
    const row = this.db
      .select({ id: contentRules.id })
      .from(contentRules)
      .where(and(...conditions))
      .get();
    return row !== undefined;
  }
}
