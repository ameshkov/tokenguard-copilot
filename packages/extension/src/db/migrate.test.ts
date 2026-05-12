import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createDb } from './connection.js';
import { runMigrations } from './migrate.js';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

describe('runMigrations', () => {
  it('should create all tables after running migrations', () => {
    const raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    const db = createDb(raw);

    runMigrations(db, MIGRATIONS_DIR);

    const tables = raw
      .prepare(
        'SELECT name FROM sqlite_master ' +
          "WHERE type='table' " +
          "AND name NOT LIKE 'sqlite_%' " +
          "AND name NOT LIKE '__drizzle%' " +
          'ORDER BY name',
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t: { name: string }) => t.name);
    expect(tableNames).toContain('providers');
    expect(tableNames).toContain('models');
    expect(tableNames).toContain('usage_records');

    raw.close();
  });

  it('should be idempotent (running twice does not throw)', () => {
    const raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    const db = createDb(raw);

    runMigrations(db, MIGRATIONS_DIR);
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow();

    raw.close();
  });
});
