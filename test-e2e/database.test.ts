/// <reference types="mocha" />

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getExtension } from './helpers.js';

/** The database file name created by the extension. */
const DB_FILENAME = 'tokenguard-copilot.db';

/**
 * Derives the global storage path for the extension in
 * the VS Code test environment.
 *
 * The test runner stores user data under
 * `{project}/.vscode-test/user-data/`. Global storage
 * lives at `User/globalStorage/{extensionId}` within
 * that directory.
 *
 * @param extensionId - The extension identifier.
 * @returns Absolute path to the extension's global
 *   storage directory.
 */
function getGlobalStoragePath(extensionId: string): string {
  // At runtime __dirname is out/test-e2e. Go up two levels
  // to reach the project root where .vscode-test lives.
  const projectRoot = path.resolve(__dirname, '..', '..');
  return path.join(projectRoot, '.vscode-test', 'user-data', 'User', 'globalStorage', extensionId);
}

suite('Database Lifecycle', () => {
  suiteSetup(async () => {
    await getExtension();
  });

  test('database file exists after activation', async () => {
    const extension = await getExtension();
    const storagePath = getGlobalStoragePath(extension.id);
    const dbPath = path.join(storagePath, DB_FILENAME);

    assert.ok(fs.existsSync(dbPath), `Database file should exist at ${dbPath}`);

    const stat = fs.statSync(dbPath);
    assert.ok(stat.size > 0, 'Database file should not be empty');
  });

  test('database has expected tables after migration', async () => {
    const extension = await getExtension();
    const storagePath = getGlobalStoragePath(extension.id);
    const dbPath = path.join(storagePath, DB_FILENAME);

    // Use Node.js built-in SQLite to inspect the schema.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { open: true });

    try {
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = rows.map((r) => r.name);

      // Core tables created by the extension's migrations.
      const expectedTables = ['models', 'providers', 'settings', 'usage_records'];

      for (const table of expectedTables) {
        assert.ok(tableNames.includes(table), `Table "${table}" should exist in the database`);
      }
    } finally {
      db.close();
    }
  });
});
