import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExtensionContext as AppContext } from '../../context.js';
import { FAKE_TEMPLATE, createMockAppCtx } from '../../test/settings-panel-helpers.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => FAKE_TEMPLATE),
}));

const mockPanel = vi.hoisted(() => {
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

  const panel = {
    webview: mockWebview,
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn((callback: () => void, _thisArg: unknown, disposables: unknown[]) => {
      panel._onDidDisposeCallback = callback;
      disposables.push(disposable);
    }),
    _onDidDisposeCallback: null as (() => void) | null,
  };

  return panel;
});

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(() => mockPanel),
    showInformationMessage: vi.fn(),
  },
  ViewColumn: { One: 1 },
  Uri: {
    joinPath: vi.fn((...args: unknown[]) => args.join('/')),
  },
}));

import { type Uri, ViewColumn, window } from 'vscode';
import { SettingsPanel } from './settings-panel.js';

describe('SettingsPanel', () => {
  let extensionUri: Uri;
  let appCtx: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    extensionUri = '/test/extension' as unknown as Uri;
    appCtx = createMockAppCtx();
    mockPanel._onDidDisposeCallback = null;
  });

  afterEach(() => {
    if (mockPanel._onDidDisposeCallback) {
      mockPanel._onDidDisposeCallback();
    }
  });

  it('should create a webview panel', () => {
    SettingsPanel.createOrShow(extensionUri, appCtx);

    expect(window.createWebviewPanel).toHaveBeenCalledWith(
      'tokenguardCopilotSettings',
      'TokenGuard Copilot Settings',
      ViewColumn.One,
      expect.objectContaining({
        enableScripts: true,
      }),
    );
  });

  it('should set HTML content on the webview', () => {
    SettingsPanel.createOrShow(extensionUri, appCtx);

    const html = mockPanel.webview.html;
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

    expect(window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
  });

  it('should clear singleton on dispose', () => {
    SettingsPanel.createOrShow(extensionUri, appCtx);

    const callback = mockPanel._onDidDisposeCallback;
    expect(callback).not.toBeNull();
    callback!();

    SettingsPanel.createOrShow(extensionUri, appCtx);
    expect(window.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it('dispose should call panel.dispose', () => {
    const panel = SettingsPanel.createOrShow(extensionUri, appCtx);

    panel.dispose();

    expect(mockPanel.dispose).toHaveBeenCalled();
  });
});
