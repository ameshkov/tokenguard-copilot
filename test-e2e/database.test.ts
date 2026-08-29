/// <reference types="mocha" />

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Extension } from 'vscode';
import { getExtension } from './helpers.js';

/** The database file name created by the extension. */
const DB_FILENAME = 'tokenguard-copilot.db';

/**
 * Resolves the extension's global storage directory from the
 * activated extension's exports.
 *
 * The extension derives its database path from `globalStorageUri`,
 * which follows the `--user-data-dir` VS Code runs with (the test
 * runner may move it, e.g. under the OS temp directory when the
 * workspace path exceeds macOS' limit for IPC socket paths).
 * Reading the path from the exports keeps this test independent of
 * the runner's user-data layout.
 *
 * @param extension - The activated extension instance.
 * @returns Absolute path to the extension's global storage
 *   directory.
 */
function getGlobalStoragePath(extension: Extension<unknown>): string {
  const storagePath = (extension.exports as { globalStoragePath?: string } | undefined)
    ?.globalStoragePath;
  assert.ok(storagePath, 'Extension should export globalStoragePath');
  return storagePath;
}

suite('Database Lifecycle', () => {
  suiteSetup(async () => {
    await getExtension();
  });

  test('database file exists after activation', async () => {
    const extension = await getExtension();
    const dbPath = path.join(getGlobalStoragePath(extension), DB_FILENAME);

    assert.ok(fs.existsSync(dbPath), `Database file should exist at ${dbPath}`);

    const stat = fs.statSync(dbPath);
    assert.ok(stat.size > 0, 'Database file should not be empty');
  });

  test('database has expected tables after migration', async () => {
    const extension = await getExtension();
    const dbPath = path.join(getGlobalStoragePath(extension), DB_FILENAME);

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
