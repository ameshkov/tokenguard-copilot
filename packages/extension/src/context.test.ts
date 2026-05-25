import { describe, it, expect, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import type * as vscode from 'vscode';
import { createTestDb } from './test/db-setup.js';
import { ExtensionContext, type ExtensionContextDeps } from './context.js';
import { ProviderManager } from './services/provider-manager/index.js';
import { ModelRegistry } from './services/model-registry/index.js';
import { ChatDebugSettingsService } from './services/chat-debug-settings/index.js';
import { SessionTracker } from './services/session-tracker/index.js';
import { ChatDebugLogger } from './services/chat-debug-logger/index.js';
import { ChatDebugCleanupService } from './services/chat-debug-cleanup/index.js';
import type { Database } from './db/connection.js';

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
});
