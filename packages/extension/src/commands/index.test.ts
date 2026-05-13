import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('vscode', () => {
  const disposable = { dispose: vi.fn() };

  return {
    commands: {
      registerCommand: vi.fn(() => disposable),
    },
    window: {
      showInformationMessage: vi.fn(),
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

describe('registerCommands', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      subscriptions: [],
      extensionUri: '/test/extension',
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should register the helloWorld command', () => {
    registerCommands(context);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'tokenguard-copilot.helloWorld',
      expect.any(Function),
    );
  });

  it('should register the openSettings command', () => {
    registerCommands(context);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'tokenguard-copilot.openSettings',
      expect.any(Function),
    );
  });

  it('should push 2 disposables to subscriptions', () => {
    registerCommands(context);

    expect(context.subscriptions).toHaveLength(2);
  });

  it('helloWorld command should show an information message', () => {
    registerCommands(context);

    const callback = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1] as () => void;
    callback();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Hello World from TokenGuard Copilot!',
    );
  });

  it('openSettings command should create or show settings panel', async () => {
    const { SettingsPanel } = await import('../ui/panels/settings-panel.js');
    registerCommands(context);

    const callback = vi.mocked(vscode.commands.registerCommand).mock.calls[1][1] as () => void;
    callback();

    expect(SettingsPanel.createOrShow).toHaveBeenCalledWith(context.extensionUri);
  });
});
