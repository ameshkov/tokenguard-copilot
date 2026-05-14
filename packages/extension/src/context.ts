import type { Database } from './db/connection.js';
import type * as vscode from 'vscode';
import { ProviderRepository } from './repositories/index.js';
import { ProviderManager, type ResetCallback } from './services/provider-manager/index.js';

/**
 * Dependencies required to create an
 * {@link ExtensionContext}.
 */
export interface ExtensionContextDeps {
  /** Drizzle ORM database instance. */
  db: Database;
  /** VS Code SecretStorage for API keys. */
  secrets: vscode.SecretStorage;
  /** Callback that clears all data from DB and secrets. */
  resetCallback: ResetCallback;
}

/**
 * Application context containing all shared services and
 * dependencies.
 *
 * Created once during `activate()` and passed to commands,
 * webview handlers, and other extension components.
 *
 * Wires repositories internally and exposes only services
 * to consumers.
 */
export class ExtensionContext {
  /** Drizzle ORM database instance. */
  readonly db: Database;

  /** Provider management service. */
  readonly providerManager: ProviderManager;

  /**
   * Creates a new ExtensionContext.
   *
   * @param deps - Infrastructure dependencies.
   */
  constructor(deps: ExtensionContextDeps) {
    this.db = deps.db;
    const providerRepo = new ProviderRepository(deps.db);
    this.providerManager = new ProviderManager(providerRepo, deps.secrets, deps.resetCallback);
  }
}
