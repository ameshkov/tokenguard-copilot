import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from './db/connection.js';

const { mockClose, mockRaw, mockDb } = vi.hoisted(() => {
  const mockClose = vi.fn();
  const mockRaw = {
    exec: vi.fn(),
    close: mockClose,
  };
  const mockDb = {} as Database;
  return { mockClose, mockRaw, mockDb };
});

vi.mock('vscode', () => {
  const disposable = { dispose: vi.fn() };
  const subscriptions: unknown[] = [];

  return {
    commands: {
      registerCommand: vi.fn(() => disposable),
    },
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    ExtensionContext: vi.fn(),
    _mockDisposable: disposable,
    _mockSubscriptions: subscriptions,
  };
});

const mockRegisterCommands = vi.hoisted(() => vi.fn());
vi.mock('./commands/index.js', () => ({
  registerCommands: mockRegisterCommands,
}));

const mockStatusBarItem = vi.hoisted(() => ({ dispose: vi.fn() }));
vi.mock('./ui/status-bar/status-bar.js', () => ({
  createStatusBarItem: vi.fn(() => mockStatusBarItem),
}));

vi.mock('node:sqlite', () => ({
  DatabaseSync: vi.fn(function () {
    return mockRaw;
  }),
}));

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}));

vi.mock('./db/connection.js', () => ({
  createDb: vi.fn(() => mockDb),
}));

vi.mock('./db/migrate.js', () => ({
  runMigrations: vi.fn(),
}));

const mockExtensionContext = vi.hoisted(() =>
  vi.fn(function () {
    return { providerManager: {} };
  }),
);
vi.mock('./context.js', () => ({
  ExtensionContext: mockExtensionContext,
}));

import * as vscode from 'vscode';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './db/migrate.js';
import { ExtensionContext } from './context.js';
import { activate, deactivate } from './extension.js';

describe('activate', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      subscriptions: [],
      globalStorageUri: {
        fsPath: '/mock/storage',
      },
      secrets: {
        store: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
  });

  it('should call registerCommands', () => {
    activate(context);

    expect(mockRegisterCommands).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ providerManager: expect.anything() }),
    );
  });

  it('should push disposables to subscriptions', () => {
    activate(context);

    // registerCommands is mocked, so only status bar = 1
    expect(context.subscriptions).toHaveLength(1);
  });

  it('should create a status bar item', async () => {
    const { createStatusBarItem } = await import('./ui/status-bar/status-bar.js');
    activate(context);

    expect(createStatusBarItem).toHaveBeenCalled();
  });

  it('should create a DatabaseSync with the correct path', () => {
    activate(context);

    expect(DatabaseSync).toHaveBeenCalledWith('/mock/storage/tokenguard-copilot.db');
  });

  it('should run migrations with the correct folder', () => {
    activate(context);

    expect(runMigrations).toHaveBeenCalledWith(mockDb, expect.stringContaining('db'));
  });

  it('should create an ExtensionContext', () => {
    activate(context);

    expect(ExtensionContext).toHaveBeenCalledWith({
      db: mockDb,
      secrets: context.secrets,
      resetCallback: expect.any(Function),
    });
  });

  it('should show error and return early if DB init fails', () => {
    vi.mocked(DatabaseSync).mockImplementationOnce(function () {
      throw new Error('migration failed');
    });

    activate(context);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('migration failed'),
    );
    // No commands registered
    expect(mockRegisterCommands).not.toHaveBeenCalled();
  });
});

describe('deactivate', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      subscriptions: [],
      globalStorageUri: {
        fsPath: '/mock/storage',
      },
      secrets: {
        store: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;
  });

  it('should close the raw database connection', () => {
    activate(context);
    deactivate();

    expect(mockClose).toHaveBeenCalled();
  });

  it('should not throw if close fails', () => {
    activate(context);
    mockClose.mockImplementationOnce(() => {
      throw new Error('already closed');
    });

    expect(() => deactivate()).not.toThrow();
  });

  it('should not throw if called without activate', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
