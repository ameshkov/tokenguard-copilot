import { describe, it, expect, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import type * as vscode from 'vscode';
import { createTestDb } from './test/db-setup.js';
import { createMockLogger } from './test/mock-logger.js';
import { ExtensionContext, type ExtensionContextDeps } from './context.js';
import { ProviderManager } from './services/provider-manager/index.js';
import { ModelRegistry } from './services/model-registry/index.js';
import { ChatDebugSettingsService } from './services/chat-debug-settings/index.js';
import { SessionTracker } from './services/session-tracker/index.js';
import { ChatDebugLogger } from './services/chat-debug-logger/index.js';
import { ChatDebugCleanupService } from './services/chat-debug-cleanup/index.js';
import { ReasoningCacheCleanupService } from './services/reasoning-cache-cleanup/index.js';
import { UsageTracker } from './services/usage-tracker/index.js';
import { ContentRulesService } from './services/content-rules/index.js';
import type { Database } from './db/index.js';

vi.mock('vscode', () => {
  return {
    EventEmitter: class {
      event = () => ({ dispose: () => {} });
      fire() {}
      dispose() {}
    },
  };
});

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
    return {
      db,
      secrets: {
        store: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      } as unknown as vscode.SecretStorage,
      resetCallback: vi.fn().mockResolvedValue(undefined),
      logsBasePath: tmpdir(),
      extensionPath: tmpdir(),
      logger: createMockLogger(),
    };
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

  it('exposes providerManager', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.providerManager).toBeDefined();
    expect(ctx.providerManager).toBeInstanceOf(ProviderManager);
  });

  it('exposes modelRegistry', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.modelRegistry).toBeDefined();
    expect(ctx.modelRegistry).toBeInstanceOf(ModelRegistry);
  });

  it('exposes chatDebugSettings', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.chatDebugSettings).toBeDefined();
    expect(ctx.chatDebugSettings).toBeInstanceOf(ChatDebugSettingsService);
  });

  it('exposes sessionTracker', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.sessionTracker).toBeDefined();
    expect(ctx.sessionTracker).toBeInstanceOf(SessionTracker);
  });

  it('exposes chatDebugLogger', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.chatDebugLogger).toBeDefined();
    expect(ctx.chatDebugLogger).toBeInstanceOf(ChatDebugLogger);
  });

  it('exposes chatDebugCleanup', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.chatDebugCleanup).toBeDefined();
    expect(ctx.chatDebugCleanup).toBeInstanceOf(ChatDebugCleanupService);
  });

  it('exposes reasoningCacheCleanup', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.reasoningCacheCleanup).toBeDefined();
    expect(ctx.reasoningCacheCleanup).toBeInstanceOf(ReasoningCacheCleanupService);
  });

  it('exposes usageTracker', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.usageTracker).toBeDefined();
    expect(ctx.usageTracker).toBeInstanceOf(UsageTracker);
  });

  it('exposes logger', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.logger).toBeDefined();
    expect(ctx.logger).toBe(deps.logger);
  });

  it('dispose disposes modelRegistry', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    vi.spyOn(ctx.modelRegistry, 'disposeAll');

    ctx.dispose();

    expect(ctx.modelRegistry.disposeAll).toHaveBeenCalled();
  });

  it('dispose disposes providerManager', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    vi.spyOn(ctx.providerManager, 'dispose');

    ctx.dispose();

    expect(ctx.providerManager.dispose).toHaveBeenCalled();
  });

  it('dispose disposes usageTracker', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    vi.spyOn(ctx.usageTracker, 'dispose');

    ctx.dispose();

    expect(ctx.usageTracker.dispose).toHaveBeenCalled();
  });

  it('exposes contentRules', () => {
    const deps = setup();
    const ctx = new ExtensionContext(deps);
    expect(ctx.contentRules).toBeDefined();
    expect(ctx.contentRules).toBeInstanceOf(ContentRulesService);
  });
});
