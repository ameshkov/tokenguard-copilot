import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type ExtensionContext as VSCodeExtensionContext, commands, window } from 'vscode';
import { registerCommands } from './commands/index.js';
import { ExtensionContext } from './context.js';
import { createLogger, type Logger } from './logger/index.js';
import {
  createDb,
  runMigrations,
  providers,
  models,
  usageRecords,
  settings,
  sessionMappings,
  reasoningCache,
} from './db/index.js';
import { createStatusBarItem } from './ui/status-bar/index.js';
import { ChatDebugTreeViewProvider } from './ui/tree-views/index.js';

/**
 * Public API surface exposed to other extensions and E2E
 * tests via `extension.exports`.
 */
export interface ExtensionApi {
  /** Provider CRUD operations. */
  readonly providerManager: ExtensionContext['providerManager'];
  /** Model lifecycle and registration. */
  readonly modelRegistry: ExtensionContext['modelRegistry'];
}

let rawDb: DatabaseSync | null = null;
let extCtx: ExtensionContext | null = null;
let logger: Logger | null = null;

export async function activate(context: VSCodeExtensionContext): Promise<ExtensionApi | undefined> {
  const { logger: log, channel } = createLogger();
  logger = log;
  context.subscriptions.push(channel);

  log.info('Activating extension');

  const dbPath = `${context.globalStorageUri.fsPath}/tokenguard-copilot.db`;

  let localCtx: ExtensionContext;
  let treeViewProvider: ChatDebugTreeViewProvider;

  try {
    mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    rawDb = new DatabaseSync(dbPath);
    rawDb.exec('PRAGMA journal_mode = WAL');
    rawDb.exec('PRAGMA foreign_keys = ON');
    rawDb.exec('PRAGMA busy_timeout = 5000');

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
      logger: log,
      version: context.extension.packageJSON.version as string,
      onTreeRefresh,
      resetCallback: async () => {
        // Read all provider IDs before deleting
        const allProviders = db.select({ id: providers.id }).from(providers).all();

        // Delete in FK order
        db.delete(usageRecords).run();
        db.delete(models).run();
        db.delete(providers).run();

        // Delete remaining tables (no FK dependencies)
        db.delete(settings).run();
        db.delete(sessionMappings).run();
        db.delete(reasoningCache).run();

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
    log.error('Database initialization failed', message);
    window.showErrorMessage(`TokenGuard Copilot: database initialization failed — ${message}`);
    return;
  }

  localCtx.modelRegistry.registerAll();
  registerCommands(context, localCtx, treeViewProvider, logger);

  // Set context key so the tree view is visible only when logging is enabled.
  const initialEnabled = localCtx.chatDebugSettings.getSettings().enabled;
  void commands.executeCommand('setContext', 'tokenguard-copilot.chatDebugEnabled', initialEnabled);

  context.subscriptions.push(
    window.registerTreeDataProvider('tokenguardCopilotChatDebugLogs', treeViewProvider),
  );
  context.subscriptions.push(treeViewProvider);

  context.subscriptions.push(localCtx.chatDebugCleanup.startPeriodicCleanup());
  context.subscriptions.push(localCtx.reasoningCacheCleanup.startPeriodicCleanup());

  context.subscriptions.push(createStatusBarItem(localCtx.providerManager, localCtx.usageTracker));

  log.info('Extension activated');

  return {
    providerManager: localCtx.providerManager,
    modelRegistry: localCtx.modelRegistry,
  } satisfies ExtensionApi;
}

export function deactivate() {
  logger?.info('Deactivating extension');

  try {
    extCtx?.dispose();
  } catch (error: unknown) {
    logger?.warn(
      'Failed to dispose extension context',
      error instanceof Error ? error.message : String(error),
    );
  }
  extCtx = null;

  try {
    rawDb?.close();
  } catch (error: unknown) {
    logger?.warn(
      'Failed to close database',
      error instanceof Error ? error.message : String(error),
    );
  }
  rawDb = null;
  logger = null;
}
