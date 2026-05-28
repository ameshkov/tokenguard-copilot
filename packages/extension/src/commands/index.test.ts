import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExtensionContext as AppContext } from '../context.js';

vi.mock('vscode', () => {
  const disposable = { dispose: vi.fn() };

  return {
    commands: {
      registerCommand: vi.fn(() => disposable),
      executeCommand: vi.fn(),
    },
    window: {
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
    },
    _mockDisposable: disposable,
  };
});

vi.mock('../ui/panels/settings-panel.js', () => ({
  SettingsPanel: {
    createOrShow: vi.fn(),
  },
}));

import * as vscode from 'vscode';
import { registerCommands } from './index.js';
import type { ChatDebugTreeViewProvider } from '../ui/tree-views/index.js';

describe('registerCommands', () => {
  let context: vscode.ExtensionContext;
  let appCtx: AppContext;
  let treeViewProvider: ChatDebugTreeViewProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      subscriptions: [],
      extensionUri: '/test/extension',
    } as unknown as vscode.ExtensionContext;
    appCtx = {
      providerManager: {},
      chatDebugSettings: {
        updateSettings: vi.fn(),
      },
      chatDebugCleanup: {
        clearAll: vi.fn(),
      },
    } as unknown as AppContext;
    treeViewProvider = {
      refresh: vi.fn(),
    } as unknown as ChatDebugTreeViewProvider;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Finds the callback registered for a given command ID.
   *
   * @param commandId - The full command ID.
   * @returns The registered callback function.
   */
  function findCallback(commandId: string): (...args: unknown[]) => unknown {
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const call = calls.find((c) => c[0] === commandId);
    if (!call) {
      throw new Error(`Command "${commandId}" not registered`);
    }
    return call[1] as (...args: unknown[]) => unknown;
  }

  it('should register the helloWorld command', () => {
    registerCommands(context, appCtx, treeViewProvider);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'tokenguard-copilot.helloWorld',
      expect.any(Function),
    );
  });

  it('should register the openSettings command', () => {
    registerCommands(context, appCtx, treeViewProvider);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'tokenguard-copilot.openSettings',
      expect.any(Function),
    );
  });

  it('should push 6 disposables to subscriptions', () => {
    registerCommands(context, appCtx, treeViewProvider);

    expect(context.subscriptions).toHaveLength(6);
  });

  it('helloWorld command should show an information message', () => {
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.helloWorld');
    callback();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Hello World from TokenGuard Copilot!',
    );
  });

  it('openSettings command should create or show settings panel', async () => {
    const { SettingsPanel } = await import('../ui/panels/settings-panel.js');
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.openSettings');
    callback();

    expect(SettingsPanel.createOrShow).toHaveBeenCalledWith(context.extensionUri, appCtx);
  });

  it('enableDebuggingLogging shows modal and updates settings on confirm', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Enable' as never);
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.enableDebuggingLogging');
    await callback();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Enable debug logging? This will record request and response data for debugging.',
      { modal: true },
      'Enable',
    );
    expect(appCtx.chatDebugSettings.updateSettings).toHaveBeenCalledWith({ enabled: true });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'tokenguard-copilot.chatDebugEnabled',
      true,
    );
  });

  it('enableDebuggingLogging does nothing when user cancels', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as never);
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.enableDebuggingLogging');
    await callback();

    expect(appCtx.chatDebugSettings.updateSettings).not.toHaveBeenCalled();
  });

  it('disableDebuggingLogging updates settings', () => {
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.disableDebuggingLogging');
    callback();

    expect(appCtx.chatDebugSettings.updateSettings).toHaveBeenCalledWith({ enabled: false });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'tokenguard-copilot.chatDebugEnabled',
      false,
    );
  });

  it('refreshDebuggingLogs calls treeViewProvider.refresh()', () => {
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.refreshDebuggingLogs');
    callback();

    expect(treeViewProvider.refresh).toHaveBeenCalledOnce();
  });

  it('clearDebuggingLogs shows modal and clears on confirm', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Clear Logs' as never);
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.clearDebuggingLogs');
    await callback();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'This will permanently delete all debug logs. This action cannot be undone.',
      { modal: true },
      'Clear Logs',
    );
    expect(appCtx.chatDebugCleanup.clearAll).toHaveBeenCalledOnce();
  });

  it('clearDebuggingLogs does nothing when user cancels', async () => {
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as never);
    registerCommands(context, appCtx, treeViewProvider);

    const callback = findCallback('tokenguard-copilot.clearDebuggingLogs');
    await callback();

    expect(appCtx.chatDebugCleanup.clearAll).not.toHaveBeenCalled();
  });
});
