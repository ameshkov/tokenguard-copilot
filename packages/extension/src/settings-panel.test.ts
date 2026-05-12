import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  };

  const mockPanel = {
    webview: mockWebview,
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn((callback: () => void, _thisArg: unknown, disposables: unknown[]) => {
      // Store the callback so we can call it in tests.
      mockPanel._onDidDisposeCallback = callback;
      disposables.push(disposable);
    }),
    _onDidDisposeCallback: null as (() => void) | null,
  };

  return {
    window: {
      createWebviewPanel: vi.fn(() => mockPanel),
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

// Access mock internals.
const mockVscode = vscode as unknown as {
  _mockPanel: {
    webview: { html: string; asWebviewUri: ReturnType<typeof vi.fn> };
    reveal: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    onDidDispose: ReturnType<typeof vi.fn>;
    _onDidDisposeCallback: (() => void) | null;
  };
};

describe('SettingsPanel', () => {
  let extensionUri: vscode.Uri;

  beforeEach(() => {
    vi.clearAllMocks();
    extensionUri = '/test/extension' as unknown as vscode.Uri;
    // Reset the static currentPanel via dispose.
    mockVscode._mockPanel._onDidDisposeCallback = null;
  });

  afterEach(() => {
    // Ensure the singleton is cleared between tests by disposing
    // if a panel was created.
    if (mockVscode._mockPanel._onDidDisposeCallback) {
      mockVscode._mockPanel._onDidDisposeCallback();
    }
  });

  it('should create a webview panel', () => {
    SettingsPanel.createOrShow(extensionUri);

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
    SettingsPanel.createOrShow(extensionUri);

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
    SettingsPanel.createOrShow(extensionUri);
    SettingsPanel.createOrShow(extensionUri);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockVscode._mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it('should clear singleton on dispose', () => {
    SettingsPanel.createOrShow(extensionUri);

    // Trigger the onDidDispose callback.
    const callback = mockVscode._mockPanel._onDidDisposeCallback;
    expect(callback).not.toBeNull();
    callback!();

    // Now creating again should make a new panel.
    SettingsPanel.createOrShow(extensionUri);
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it('dispose should call panel.dispose', () => {
    const panel = SettingsPanel.createOrShow(extensionUri);

    panel.dispose();

    expect(mockVscode._mockPanel.dispose).toHaveBeenCalled();
  });
});
