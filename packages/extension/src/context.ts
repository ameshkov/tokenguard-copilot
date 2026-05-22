import type { Database } from './db/connection.js';
import type * as vscode from 'vscode';
import { ProviderRepository } from './repositories/index.js';
import { ModelRepository } from './repositories/index.js';
import { SettingsRepository } from './repositories/index.js';
import { SessionMappingRepository } from './repositories/index.js';
import { ChatDebugSettingsService } from './services/chat-debug-settings/index.js';
import { SessionTracker } from './services/session-tracker/index.js';
import { ChatDebugLogger } from './services/chat-debug-logger/index.js';
import { ChatDebugCleanupService } from './services/chat-debug-cleanup/index.js';
import { ProviderManager, type ResetCallback } from './services/provider-manager/index.js';
import { ModelRegistry } from './services/model-registry/index.js';
import { getDefaults } from './services/model-defaults/index.js';

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
  /** Base path for chat debug log files. */
  logsBasePath: string;
  /** Optional callback to refresh the chat debug tree view. */
  onTreeRefresh?: () => void;
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

  /** Model registry service. */
  readonly modelRegistry: ModelRegistry;

  /** Chat debug settings service. */
  readonly chatDebugSettings: ChatDebugSettingsService;

  /** Session tracker service. */
  readonly sessionTracker: SessionTracker;

  /** Chat debug logger service. */
  readonly chatDebugLogger: ChatDebugLogger;

  /** Chat debug cleanup service. */
  readonly chatDebugCleanup: ChatDebugCleanupService;

  /**
   * Creates a new ExtensionContext.
   *
   * @param deps - Infrastructure dependencies.
   */
  constructor(deps: ExtensionContextDeps) {
    this.db = deps.db;
    const providerRepo = new ProviderRepository(deps.db);
    const modelRepo = new ModelRepository(deps.db);
    const settingsRepo = new SettingsRepository(deps.db);
    const sessionMappingRepo = new SessionMappingRepository(deps.db);
    this.chatDebugSettings = new ChatDebugSettingsService(settingsRepo);
    this.sessionTracker = new SessionTracker(sessionMappingRepo);
    this.chatDebugLogger = new ChatDebugLogger(
      this.chatDebugSettings,
      this.sessionTracker,
      deps.logsBasePath,
      deps.onTreeRefresh,
    );
    this.chatDebugCleanup = new ChatDebugCleanupService(
      deps.logsBasePath,
      this.chatDebugSettings,
      sessionMappingRepo,
      deps.onTreeRefresh,
    );
    this.modelRegistry = new ModelRegistry(
      modelRepo,
      providerRepo,
      deps.secrets,
      getDefaults,
      this.chatDebugLogger,
    );
    this.providerManager = new ProviderManager(
      providerRepo,
      deps.secrets,
      deps.resetCallback,
      this.modelRegistry,
    );
  }
}
