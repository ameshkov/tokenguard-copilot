import * as fs from 'node:fs';
import * as vscode from 'vscode';

/**
 * Manages the settings webview panel.
 *
 * Provides a method to create or reveal the settings panel and
 * handles the panel's lifecycle including disposal.
 */
export class SettingsPanel {
  /** The column in which to show the webview. */
  private static readonly viewColumn = vscode.ViewColumn.One;

  /** Track the currently active panel. */
  private static currentPanel: SettingsPanel | undefined;

  /** The underlying VS Code webview panel. */
  private readonly panel: vscode.WebviewPanel;

  /** The extension URI used to resolve webview resources. */
  private readonly extensionUri: vscode.Uri;

  /** Disposables owned by this panel. */
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Creates a new settings panel or reveals an existing one.
   *
   * @param extensionUri - The URI of the extension's root directory.
   * @returns The settings panel instance.
   */
  public static createOrShow(extensionUri: vscode.Uri): SettingsPanel {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.reveal(SettingsPanel.viewColumn);
      return SettingsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'tokenguardCopilotSettings',
      'TokenGuard Copilot Settings',
      SettingsPanel.viewColumn,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webview')],
      },
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
    return SettingsPanel.currentPanel;
  }

  /**
   * Disposes the panel and cleans up resources.
   */
  public dispose(): void {
    SettingsPanel.currentPanel = undefined;

    this.panel.dispose();

    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  /**
   * Builds the HTML content for the webview.
   *
   * Reads the HTML template from assets/webview/settings.html and
   * interpolates dynamic placeholders (nonce, script URI, CSP source).
   *
   * @param webview - The webview to generate HTML for.
   * @returns The full HTML string for the webview.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'settings-app.js'),
    );

    const nonce = getNonce();

    const templatePath = vscode.Uri.joinPath(
      this.extensionUri,
      'assets',
      'webview',
      'settings.html',
    );
    const template = fs.readFileSync(templatePath.fsPath, 'utf8');

    return template
      .replaceAll('{{nonce}}', nonce)
      .replaceAll('{{scriptUri}}', scriptUri.toString())
      .replaceAll('{{cspSource}}', webview.cspSource);
  }
}

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
