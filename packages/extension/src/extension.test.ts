import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from './db/index.js';

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

const mockLogger = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./logger/index.js', () => ({
  createLogger: vi.fn(() => ({
    logger: mockLogger,
    channel: mockLogger,
  })),
}));

const mockExtensionContext = vi.hoisted(() =>
  vi.fn(function () {
    const modelRegistry = {
      registerAll: vi.fn(),
      disposeAll: vi.fn(),
    };
    const providerManager = {
      getProviders: vi.fn(),
      onProvidersChanged: vi.fn(),
      dispose: vi.fn(),
    };
    const usageTracker = {
      getStats: vi.fn().mockReturnValue([]),
      onStatsChanged: vi.fn(),
      dispose: vi.fn(),
    };

    return {
      providerManager,
      modelRegistry,
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
      usageTracker,
      dispose: vi.fn(function (this: {
        modelRegistry: { disposeAll: () => void };
        providerManager: { dispose: () => void };
        usageTracker: { dispose: () => void };
      }) {
        this.modelRegistry.disposeAll();
        this.providerManager.dispose();
        this.usageTracker.dispose();
      }),
    };
  }),
);
vi.mock('./context.js', () => ({
  ExtensionContext: mockExtensionContext,
}));

import * as vscode from 'vscode';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './db/index.js';
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
      expect.objectContaining({ refresh: expect.any(Function) }),
      expect.objectContaining({
        trace: expect.any(Function),
        debug: expect.any(Function),
        info: expect.any(Function),
        warn: expect.any(Function),
        error: expect.any(Function),
      }),
    );
  });

  it('should push disposables to subscriptions', async () => {
    await activate(context);

    // registerCommands is mocked, so:
    // logger channel + tree data provider + tree view dispose + chat debug cleanup + reasoning cache cleanup + status bar = 6
    expect(context.subscriptions).toHaveLength(6);
  });

  it('should create a status bar item', async () => {
    const { createStatusBarItem } = await import('./ui/status-bar/status-bar.js');
    await activate(context);

    expect(createStatusBarItem).toHaveBeenCalledWith(
      expect.objectContaining({
        getProviders: expect.any(Function),
        onProvidersChanged: expect.any(Function),
      }),
      expect.objectContaining({
        getStats: expect.any(Function),
        onStatsChanged: expect.any(Function),
      }),
    );
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
      logger: mockLogger,
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

  it('should log activation lifecycle messages', async () => {
    await activate(context);

    expect(mockLogger.info).toHaveBeenCalledWith('Activating extension');
    expect(mockLogger.info).toHaveBeenCalledWith('Extension activated');
  });

  it('should return ExtensionApi with providerManager and modelRegistry', async () => {
    const api = await activate(context);

    expect(api).toBeDefined();
    expect(api!.providerManager).toBeDefined();
    expect(api!.modelRegistry).toBeDefined();
  });

  it('should return undefined when DB init fails', async () => {
    vi.mocked(DatabaseSync).mockImplementationOnce(function () {
      throw new Error('migration failed');
    });

    const api = await activate(context);

    expect(api).toBeUndefined();
  });

  it('should push logger channel to subscriptions', async () => {
    await activate(context);

    expect(context.subscriptions).toContain(mockLogger);
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

  it('should call extCtx.dispose on deactivation', async () => {
    await activate(context);
    const ctxInstance = vi.mocked(ExtensionContext).mock.results[0].value;
    deactivate();

    expect(ctxInstance.dispose).toHaveBeenCalled();
  });

  it('should dispose modelRegistry through extCtx', async () => {
    await activate(context);
    const ctxInstance = vi.mocked(ExtensionContext).mock.results[0].value;
    deactivate();

    expect(ctxInstance.modelRegistry.disposeAll).toHaveBeenCalled();
  });

  it('should dispose providerManager through extCtx', async () => {
    await activate(context);
    const ctxInstance = vi.mocked(ExtensionContext).mock.results[0].value;
    deactivate();

    expect(ctxInstance.providerManager.dispose).toHaveBeenCalled();
  });

  it('should dispose usageTracker through extCtx', async () => {
    await activate(context);
    const ctxInstance = vi.mocked(ExtensionContext).mock.results[0].value;
    deactivate();

    expect(ctxInstance.usageTracker.dispose).toHaveBeenCalled();
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

  it('should log deactivation message', async () => {
    await activate(context);
    deactivate();

    expect(mockLogger.info).toHaveBeenCalledWith('Deactivating extension');
  });

  it('should log warning when close fails', async () => {
    await activate(context);
    mockClose.mockImplementationOnce(() => {
      throw new Error('already closed');
    });

    deactivate();

    expect(mockLogger.warn).toHaveBeenCalledWith('Failed to close database', 'already closed');
  });
});

describe('activate resetCallback', () => {
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

  it('should delete all rows from all 6 tables', async () => {
    // Arrange
    const deleteMock = vi.fn().mockReturnValue({ run: vi.fn() });
    mockDb.delete = deleteMock;
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      }),
    });

    await activate(context);

    // Get the resetCallback passed to ExtensionContext
    const resetCallback = vi.mocked(ExtensionContext).mock.calls[0]?.[0]?.resetCallback;
    await resetCallback();

    // Assert: delete called for each of the 6 tables
    expect(deleteMock).toHaveBeenCalledTimes(6);
  });

  it('should delete all SecretStorage keys for each provider', async () => {
    // Arrange: 3 providers
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]),
      }),
    });
    const deleteMock = vi.fn().mockReturnValue({ run: vi.fn() });
    mockDb.delete = deleteMock;

    await activate(context);

    const resetCallback = vi.mocked(ExtensionContext).mock.calls[0]?.[0]?.resetCallback;
    await resetCallback();

    // Assert: secrets.delete called for each provider
    expect(context.secrets.delete).toHaveBeenCalledTimes(3);
    expect(context.secrets.delete).toHaveBeenCalledWith('tokenguard-copilot.provider.p1');
  });

  it('should handle empty database (no providers)', async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      }),
    });
    const deleteMock = vi.fn().mockReturnValue({ run: vi.fn() });
    mockDb.delete = deleteMock;

    await activate(context);

    const resetCallback = vi.mocked(ExtensionContext).mock.calls[0]?.[0]?.resetCallback;
    await resetCallback();

    // Assert: deletes still happen (no early returns), no secrets to clean
    expect(deleteMock).toHaveBeenCalledTimes(6);
    expect(context.secrets.delete).not.toHaveBeenCalled();
  });
});
