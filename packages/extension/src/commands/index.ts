import * as vscode from 'vscode';
import type { ExtensionContext as AppContext } from '../context.js';
import { SettingsPanel } from '../ui/panels/index.js';

/**
 * Registers all extension commands and pushes their
 * disposables to `context.subscriptions`.
 *
 * @param context - The VS Code extension context.
 * @param appCtx - The application context with services.
 */
export function registerCommands(context: vscode.ExtensionContext, appCtx: AppContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from TokenGuard Copilot!');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri, appCtx);
    }),
  );
}
