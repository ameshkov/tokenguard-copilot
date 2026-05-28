import { eq, and, ne } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { providers, type Provider, type NewProvider } from '../db/index.js';

/**
 * Data-access layer for the `providers` table.
 *
 * Encapsulates all Drizzle queries for provider rows.
 * No caching or business logic — pure data access.
 */
export class ProviderRepository {
  /**
   * Creates a new ProviderRepository.
   *
   * @param db - Drizzle database instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Inserts a new provider row and returns it.
   *
   * @param provider - The provider data to insert.
   * @returns The inserted provider row.
   */
  insert(provider: NewProvider): Provider {
    return this.db.insert(providers).values(provider).returning().get();
  }

  /**
   * Returns all non-removed providers.
   *
   * @returns Array of active provider rows.
   */
  findActive(): Provider[] {
    return this.db.select().from(providers).where(eq(providers.removed, 0)).all();
  }

  /**
   * Returns all providers including removed.
   *
   * @returns Array of all provider rows.
   */
  findAll(): Provider[] {
    return this.db.select().from(providers).all();
  }

  /**
   * Finds a provider by ID.
   *
   * @param id - The provider ID.
   * @returns The provider row or undefined.
   */
  findById(id: string): Provider | undefined {
    return this.db.select().from(providers).where(eq(providers.id, id)).get();
  }

  /**
   * Checks whether a non-removed provider with the given name
   * exists.
   *
   * @param name - The provider name to check.
   * @param excludeId - Optional ID to exclude from the check
   *   (for update scenarios).
   * @returns True if a matching name exists.
   */
  existsByName(name: string, excludeId?: string): boolean {
    const conditions = [eq(providers.name, name), eq(providers.removed, 0)];
    if (excludeId) {
      conditions.push(ne(providers.id, excludeId));
    }
    const row = this.db
      .select({ id: providers.id })
      .from(providers)
      .where(and(...conditions))
      .get();
    return row !== undefined;
  }

  /**
   * Updates a provider's mutable fields.
   *
   * @param id - The provider ID.
   * @param fields - Fields to update (name and/or baseUrl).
   * @returns The updated provider row, or undefined if not found.
   */
  update(id: string, fields: { name?: string; baseUrl?: string }): Provider | undefined {
    return this.db
      .update(providers)
      .set({
        ...fields,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(providers.id, id))
      .returning()
      .get();
  }

  /**
   * Soft-removes a provider by setting `removed = 1` and appending
   * a deletion timestamp to the name to free the unique constraint.
   *
   * @param id - The provider ID.
   * @returns True if a row was updated, false if not found.
   */
  softRemove(id: string): boolean {
    const now = new Date();
    const existing = this.findById(id);
    if (!existing) {
      return false;
    }
    const readableDate = now.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const isoNow = now.toISOString();
    const result = this.db
      .update(providers)
      .set({
        name: `${existing.name} (deleted ${readableDate})`,
        removed: 1,
        updatedAt: isoNow,
      })
      .where(eq(providers.id, id))
      .returning()
      .get();
    return result !== undefined;
  }
}
