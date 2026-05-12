import type { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import * as schema from './schema.js';

/**
 * Creates a Drizzle ORM database instance from a
 * `node:sqlite` DatabaseSync connection.
 *
 * @param raw - The raw SQLite database connection.
 * @returns Drizzle database instance with schema.
 */
export function createDb(raw: DatabaseSync) {
  return drizzle({ client: raw, schema });
}

/**
 * Drizzle ORM database instance type with schema.
 */
export type Database = ReturnType<typeof createDb>;
