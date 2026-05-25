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
import { ChatDebugTreeViewProvider } from './ui/tree-views/index.js';

let rawDb: DatabaseSync | null = null;
let extCtx: ExtensionContext | null = null;

export async function activate(context: vscode.ExtensionContext) {
  const dbPath = `${context.globalStorageUri.fsPath}/tokenguard-copilot.db`;

  let localCtx: ExtensionContext;
  let treeViewProvider: ChatDebugTreeViewProvider;

  try {
    mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    rawDb = new DatabaseSync(dbPath);
    rawDb.exec('PRAGMA journal_mode = WAL');
    rawDb.exec('PRAGMA foreign_keys = ON');

    const db = createDb(rawDb);
    const migrationsFolder = path.join(__dirname, 'db', 'migrations');
    runMigrations(db, migrationsFolder);

    const logsBasePath = path.join(context.globalStorageUri.fsPath, 'logs');

    treeViewProvider = new ChatDebugTreeViewProvider(context.globalStorageUri);
    const onTreeRefresh = (): void => treeViewProvider.refresh();

    localCtx = new ExtensionContext({
      db,
      secrets: context.secrets,
      logsBasePath,
      extensionPath: context.extensionPath,
      onTreeRefresh,
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
    extCtx = localCtx;

    // Initialize tokenizer for token counting
    await localCtx.tokenCounter.initialize();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `TokenGuard Copilot: database initialization failed — ${message}`,
    );
    return;
  }

  localCtx.modelRegistry.registerAll();
  registerCommands(context, localCtx);

  // Set context key so the tree view is visible only when logging is enabled.
  const initialEnabled = localCtx.chatDebugSettings.getSettings().enabled;
  void vscode.commands.executeCommand(
    'setContext',
    'tokenguard-copilot.chatDebugEnabled',
    initialEnabled,
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('tokenguardCopilotChatDebugLogs', treeViewProvider),
  );
  context.subscriptions.push(treeViewProvider);

  context.subscriptions.push(localCtx.chatDebugCleanup.startPeriodicCleanup());
  context.subscriptions.push(localCtx.reasoningCacheCleanup.startPeriodicCleanup());

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.enableChatDebugLogging', async () => {
      const answer = await vscode.window.showInformationMessage(
        'Enable chat debug logging? This will record request and response data for debugging.',
        { modal: true },
        'Enable',
      );
      if (answer === 'Enable') {
        localCtx.chatDebugSettings.updateSettings({ enabled: true });
        void vscode.commands.executeCommand(
          'setContext',
          'tokenguard-copilot.chatDebugEnabled',
          true,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.disableChatDebugLogging', () => {
      localCtx.chatDebugSettings.updateSettings({ enabled: false });
      void vscode.commands.executeCommand(
        'setContext',
        'tokenguard-copilot.chatDebugEnabled',
        false,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.refreshChatDebugLogs', () => {
      treeViewProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.clearChatDebugLogs', async () => {
      const answer = await vscode.window.showWarningMessage(
        'This will permanently delete all debug logs. This action cannot be undone.',
        { modal: true },
        'Clear Logs',
      );
      if (answer === 'Clear Logs') {
        localCtx.chatDebugCleanup.clearAll();
      }
    }),
  );

  context.subscriptions.push(createStatusBarItem());
}

export function deactivate() {
  try {
    extCtx?.modelRegistry.disposeAll();
  } catch {
    // Models may not have been registered
  }
  extCtx = null;
  try {
    rawDb?.close();
  } catch {
    // DB may not have been initialized (degraded state)
  }
  rawDb = null;
}
