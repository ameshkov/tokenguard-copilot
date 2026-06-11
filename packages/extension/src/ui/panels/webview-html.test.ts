import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

const FAKE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-{{nonce}}'; style-src {{cspSource}} 'unsafe-inline'; font-src {{codiconStyleUri}};" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="{{styleUri}}" />
    <link rel="stylesheet" href="{{codiconStyleUri}}" />
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
  /**
   * Creates a mock Uri-like object that supports .fsPath and
   * .toString().
   */
  function mockUri(path: string) {
    return {
      fsPath: path,
      toString: () => path,
    };
  }

  return {
    Uri: {
      joinPath: vi.fn((...args: unknown[]) => mockUri(args.join('/'))),
    },
  };
});

import { type Webview, Uri } from 'vscode';
import { getHtmlForWebview } from './webview-html.js';

describe('getHtmlForWebview', () => {
  const mockWebview = {
    asWebviewUri: vi.fn((uri: unknown) => uri),
    cspSource: 'https://test.csp.source',
  } as unknown as Webview;

  const extensionUri = '/test/extension' as unknown as Uri;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces all template placeholders', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    // Placeholders should be gone
    expect(html).not.toContain('{{nonce}}');
    expect(html).not.toContain('{{scriptUri}}');
    expect(html).not.toContain('{{styleUri}}');
    expect(html).not.toContain('{{codiconStyleUri}}');
    expect(html).not.toContain('{{cspSource}}');
  });

  it('injects a 32-character alphanumeric nonce', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    // Extract the nonce from the script-src directive
    const nonceMatch = html.match(/nonce-([A-Za-z0-9]+)/);
    expect(nonceMatch).not.toBeNull();
    expect(nonceMatch![1]).toHaveLength(32);
    expect(nonceMatch![1]).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('uses the same nonce for all placeholders', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    // Find all nonce occurrences
    const nonceMatches = html.match(/nonce-[A-Za-z0-9]+/g);
    expect(nonceMatches).not.toBeNull();
    if (nonceMatches) {
      // All nonce values should be the same
      const first = nonceMatches[0];
      for (const match of nonceMatches) {
        expect(match).toBe(first);
      }
    }
  });

  it('injects the script URI', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    expect(html).toContain('out/webview/settings-app.js');
  });

  it('injects the style URI', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    expect(html).toContain('out/webview/settings-app.css');
  });

  it('injects the codicon style URI', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    expect(html).toContain('out/webview/codicon.css');
  });

  it('injects the CSP source', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    expect(html).toContain('https://test.csp.source');
  });

  it('preserves the HTML structure of the template', () => {
    const html = getHtmlForWebview(mockWebview, extensionUri);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<title>TokenGuard Copilot Settings</title>');
    expect(html).toContain('Content-Security-Policy');
  });

  it('reads the template from the correct path', () => {
    getHtmlForWebview(mockWebview, extensionUri);

    expect(fs.readFileSync).toHaveBeenCalledWith(
      '/test/extension/assets/webview/settings.html',
      'utf8',
    );
  });

  it('calls asWebviewUri with correct joinPath for script', () => {
    getHtmlForWebview(mockWebview, extensionUri);

    expect(Uri.joinPath).toHaveBeenCalledWith(extensionUri, 'out', 'webview', 'settings-app.js');
    expect(Uri.joinPath).toHaveBeenCalledWith(extensionUri, 'out', 'webview', 'settings-app.css');
    expect(Uri.joinPath).toHaveBeenCalledWith(extensionUri, 'out', 'webview', 'codicon.css');
  });

  it('calls webview.asWebviewUri for each asset URI', () => {
    getHtmlForWebview(mockWebview, extensionUri);

    expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(3);
  });
});
