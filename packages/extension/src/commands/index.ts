import * as vscode from 'vscode';
import { SettingsPanel } from '../ui/panels/settings-panel.js';

/**
 * Registers all extension commands and pushes their
 * disposables to `context.subscriptions`.
 *
 * @param context - The VS Code extension context.
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from TokenGuard Copilot!');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri);
    }),
  );
}
