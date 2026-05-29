import type { Database } from './db/index.js';
import type * as vscode from 'vscode';
import type { Logger } from './logger/index.js';
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
import { TokenCounter } from './services/token-counter/index.js';
import { ReasoningCacheRepository } from './repositories/index.js';
import { ReasoningCacheService } from './services/reasoning-cache/index.js';
import { ReasoningCacheCleanupService } from './services/reasoning-cache-cleanup/index.js';
import { UsageRecordRepository } from './repositories/index.js';
import { UsageTracker } from './services/usage-tracker/index.js';

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
  /** Absolute path to the extension directory for loading assets. */
  extensionPath: string;
  /** Logger instance for runtime diagnostics. */
  logger: Logger;
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

  /** Token counting service. */
  readonly tokenCounter: TokenCounter;

  /** Reasoning cache cleanup service. */
  readonly reasoningCacheCleanup: ReasoningCacheCleanupService;

  /** Usage tracker service. */
  readonly usageTracker: UsageTracker;

  /** Logger for runtime diagnostics. */
  readonly logger: Logger;

  /**
   * Creates a new ExtensionContext.
   *
   * @param deps - Infrastructure dependencies.
   */
  constructor(deps: ExtensionContextDeps) {
    this.logger = deps.logger;
    this.db = deps.db;
    const providerRepo = new ProviderRepository(deps.db);
    const modelRepo = new ModelRepository(deps.db);
    const settingsRepo = new SettingsRepository(deps.db);
    const sessionMappingRepo = new SessionMappingRepository(deps.db);
    const reasoningCacheRepo = new ReasoningCacheRepository(deps.db);
    const reasoningCacheService = new ReasoningCacheService(reasoningCacheRepo, deps.logger);

    this.chatDebugSettings = new ChatDebugSettingsService(settingsRepo, deps.logger);
    this.sessionTracker = new SessionTracker(sessionMappingRepo, deps.logger);
    this.chatDebugLogger = new ChatDebugLogger(
      this.chatDebugSettings,
      this.sessionTracker,
      deps.logsBasePath,
      deps.logger,
      deps.onTreeRefresh,
    );
    this.chatDebugCleanup = new ChatDebugCleanupService(
      deps.logsBasePath,
      this.chatDebugSettings,
      sessionMappingRepo,
      deps.logger,
      deps.onTreeRefresh,
    );
    this.tokenCounter = new TokenCounter(deps.extensionPath, deps.logger);
    const usageRecordRepo = new UsageRecordRepository(deps.db);
    this.usageTracker = new UsageTracker(usageRecordRepo, modelRepo, deps.logger);
    this.modelRegistry = new ModelRegistry(
      modelRepo,
      providerRepo,
      deps.secrets,
      this.chatDebugLogger,
      this.tokenCounter,
      reasoningCacheService,
      this.usageTracker,
      deps.logger,
    );
    this.providerManager = new ProviderManager(
      providerRepo,
      deps.secrets,
      deps.resetCallback,
      this.modelRegistry,
      deps.logger,
    );
    this.reasoningCacheCleanup = new ReasoningCacheCleanupService(reasoningCacheRepo, deps.logger);
  }

  /**
   * Disposes all services that own resources.
   *
   * Called from `deactivate()` to cleanly tear down event
   * emitters and other disposables in extension services.
   */
  dispose(): void {
    this.modelRegistry.disposeAll();
    this.providerManager.dispose();
    this.usageTracker.dispose();
  }
}
