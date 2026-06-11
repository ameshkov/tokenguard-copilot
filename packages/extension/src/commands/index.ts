import { type ExtensionContext, commands, window } from 'vscode';
import type { ExtensionContext as AppContext } from '../context.js';
import type { Logger } from '../logger/index.js';
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
 * @param logger - The logger instance for diagnostic
 *   output.
 */
export function registerCommands(
  context: ExtensionContext,
  appCtx: AppContext,
  treeViewProvider: ChatDebugTreeViewProvider,
  logger: Logger,
): void {
  logger.debug('Registering extension commands');

  context.subscriptions.push(
    commands.registerCommand('tokenguard-copilot.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri, appCtx);
    }),
  );

  context.subscriptions.push(
    commands.registerCommand(
      'tokenguard-copilot.enableDebuggingLogging',
      async (options?: { skipConfirmation?: boolean }) => {
        if (!options?.skipConfirmation) {
          const answer = await window.showInformationMessage(
            'Enable debug logging? This will record request and response data for debugging.',
            { modal: true },
            'Enable',
          );
          if (answer !== 'Enable') {
            return;
          }
        }
        appCtx.chatDebugSettings.updateSettings({
          enabled: true,
        });
        void commands.executeCommand('setContext', 'tokenguard-copilot.chatDebugEnabled', true);
      },
    ),
  );

  context.subscriptions.push(
    commands.registerCommand('tokenguard-copilot.disableDebuggingLogging', () => {
      appCtx.chatDebugSettings.updateSettings({
        enabled: false,
      });
      void commands.executeCommand('setContext', 'tokenguard-copilot.chatDebugEnabled', false);
    }),
  );

  context.subscriptions.push(
    commands.registerCommand('tokenguard-copilot.refreshDebuggingLogs', () => {
      treeViewProvider.refresh();
    }),
  );

  context.subscriptions.push(
    commands.registerCommand(
      'tokenguard-copilot.clearDebuggingLogs',
      async (options?: { skipConfirmation?: boolean }) => {
        if (!options?.skipConfirmation) {
          const answer = await window.showWarningMessage(
            'This will permanently delete all debug logs. This action cannot be undone.',
            { modal: true },
            'Clear Logs',
          );
          if (answer !== 'Clear Logs') {
            return;
          }
        }
        appCtx.chatDebugCleanup.clearAll();
      },
    ),
  );
}
