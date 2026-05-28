import * as vscode from 'vscode';
import type { ExtensionContext as AppContext } from '../context.js';
import { SettingsPanel } from '../ui/panels/index.js';
import type { ChatDebugTreeViewProvider } from '../ui/tree-views/index.js';

/**
 * Registers all extension commands and pushes their
 * disposables to `context.subscriptions`.
 *
 * @param context - The VS Code extension context.
 * @param appCtx - The application context with services.
 * @param treeViewProvider - The chat debug tree view
 *   provider, used by the refresh command.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  appCtx: AppContext,
  treeViewProvider: ChatDebugTreeViewProvider,
): void {
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

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.enableDebuggingLogging', async () => {
      const answer = await vscode.window.showInformationMessage(
        'Enable debug logging? This will record request and response data for debugging.',
        { modal: true },
        'Enable',
      );
      if (answer === 'Enable') {
        appCtx.chatDebugSettings.updateSettings({
          enabled: true,
        });
        void vscode.commands.executeCommand(
          'setContext',
          'tokenguard-copilot.chatDebugEnabled',
          true,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.disableDebuggingLogging', () => {
      appCtx.chatDebugSettings.updateSettings({
        enabled: false,
      });
      void vscode.commands.executeCommand(
        'setContext',
        'tokenguard-copilot.chatDebugEnabled',
        false,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.refreshDebuggingLogs', () => {
      treeViewProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenguard-copilot.clearDebuggingLogs', async () => {
      const answer = await vscode.window.showWarningMessage(
        'This will permanently delete all debug logs. This action cannot be undone.',
        { modal: true },
        'Clear Logs',
      );
      if (answer === 'Clear Logs') {
        appCtx.chatDebugCleanup.clearAll();
      }
    }),
  );
}
