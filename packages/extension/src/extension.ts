import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as vscode from 'vscode';
import { registerCommands } from './commands/index.js';
import { ExtensionContext } from './context.js';
import { createDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { providers, models, usageRecords } from './db/schema.js';
import { createStatusBarItem } from './ui/status-bar/status-bar.js';

let rawDb: DatabaseSync | null = null;

export function activate(context: vscode.ExtensionContext) {
  const dbPath = `${context.globalStorageUri.fsPath}/tokenguard-copilot.db`;

  let extCtx: ExtensionContext;

  try {
    mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    rawDb = new DatabaseSync(dbPath);
    rawDb.exec('PRAGMA journal_mode = WAL');
    rawDb.exec('PRAGMA foreign_keys = ON');

    const db = createDb(rawDb);
    const migrationsFolder = path.join(__dirname, 'db', 'migrations');
    runMigrations(db, migrationsFolder);

    extCtx = new ExtensionContext({
      db,
      secrets: context.secrets,
      resetCallback: async () => {
        // Read all provider IDs before deleting
        const allProviders = db.select({ id: providers.id }).from(providers).all();

        // Delete in FK order
        db.delete(usageRecords).run();
        db.delete(models).run();
        db.delete(providers).run();

        // Delete all provider secrets
        for (const p of allProviders) {
          await context.secrets.delete(`tokenguard-copilot.provider.${p.id}`);
        }
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `TokenGuard Copilot: database initialization failed — ${message}`,
    );
    return;
  }

  registerCommands(context, extCtx);

  context.subscriptions.push(createStatusBarItem());
}

export function deactivate() {
  try {
    rawDb?.close();
  } catch {
    // DB may not have been initialized (degraded state)
  }
  rawDb = null;
}
