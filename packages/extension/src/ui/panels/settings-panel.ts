import { type WebviewPanel, Uri, type Disposable, ViewColumn, window } from 'vscode';
import type { ExtensionContext as AppContext } from '../../context.js';
import type { WebviewCommand } from '@tokenguard/shared';
import { getHtmlForWebview } from './webview-html.js';
import {
  handleGetProviders,
  handleAddProvider,
  handleEditProvider,
  handleRemoveProvider,
  handleResetSettings,
  handleGetModels,
  handleFetchAvailableModels,
  handleAddModel,
  handleEditModel,
  handleRemoveModel,
  handleGetModelDefaults,
} from './message-handler-core.js';
import {
  handleGetChatDebugSettings,
  handleUpdateChatDebugSettings,
  handleClearChatDebugLogs,
  handleGetContentRules,
  handleGetContentRule,
  handleAddContentRule,
  handleUpdateContentRule,
  handleDeleteContentRule,
  handleReorderContentRules,
  handleGetUsageStats,
  handleResetUsageStats,
} from './message-handler-extras.js';

/**
 * Manages the settings webview panel.
 *
 * Provides a method to create or reveal the settings panel and
 * handles the panel's lifecycle including disposal.
 */
export class SettingsPanel {
  /** The column in which to show the webview. */
  private static readonly viewColumn = ViewColumn.One;

  /** Track the currently active panel. */
  private static currentPanel: SettingsPanel | undefined;

  /** The underlying VS Code webview panel. */
  private readonly panel: WebviewPanel;

  /** The extension URI used to resolve webview resources. */
  private readonly extensionUri: Uri;

  /** Disposables owned by this panel. */
  private readonly disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel, extensionUri: Uri, appCtx: AppContext) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = getHtmlForWebview(this.panel.webview, this.extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewCommand) => {
        switch (message.type) {
          case 'getProviders':
            return handleGetProviders(appCtx, this.panel.webview, message);
          case 'addProvider':
            return handleAddProvider(appCtx, this.panel.webview, message);
          case 'editProvider':
            return handleEditProvider(appCtx, this.panel.webview, message);
          case 'removeProvider':
            return handleRemoveProvider(appCtx, this.panel.webview, message);
          case 'resetSettings':
            return handleResetSettings(appCtx, this.panel.webview, message);
          case 'getModels':
            return handleGetModels(appCtx, this.panel.webview, message);
          case 'fetchAvailableModels':
            return handleFetchAvailableModels(appCtx, this.panel.webview, message);
          case 'addModel':
            return handleAddModel(appCtx, this.panel.webview, message);
          case 'editModel':
            return handleEditModel(appCtx, this.panel.webview, message);
          case 'removeModel':
            return handleRemoveModel(appCtx, this.panel.webview, message);
          case 'getModelDefaults':
            return handleGetModelDefaults(appCtx, this.panel.webview, message);
          case 'getChatDebugSettings':
            return handleGetChatDebugSettings(appCtx, this.panel.webview, message);
          case 'updateChatDebugSettings':
            return handleUpdateChatDebugSettings(appCtx, this.panel.webview, message);
          case 'clearChatDebugLogs':
            return handleClearChatDebugLogs(appCtx, this.panel.webview, message);
          case 'getContentRules':
            return handleGetContentRules(appCtx, this.panel.webview, message);
          case 'getContentRule':
            return handleGetContentRule(appCtx, this.panel.webview, message);
          case 'addContentRule':
            return handleAddContentRule(appCtx, this.panel.webview, message);
          case 'updateContentRule':
            return handleUpdateContentRule(appCtx, this.panel.webview, message);
          case 'deleteContentRule':
            return handleDeleteContentRule(appCtx, this.panel.webview, message);
          case 'reorderContentRules':
            return handleReorderContentRules(appCtx, this.panel.webview, message);
          case 'getUsageStats':
            return handleGetUsageStats(appCtx, this.panel.webview, message);
          case 'resetUsageStats':
            return handleResetUsageStats(appCtx, this.panel.webview, message);
        }
      },
      null,
      this.disposables,
    );
  }

  /**
   * Creates a new settings panel or reveals an existing one.
   *
   * @param extensionUri - The URI of the extension's root directory.
   * @param appCtx - The application context with services.
   * @returns The settings panel instance.
   */
  public static createOrShow(extensionUri: Uri, appCtx: AppContext): SettingsPanel {
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.reveal(SettingsPanel.viewColumn);
      return SettingsPanel.currentPanel;
    }

    const panel = window.createWebviewPanel(
      'tokenguardCopilotSettings',
      'TokenGuard Copilot Settings',
      SettingsPanel.viewColumn,
      {
        enableScripts: true,
        localResourceRoots: [Uri.joinPath(extensionUri, 'out', 'webview')],
      },
    );

    panel.iconPath = {
      light: Uri.joinPath(extensionUri, 'assets', 'icon', 'icon_24_light.svg'),
      dark: Uri.joinPath(extensionUri, 'assets', 'icon', 'icon_24_dark.svg'),
    };

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri, appCtx);
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
}
