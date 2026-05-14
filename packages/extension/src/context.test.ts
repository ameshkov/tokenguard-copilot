import { describe, it, expect, afterEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type * as vscode from 'vscode';
import { createTestDb } from './test/db-setup.js';
import { ExtensionContext, type ExtensionContextDeps } from './context.js';
import { ProviderManager } from './services/provider-manager/index.js';
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
});
