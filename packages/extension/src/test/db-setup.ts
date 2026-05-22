import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDb, type Database } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';

const MIGRATIONS_DIR = resolve(__dirname, '..', 'db', 'migrations');

/**
 * Creates a fresh in-memory SQLite database with all
 * migrations applied.
 *
 * Use this in tests to get a real database instance without
 * touching the file system. Each call returns an independent
 * database.
 *
 * @returns Object with the Drizzle `db` instance and the raw
 *   `DatabaseSync` connection (for cleanup via `raw.close()`).
 */
export function createTestDb(): {
  db: Database;
  raw: DatabaseSync;
} {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');

  const db = createDb(raw);
  runMigrations(db, MIGRATIONS_DIR);

  return { db, raw };
}

/**
 * Deletes all rows from all tables in the test database.
 *
 * Call this in `beforeEach` to ensure test isolation.
 *
 * @param raw - The raw DatabaseSync connection.
 */
export function clearTestDb(raw: DatabaseSync): void {
  raw.exec('DELETE FROM session_mappings');
  raw.exec('DELETE FROM settings');
  raw.exec('DELETE FROM usage_records');
  raw.exec('DELETE FROM models');
  raw.exec('DELETE FROM providers');
}
