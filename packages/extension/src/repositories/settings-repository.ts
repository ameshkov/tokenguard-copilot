import { eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { settings } from '../db/schema.js';

/**
 * Data-access layer for the `settings` table.
 *
 * Provides generic key-value storage for extension
 * configuration. No caching or business logic — pure
 * data access.
 */
export class SettingsRepository {
  /**
   * Creates a new SettingsRepository.
   *
   * @param db - Drizzle database instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Retrieves a setting value by key.
   *
   * @param key - The setting key.
   * @returns The setting value, or null if not found.
   */
  get(key: string): string | null {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  }

  /**
   * Sets a setting value, inserting or updating as needed.
   *
   * @param key - The setting key.
   * @param value - The setting value.
   */
  set(key: string, value: string): void {
    this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value },
      })
      .run();
  }

  /**
   * Removes a setting by key.
   *
   * @param key - The setting key.
   * @returns True if a row was deleted, false if not found.
   */
  remove(key: string): boolean {
    const result = this.db.delete(settings).where(eq(settings.key, key)).returning().get();
    return result !== undefined;
  }
}
