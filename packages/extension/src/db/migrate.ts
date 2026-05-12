import path from 'node:path';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import type { Database } from './connection.js';

/**
 * Runs all pending database migrations from the specified
 * migrations folder.
 *
 * @param db - The Drizzle database instance to migrate.
 * @param migrationsFolder - Absolute path to the migrations
 *   directory. Defaults to `db/migrations` relative to
 *   `__dirname` (correct for the esbuild bundle output).
 * @throws Error if a migration fails.
 */
export function runMigrations(db: Database, migrationsFolder?: string): void {
  const folder = migrationsFolder ?? path.join(__dirname, 'db', 'migrations');
  migrate(db, { migrationsFolder: folder });
}
