import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as vscode from 'vscode';
import { registerCommands } from './commands/index.js';
import { ExtensionContext } from './context.js';
import { createDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { createStatusBarItem } from './ui/status-bar/status-bar.js';

let rawDb: DatabaseSync | null = null;

export function activate(context: vscode.ExtensionContext) {
  const dbPath = `${context.globalStorageUri.fsPath}/tokenguard-copilot.db`;

  try {
    mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    rawDb = new DatabaseSync(dbPath);
    rawDb.exec('PRAGMA journal_mode = WAL');
    rawDb.exec('PRAGMA foreign_keys = ON');

    const db = createDb(rawDb);
    const migrationsFolder = path.join(__dirname, 'db', 'migrations');
    runMigrations(db, migrationsFolder);

    // Future issues will use the context for commands/handlers
    new ExtensionContext({ db });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `TokenGuard Copilot: database initialization failed — ${message}`,
    );
    return;
  }

  registerCommands(context);

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
