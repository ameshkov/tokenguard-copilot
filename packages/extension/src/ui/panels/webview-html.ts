import * as fs from 'node:fs';
import { type Webview, Uri } from 'vscode';

/**
 * Generates a random nonce string for Content Security Policy.
 *
 * @returns A 32-character alphanumeric nonce.
 */
function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = new Uint8Array(32);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => possible[v % possible.length]).join('');
}

/**
 * Builds the HTML content for the webview.
 *
 * Reads the HTML template from assets/webview/settings.html and
 * interpolates dynamic placeholders (nonce, script URI, style URIs,
 * CSP source).
 *
 * @param webview - The webview to generate HTML for.
 * @param extensionUri - The extension root URI for resolving
 *   resource paths.
 * @returns The full HTML string for the webview.
 */
export function getHtmlForWebview(webview: Webview, extensionUri: Uri): string {
  const scriptUri = webview.asWebviewUri(
    Uri.joinPath(extensionUri, 'out', 'webview', 'settings-app.js'),
  );

  const styleUri = webview.asWebviewUri(
    Uri.joinPath(extensionUri, 'out', 'webview', 'settings-app.css'),
  );

  const codiconStyleUri = webview.asWebviewUri(
    Uri.joinPath(extensionUri, 'out', 'webview', 'codicon.css'),
  );

  const nonce = getNonce();

  const templatePath = Uri.joinPath(extensionUri, 'assets', 'webview', 'settings.html');
  const template = fs.readFileSync(templatePath.fsPath, 'utf8');

  return template
    .replaceAll('{{nonce}}', nonce)
    .replaceAll('{{scriptUri}}', scriptUri.toString())
    .replaceAll('{{styleUri}}', styleUri.toString())
    .replaceAll('{{codiconStyleUri}}', codiconStyleUri.toString())
    .replaceAll('{{cspSource}}', webview.cspSource);
}
