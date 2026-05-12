import { describe, it, expect, afterEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './test/db-setup.js';
import { ExtensionContext, type ExtensionContextDeps } from './context.js';
import type { Database } from './db/connection.js';

describe('ExtensionContext', () => {
  let raw: DatabaseSync;
  let db: Database;

  afterEach(() => {
    raw?.close();
  });

  function setup(): ExtensionContextDeps {
    const testDb = createTestDb();
    raw = testDb.raw;
    db = testDb.db;
    return { db };
  }

  it('should create an ExtensionContext instance', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx).toBeInstanceOf(ExtensionContext);
  });

  it('should expose the database instance', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.db).toBe(db);
  });
});
