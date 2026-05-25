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
      executeCommand: vi.fn(),
    },
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      registerTreeDataProvider: vi.fn(() => disposable),
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

const mockTreeViewProvider = vi.hoisted(() => ({
  refresh: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./ui/tree-views/index.js', () => ({
  ChatDebugTreeViewProvider: vi.fn(function () {
    return mockTreeViewProvider;
  }),
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
    return {
      providerManager: {},
      modelRegistry: {
        registerAll: vi.fn(),
        disposeAll: vi.fn(),
      },
      tokenCounter: {
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      chatDebugSettings: {
        getSettings: vi.fn().mockReturnValue({
          enabled: false,
          ttlHours: 24,
        }),
        updateSettings: vi.fn().mockReturnValue({
          enabled: false,
          ttlHours: 24,
        }),
      },
      chatDebugCleanup: {
        startPeriodicCleanup: vi.fn(() => ({ dispose: vi.fn() })),
        clearAll: vi.fn(),
      },
      reasoningCacheCleanup: {
        startPeriodicCleanup: vi.fn(() => ({ dispose: vi.fn() })),
      },
    };
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

  it('should call registerCommands', async () => {
    await activate(context);

    expect(mockRegisterCommands).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ providerManager: expect.anything() }),
    );
  });

  it('should push disposables to subscriptions', async () => {
    await activate(context);

    // registerCommands is mocked, so:
    // tree data provider + tree view dispose + chat debug cleanup + reasoning cache cleanup + enable + disable + refresh + clear + status bar = 9
    expect(context.subscriptions).toHaveLength(9);
  });

  it('should create a status bar item', async () => {
    const { createStatusBarItem } = await import('./ui/status-bar/status-bar.js');
    await activate(context);

    expect(createStatusBarItem).toHaveBeenCalled();
  });

  it('should create a DatabaseSync with the correct path', async () => {
    await activate(context);

    expect(DatabaseSync).toHaveBeenCalledWith('/mock/storage/tokenguard-copilot.db');
  });

  it('should run migrations with the correct folder', async () => {
    await activate(context);

    expect(runMigrations).toHaveBeenCalledWith(mockDb, expect.stringContaining('db'));
  });

  it('should create an ExtensionContext', async () => {
    await activate(context);

    expect(ExtensionContext).toHaveBeenCalledWith({
      db: mockDb,
      secrets: context.secrets,
      logsBasePath: expect.stringContaining('logs'),
      resetCallback: expect.any(Function),
      onTreeRefresh: expect.any(Function),
    });
  });

  it('should call modelRegistry.registerAll on activation', async () => {
    await activate(context);

    const ctxInstance = vi.mocked(ExtensionContext).mock.results[0].value;
    expect(ctxInstance.modelRegistry.registerAll).toHaveBeenCalled();
  });

  it('should show error and return early if DB init fails', async () => {
    vi.mocked(DatabaseSync).mockImplementationOnce(function () {
      throw new Error('migration failed');
    });

    await activate(context);

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

  it('should close the raw database connection', async () => {
    await activate(context);
    deactivate();

    expect(mockClose).toHaveBeenCalled();
  });

  it('should call modelRegistry.disposeAll on deactivation', async () => {
    await activate(context);
    const ctxInstance = vi.mocked(ExtensionContext).mock.results[0].value;
    deactivate();

    expect(ctxInstance.modelRegistry.disposeAll).toHaveBeenCalled();
  });

  it('should not throw if close fails', async () => {
    await activate(context);
    mockClose.mockImplementationOnce(() => {
      throw new Error('already closed');
    });

    expect(() => deactivate()).not.toThrow();
  });

  it('should not throw if called without activate', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
