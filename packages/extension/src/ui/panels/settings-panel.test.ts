import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExtensionContext as AppContext } from '../../context.js';

const FAKE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-{{nonce}}'; style-src {{cspSource}} 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TokenGuard Copilot Settings</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="{{nonce}}" src="{{scriptUri}}"></script>
  </body>
</html>`;

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => FAKE_TEMPLATE),
}));

vi.mock('vscode', () => {
  const disposable = { dispose: vi.fn() };

  const mockWebview = {
    html: '',
    asWebviewUri: vi.fn((uri: unknown) => uri),
    cspSource: 'https://test.csp.source',
    onDidReceiveMessage: vi.fn((_callback: unknown, _thisArg: unknown, disposables: unknown[]) => {
      disposables.push(disposable);
    }),
    postMessage: vi.fn().mockResolvedValue(true),
  };

  const mockPanel = {
    webview: mockWebview,
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn((callback: () => void, _thisArg: unknown, disposables: unknown[]) => {
      mockPanel._onDidDisposeCallback = callback;
      disposables.push(disposable);
    }),
    _onDidDisposeCallback: null as (() => void) | null,
  };

  return {
    window: {
      createWebviewPanel: vi.fn(() => mockPanel),
      showInformationMessage: vi.fn(),
    },
    ViewColumn: { One: 1 },
    Uri: {
      joinPath: vi.fn((...args: unknown[]) => args.join('/')),
    },
    _mockPanel: mockPanel,
    _mockWebview: mockWebview,
  };
});

import * as vscode from 'vscode';
import { SettingsPanel } from './settings-panel.js';

const mockVscode = vscode as unknown as {
  _mockPanel: {
    webview: {
      html: string;
      asWebviewUri: ReturnType<typeof vi.fn>;
      onDidReceiveMessage: ReturnType<typeof vi.fn>;
      postMessage: ReturnType<typeof vi.fn>;
    };
    reveal: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    onDidDispose: ReturnType<typeof vi.fn>;
    _onDidDisposeCallback: (() => void) | null;
  };
};

describe('SettingsPanel', () => {
  let extensionUri: vscode.Uri;
  let appCtx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    extensionUri = '/test/extension' as unknown as vscode.Uri;
    appCtx = {
      providerManager: {
        getProviders: vi.fn().mockReturnValue([]),
        addProvider: vi.fn(),
        editProvider: vi.fn(),
        removeProvider: vi.fn(),
        resetAll: vi.fn(),
      },
    } as unknown as AppContext;
    mockVscode._mockPanel._onDidDisposeCallback = null;
  });

  afterEach(() => {
    if (mockVscode._mockPanel._onDidDisposeCallback) {
      mockVscode._mockPanel._onDidDisposeCallback();
    }
  });

  it('should create a webview panel', () => {
    SettingsPanel.createOrShow(extensionUri, appCtx);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'tokenguardCopilotSettings',
      'TokenGuard Copilot Settings',
      vscode.ViewColumn.One,
      expect.objectContaining({
        enableScripts: true,
      }),
    );
  });

  it('should set HTML content on the webview', () => {
    SettingsPanel.createOrShow(extensionUri, appCtx);

    const html = mockVscode._mockPanel.webview.html;
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('settings-app.js');
    expect(html).toContain('Content-Security-Policy');
    expect(html).not.toContain('{{nonce}}');
    expect(html).not.toContain('{{scriptUri}}');
    expect(html).not.toContain('{{cspSource}}');
  });

  it('should reveal existing panel instead of creating a new one', () => {
    SettingsPanel.createOrShow(extensionUri, appCtx);
    SettingsPanel.createOrShow(extensionUri, appCtx);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockVscode._mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it('should clear singleton on dispose', () => {
    SettingsPanel.createOrShow(extensionUri, appCtx);

    const callback = mockVscode._mockPanel._onDidDisposeCallback;
    expect(callback).not.toBeNull();
    callback!();

    SettingsPanel.createOrShow(extensionUri, appCtx);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it('dispose should call panel.dispose', () => {
    const panel = SettingsPanel.createOrShow(extensionUri, appCtx);

    panel.dispose();

    expect(mockVscode._mockPanel.dispose).toHaveBeenCalled();
  });

  describe('onDidReceiveMessage', () => {
    function getMessageHandler(): (message: unknown) => Promise<void> {
      SettingsPanel.createOrShow(extensionUri, appCtx);
      return mockVscode._mockPanel.webview.onDidReceiveMessage.mock.calls[0][0] as (
        message: unknown,
      ) => Promise<void>;
    }

    it('handles getProviders request', async () => {
      const providers = [{ id: 'p1', name: 'A', baseUrl: 'https://a.com' }];
      vi.mocked(appCtx.providerManager.getProviders).mockReturnValue(providers);

      const handler = getMessageHandler();
      await handler({ type: 'getProviders', requestId: 'r1' });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'getProvidersResult',
        requestId: 'r1',
        providers,
      });
    });

    it('handles addProvider success', async () => {
      const provider = { id: 'p1', name: 'A', baseUrl: 'https://a.com' };
      vi.mocked(appCtx.providerManager.addProvider).mockResolvedValue(provider);

      const handler = getMessageHandler();
      await handler({
        type: 'addProvider',
        requestId: 'r2',
        name: 'A',
        baseUrl: 'https://a.com',
        apiKey: 'key',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'addProviderResult',
        requestId: 'r2',
        success: true,
        provider,
      });
    });

    it('handles addProvider failure', async () => {
      vi.mocked(appCtx.providerManager.addProvider).mockRejectedValue(new Error('Duplicate name'));

      const handler = getMessageHandler();
      await handler({
        type: 'addProvider',
        requestId: 'r3',
        name: 'A',
        baseUrl: 'https://a.com',
        apiKey: 'key',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'addProviderResult',
        requestId: 'r3',
        success: false,
        error: 'Duplicate name',
      });
    });

    it('handles editProvider success', async () => {
      const provider = {
        id: 'p1',
        name: 'Updated',
        baseUrl: 'https://new.com',
      };
      vi.mocked(appCtx.providerManager.editProvider).mockResolvedValue(provider);

      const handler = getMessageHandler();
      await handler({
        type: 'editProvider',
        requestId: 'r4',
        id: 'p1',
        name: 'Updated',
        baseUrl: 'https://new.com',
        apiKey: '',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'editProviderResult',
        requestId: 'r4',
        success: true,
        provider,
      });
    });

    it('handles editProvider failure', async () => {
      vi.mocked(appCtx.providerManager.editProvider).mockRejectedValue(new Error('Not found'));

      const handler = getMessageHandler();
      await handler({
        type: 'editProvider',
        requestId: 'r5',
        id: 'p1',
        name: 'X',
        baseUrl: 'https://x.com',
        apiKey: '',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'editProviderResult',
        requestId: 'r5',
        success: false,
        error: 'Not found',
      });
    });

    it('handles removeProvider success', async () => {
      vi.mocked(appCtx.providerManager.removeProvider).mockResolvedValue(undefined);

      const handler = getMessageHandler();
      await handler({
        type: 'removeProvider',
        requestId: 'r6',
        id: 'p1',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'removeProviderResult',
        requestId: 'r6',
        success: true,
      });
    });

    it('handles removeProvider failure', async () => {
      vi.mocked(appCtx.providerManager.removeProvider).mockRejectedValue(new Error('Not found'));

      const handler = getMessageHandler();
      await handler({
        type: 'removeProvider',
        requestId: 'r7',
        id: 'p1',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'removeProviderResult',
        requestId: 'r7',
        success: false,
        error: 'Not found',
      });
    });

    it('handles resetSettings success', async () => {
      vi.mocked(appCtx.providerManager.resetAll).mockResolvedValue(undefined);

      const handler = getMessageHandler();
      await handler({
        type: 'resetSettings',
        requestId: 'r8',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'resetSettingsResult',
        requestId: 'r8',
        success: true,
      });

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'TokenGuard Copilot: All settings have been reset.',
      );
    });

    it('handles resetSettings failure', async () => {
      vi.mocked(appCtx.providerManager.resetAll).mockRejectedValue(new Error('DB error'));

      const handler = getMessageHandler();
      await handler({
        type: 'resetSettings',
        requestId: 'r9',
      });

      expect(mockVscode._mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'resetSettingsResult',
        requestId: 'r9',
        success: false,
        error: 'DB error',
      });
    });
  });
});
