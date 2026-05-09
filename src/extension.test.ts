import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const disposable = { dispose: vi.fn() };
  const subscriptions: unknown[] = [];

  return {
    commands: {
      registerCommand: vi.fn(() => disposable),
    },
    window: {
      showInformationMessage: vi.fn(),
    },
    ExtensionContext: vi.fn(),
    _mockDisposable: disposable,
    _mockSubscriptions: subscriptions,
  };
});

vi.mock('./settings-panel.js', () => ({
  SettingsPanel: {
    createOrShow: vi.fn(),
  },
}));

import * as vscode from 'vscode';
import { activate, deactivate } from './extension.js';

describe('activate', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
  });

  it('should register the helloWorld command', () => {
    activate(context);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'oai-copilot.helloWorld',
      expect.any(Function),
    );
  });

  it('should register the openSettings command', () => {
    activate(context);

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'oai-copilot.openSettings',
      expect.any(Function),
    );
  });

  it('should push disposables to subscriptions', () => {
    activate(context);

    expect(context.subscriptions).toHaveLength(2);
  });

  it('helloWorld command should show an information message', () => {
    activate(context);

    const callback = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1] as () => void;
    callback();

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'Hello World from OAI Copilot!',
    );
  });

  it('openSettings command should create or show settings panel', async () => {
    const { SettingsPanel } = await import('./settings-panel.js');
    activate(context);

    const callback = vi.mocked(vscode.commands.registerCommand).mock.calls[1][1] as () => void;
    callback();

    expect(SettingsPanel.createOrShow).toHaveBeenCalled();
  });
});

describe('deactivate', () => {
  it('should not throw', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
