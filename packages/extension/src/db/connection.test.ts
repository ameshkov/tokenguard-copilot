import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createDb, type Database } from './connection.js';

describe('createDb', () => {
  it('should create a Drizzle database instance from a DatabaseSync connection', () => {
    const raw = new DatabaseSync(':memory:');
    const db: Database = createDb(raw);
    expect(db).toBeDefined();
    raw.close();
  });
});
