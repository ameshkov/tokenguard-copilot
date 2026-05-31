import * as fs from 'node:fs';
import * as vscode from 'vscode';
import type { ExtensionContext as AppContext } from '../../context.js';
import { getDefaults } from '../../services/model-defaults/index.js';
import type {
  WebviewCommand,
  GetProvidersResponse,
  AddProviderResponse,
  EditProviderResponse,
  RemoveProviderResponse,
  ResetSettingsResponse,
  GetModelsResponse,
  FetchAvailableModelsResponse,
  AddModelResponse,
  EditModelResponse,
  RemoveModelResponse,
  GetModelDefaultsResponse,
  GetChatDebugSettingsResponse,
  UpdateChatDebugSettingsResponse,
  ClearChatDebugLogsResponse,
  GetUsageStatsResponse,
  ResetUsageStatsResponse,
  UsageStatsSummary,
  GetContentRulesResponse,
  GetContentRuleResponse,
  AddContentRuleResponse,
  UpdateContentRuleResponse,
  DeleteContentRuleResponse,
  ReorderContentRulesResponse,
  ContentRuleInfo,
} from '@tokenguard/shared';
import type { UsageRecord, ContentRule } from '../../db/index.js';
import { safeParseJsonArray } from '../../utils/index.js';

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

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, appCtx: AppContext) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewCommand) => {
        switch (message.type) {
          case 'getProviders': {
            const providers = appCtx.providerManager.getProviders();
            await this.panel.webview.postMessage({
              type: 'getProvidersResult',
              requestId: message.requestId,
              providers,
            } satisfies GetProvidersResponse);
            break;
          }
          case 'addProvider': {
            try {
              const provider = await appCtx.providerManager.addProvider(
                message.name,
                message.baseUrl,
                message.apiKey,
              );
              await this.panel.webview.postMessage({
                type: 'addProviderResult',
                requestId: message.requestId,
                success: true,
                provider,
              } satisfies AddProviderResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'addProviderResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies AddProviderResponse);
            }
            break;
          }
          case 'editProvider': {
            try {
              const provider = await appCtx.providerManager.editProvider(
                message.id,
                message.name,
                message.baseUrl,
                message.apiKey,
              );
              await this.panel.webview.postMessage({
                type: 'editProviderResult',
                requestId: message.requestId,
                success: true,
                provider,
              } satisfies EditProviderResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'editProviderResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies EditProviderResponse);
            }
            break;
          }
          case 'removeProvider': {
            try {
              await appCtx.providerManager.removeProvider(message.id);
              await this.panel.webview.postMessage({
                type: 'removeProviderResult',
                requestId: message.requestId,
                success: true,
              } satisfies RemoveProviderResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'removeProviderResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies RemoveProviderResponse);
            }
            break;
          }
          case 'resetSettings': {
            try {
              await appCtx.providerManager.resetAll();
              await this.panel.webview.postMessage({
                type: 'resetSettingsResult',
                requestId: message.requestId,
                success: true,
              } satisfies ResetSettingsResponse);
              void vscode.window.showInformationMessage(
                'TokenGuard Copilot: All settings have been reset.',
              );
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'resetSettingsResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies ResetSettingsResponse);
            }
            break;
          }
          case 'getModels': {
            const models = appCtx.modelRegistry.getModels();
            await this.panel.webview.postMessage({
              type: 'getModelsResult',
              requestId: message.requestId,
              models,
            } satisfies GetModelsResponse);
            break;
          }
          case 'fetchAvailableModels': {
            try {
              const models = await appCtx.modelRegistry.fetchModels(message.providerId);
              await this.panel.webview.postMessage({
                type: 'fetchAvailableModelsResult',
                requestId: message.requestId,
                success: true,
                models,
              } satisfies FetchAvailableModelsResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'fetchAvailableModelsResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies FetchAvailableModelsResponse);
            }
            break;
          }
          case 'addModel': {
            try {
              const model = appCtx.modelRegistry.addModel(
                message.providerId,
                message.modelId,
                message.config,
              );
              await this.panel.webview.postMessage({
                type: 'addModelResult',
                requestId: message.requestId,
                success: true,
                model,
              } satisfies AddModelResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'addModelResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies AddModelResponse);
            }
            break;
          }
          case 'editModel': {
            try {
              const model = appCtx.modelRegistry.updateModel(
                message.providerId,
                message.modelId,
                message.config,
              );
              await this.panel.webview.postMessage({
                type: 'editModelResult',
                requestId: message.requestId,
                success: true,
                model,
              } satisfies EditModelResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'editModelResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies EditModelResponse);
            }
            break;
          }
          case 'removeModel': {
            try {
              appCtx.modelRegistry.removeModel(message.providerId, message.modelId);
              await this.panel.webview.postMessage({
                type: 'removeModelResult',
                requestId: message.requestId,
                success: true,
              } satisfies RemoveModelResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'removeModelResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies RemoveModelResponse);
            }
            break;
          }
          case 'getModelDefaults': {
            const defaults = getDefaults(message.modelId);
            await this.panel.webview.postMessage({
              type: 'getModelDefaultsResult',
              requestId: message.requestId,
              defaults,
            } satisfies GetModelDefaultsResponse);
            break;
          }
          case 'getChatDebugSettings': {
            const settings = appCtx.chatDebugSettings.getSettings();
            await this.panel.webview.postMessage({
              type: 'getChatDebugSettingsResult',
              requestId: message.requestId,
              settings,
            } satisfies GetChatDebugSettingsResponse);
            break;
          }
          case 'updateChatDebugSettings': {
            try {
              const settings = appCtx.chatDebugSettings.updateSettings({
                enabled: message.enabled,
                ttlHours: message.ttlHours,
              });
              await this.panel.webview.postMessage({
                type: 'updateChatDebugSettingsResult',
                requestId: message.requestId,
                success: true,
                settings,
              } satisfies UpdateChatDebugSettingsResponse);
              if (message.enabled !== undefined) {
                void vscode.commands.executeCommand(
                  'setContext',
                  'tokenguard-copilot.chatDebugEnabled',
                  settings.enabled,
                );
              }
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'updateChatDebugSettingsResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies UpdateChatDebugSettingsResponse);
            }
            break;
          }
          case 'clearChatDebugLogs': {
            try {
              appCtx.chatDebugCleanup.clearAll();
              await this.panel.webview.postMessage({
                type: 'clearChatDebugLogsResult',
                requestId: message.requestId,
                success: true,
              } satisfies ClearChatDebugLogsResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'clearChatDebugLogsResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies ClearChatDebugLogsResponse);
            }
            break;
          }
          case 'getContentRules': {
            const rules = appCtx.contentRules.getAll();
            await this.panel.webview.postMessage({
              type: 'getContentRulesResult',
              requestId: message.requestId,
              rules: rules.map((r) => SettingsPanel.toContentRuleInfo(r)),
            } satisfies GetContentRulesResponse);
            break;
          }
          case 'getContentRule': {
            const rule = appCtx.contentRules.getById(message.id);
            await this.panel.webview.postMessage({
              type: 'getContentRuleResult',
              requestId: message.requestId,
              rule: rule ? SettingsPanel.toContentRuleInfo(rule) : null,
            } satisfies GetContentRuleResponse);
            break;
          }
          case 'addContentRule': {
            try {
              const validationError = SettingsPanel.validateContentRuleParams(
                message.params,
                (name, excludeId) => appCtx.contentRules.validateName(name, excludeId),
              );
              if (validationError) {
                await this.panel.webview.postMessage({
                  type: 'addContentRuleResult',
                  requestId: message.requestId,
                  success: false,
                  error: validationError,
                } satisfies AddContentRuleResponse);
                break;
              }
              const rule = appCtx.contentRules.create({
                ...message.params,
                enabled: message.params.enabled ? 1 : 0,
              });
              await this.panel.webview.postMessage({
                type: 'addContentRuleResult',
                requestId: message.requestId,
                success: true,
                rule: SettingsPanel.toContentRuleInfo(rule),
              } satisfies AddContentRuleResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'addContentRuleResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies AddContentRuleResponse);
            }
            break;
          }
          case 'updateContentRule': {
            try {
              // Validate name uniqueness if name is being changed
              if (message.params.name !== undefined) {
                const name = message.params.name.trim();
                if (name.length === 0) {
                  await this.panel.webview.postMessage({
                    type: 'updateContentRuleResult',
                    requestId: message.requestId,
                    success: false,
                    error: 'Name is required.',
                  } satisfies UpdateContentRuleResponse);
                  break;
                }
                if (appCtx.contentRules.validateName(name, message.id)) {
                  await this.panel.webview.postMessage({
                    type: 'updateContentRuleResult',
                    requestId: message.requestId,
                    success: false,
                    error: `A content rule with the name "${name}" already exists.`,
                  } satisfies UpdateContentRuleResponse);
                  break;
                }
              }
              // Validate regex pattern if changed
              if (message.params.regexPattern !== undefined) {
                try {
                  new RegExp(message.params.regexPattern);
                } catch {
                  await this.panel.webview.postMessage({
                    type: 'updateContentRuleResult',
                    requestId: message.requestId,
                    success: false,
                    error: 'Invalid regex pattern.',
                  } satisfies UpdateContentRuleResponse);
                  break;
                }
              }
              // Validate regex flags if changed
              if (message.params.regexFlags !== undefined) {
                if (!/^[gims]*$/.test(message.params.regexFlags)) {
                  await this.panel.webview.postMessage({
                    type: 'updateContentRuleResult',
                    requestId: message.requestId,
                    success: false,
                    error: 'Invalid regex flags. Only g, i, m, s are allowed.',
                  } satisfies UpdateContentRuleResponse);
                  break;
                }
              }
              // Validate match role if changed
              if (
                message.params.matchRole !== undefined &&
                !['system', 'user', 'all'].includes(message.params.matchRole)
              ) {
                await this.panel.webview.postMessage({
                  type: 'updateContentRuleResult',
                  requestId: message.requestId,
                  success: false,
                  error: 'Match role must be "system", "user", or "all".',
                } satisfies UpdateContentRuleResponse);
                break;
              }
              // Validate match message number if changed
              if (
                message.params.matchMessageNumber !== undefined &&
                message.params.matchMessageNumber !== null
              ) {
                if (
                  typeof message.params.matchMessageNumber !== 'number' ||
                  !Number.isInteger(message.params.matchMessageNumber) ||
                  message.params.matchMessageNumber < 0
                ) {
                  await this.panel.webview.postMessage({
                    type: 'updateContentRuleResult',
                    requestId: message.requestId,
                    success: false,
                    error: 'Match message number must be a non-negative integer.',
                  } satisfies UpdateContentRuleResponse);
                  break;
                }
              }
              // Validate match content pattern if changed
              if (
                message.params.matchContentPattern !== undefined &&
                message.params.matchContentPattern !== null &&
                message.params.matchContentPattern.length > 0
              ) {
                try {
                  const flags = message.params.regexFlags ?? '';
                  new RegExp(message.params.matchContentPattern, flags);
                } catch {
                  await this.panel.webview.postMessage({
                    type: 'updateContentRuleResult',
                    requestId: message.requestId,
                    success: false,
                    error: 'Invalid match content pattern.',
                  } satisfies UpdateContentRuleResponse);
                  break;
                }
              }

              const changes: Record<string, unknown> = { ...message.params };
              if (message.params.enabled !== undefined) {
                changes.enabled = message.params.enabled ? 1 : 0;
              }
              const rule = appCtx.contentRules.update(message.id, changes);
              if (!rule) {
                await this.panel.webview.postMessage({
                  type: 'updateContentRuleResult',
                  requestId: message.requestId,
                  success: false,
                  error: 'Content rule not found.',
                } satisfies UpdateContentRuleResponse);
                break;
              }
              await this.panel.webview.postMessage({
                type: 'updateContentRuleResult',
                requestId: message.requestId,
                success: true,
                rule: SettingsPanel.toContentRuleInfo(rule),
              } satisfies UpdateContentRuleResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'updateContentRuleResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies UpdateContentRuleResponse);
            }
            break;
          }
          case 'deleteContentRule': {
            try {
              const deleted = appCtx.contentRules.delete(message.id);
              if (!deleted) {
                await this.panel.webview.postMessage({
                  type: 'deleteContentRuleResult',
                  requestId: message.requestId,
                  success: false,
                  error: 'Content rule not found.',
                } satisfies DeleteContentRuleResponse);
                break;
              }
              await this.panel.webview.postMessage({
                type: 'deleteContentRuleResult',
                requestId: message.requestId,
                success: true,
              } satisfies DeleteContentRuleResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'deleteContentRuleResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies DeleteContentRuleResponse);
            }
            break;
          }
          case 'reorderContentRules': {
            try {
              appCtx.contentRules.reorder(message.orderedIds);
              const rules = appCtx.contentRules.getAll();
              await this.panel.webview.postMessage({
                type: 'reorderContentRulesResult',
                requestId: message.requestId,
                success: true,
                rules: rules.map((r) => SettingsPanel.toContentRuleInfo(r)),
              } satisfies ReorderContentRulesResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'reorderContentRulesResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies ReorderContentRulesResponse);
            }
            break;
          }
          case 'getUsageStats': {
            const filter = {
              providerId: message.providerIds?.length === 1 ? message.providerIds[0] : undefined,
              modelId: message.modelIds?.length === 1 ? message.modelIds[0] : undefined,
              dateFrom: periodToDateFrom(message.period),
              dateTo: periodToDateTo(message.period),
            };
            const records = appCtx.usageTracker.getStats(filter);

            // If multiple providers/models are selected,
            // filter in-memory (the repo only supports
            // single ID).
            let filtered = records;
            if (message.providerIds && message.providerIds.length > 1) {
              filtered = filtered.filter((r) => message.providerIds!.includes(r.providerId));
            }
            if (message.modelIds && message.modelIds.length > 1) {
              filtered = filtered.filter((r) => message.modelIds!.includes(r.modelId));
            }

            const summary = computeSummary(filtered, appCtx);

            const usageRecords = filtered.map((r) => ({
              providerId: r.providerId,
              modelId: r.modelId,
              date: r.date,
              promptTokens: r.promptTokens,
              completionTokens: r.completionTokens,
              cachedTokens: r.cachedTokens,
              reasoningTokens: r.reasoningTokens,
              requestCount: r.requestCount,
              errorCount: r.errorCount,
              promptTokensCost: r.promptTokensCost,
              completionTokensCost: r.completionTokensCost,
              cachedTokensCost: r.cachedTokensCost,
            }));

            await this.panel.webview.postMessage({
              type: 'getUsageStatsResult',
              requestId: message.requestId,
              records: usageRecords,
              summary,
            } satisfies GetUsageStatsResponse);
            break;
          }
          case 'resetUsageStats': {
            try {
              const scope =
                message.scope === 'all'
                  ? ({ scope: 'all' } as const)
                  : message.scope === 'provider'
                    ? ({
                        scope: 'provider' as const,
                        providerId: message.providerId!,
                      } as const)
                    : ({
                        scope: 'model' as const,
                        providerId: message.providerId!,
                        modelId: message.modelId!,
                      } as const);
              appCtx.usageTracker.resetStats(scope);
              await this.panel.webview.postMessage({
                type: 'resetUsageStatsResult',
                requestId: message.requestId,
                success: true,
              } satisfies ResetUsageStatsResponse);
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              await this.panel.webview.postMessage({
                type: 'resetUsageStatsResult',
                requestId: message.requestId,
                success: false,
                error: errorMsg,
              } satisfies ResetUsageStatsResponse);
            }
            break;
          }
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
  public static createOrShow(extensionUri: vscode.Uri, appCtx: AppContext): SettingsPanel {
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

    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'assets', 'icon', 'icon_24_light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'assets', 'icon', 'icon_24_dark.svg'),
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

  /**
   * Validates content rule parameters.
   *
   * @param params - The rule parameters to validate.
   * @param existingName - Function to check if a name already
   *   exists (receives name and optional exclude ID).
   * @param excludeId - Optional rule ID to exclude from name
   *   uniqueness check (for updates).
   * @returns An error message string, or null if valid.
   */
  private static validateContentRuleParams(
    params: {
      name: string;
      regexPattern: string;
      regexFlags: string;
      matchRole?: string;
      matchMessageNumber?: number | null;
      matchContentPattern?: string | null;
    },
    existingName: (name: string, excludeId?: string) => boolean,
    excludeId?: string,
  ): string | null {
    if (!params.name || params.name.trim().length === 0) {
      return 'Name is required.';
    }
    if (existingName(params.name.trim(), excludeId)) {
      return `A content rule with the name "${params.name.trim()}" already exists.`;
    }
    try {
      new RegExp(params.regexPattern);
    } catch {
      return 'Invalid regex pattern.';
    }
    if (!/^[gims]*$/.test(params.regexFlags)) {
      return 'Invalid regex flags. Only g, i, m, s are allowed.';
    }
    if (params.matchRole != null && !['system', 'user', 'all'].includes(params.matchRole)) {
      return 'Match role must be "system", "user", or "all".';
    }
    if (params.matchMessageNumber != null) {
      if (
        typeof params.matchMessageNumber !== 'number' ||
        !Number.isInteger(params.matchMessageNumber) ||
        params.matchMessageNumber < 0
      ) {
        return 'Match message number must be a non-negative integer.';
      }
    }
    if (params.matchContentPattern != null && params.matchContentPattern.length > 0) {
      try {
        new RegExp(params.matchContentPattern, params.regexFlags);
      } catch {
        return 'Invalid match content pattern.';
      }
    }
    return null;
  }

  /**
   * Converts a DB content rule row to the webview-friendly
   * {@link ContentRuleInfo} shape.
   *
   * @param rule - The DB content rule row.
   * @returns The content rule info for the webview.
   */
  private static toContentRuleInfo(rule: ContentRule): ContentRuleInfo {
    return {
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled === 1,
      matchRole: (rule.matchRole as 'system' | 'user' | 'all' | undefined) ?? 'all',
      matchMessageNumber: rule.matchMessageNumber,
      matchModelPattern: rule.matchModelPattern,
      matchContentPattern: rule.matchContentPattern,
      matchToolPresent:
        rule.matchToolPresent === null ? null : safeParseJsonArray(rule.matchToolPresent),
      matchToolAbsent:
        rule.matchToolAbsent === null ? null : safeParseJsonArray(rule.matchToolAbsent),
      regexPattern: rule.regexPattern,
      regexFlags: rule.regexFlags,
      substitution: rule.substitution,
      sortOrder: rule.sortOrder,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  /**
   * Builds the HTML content for the webview.
   *
   * Reads the HTML template from assets/webview/settings.html and
   * interpolates dynamic placeholders (nonce, script URI, style URIs,
   * CSP source).
   *
   * @param webview - The webview to generate HTML for.
   * @returns The full HTML string for the webview.
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'settings-app.js'),
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'settings-app.css'),
    );

    const codiconStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'codicon.css'),
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
      .replaceAll('{{styleUri}}', styleUri.toString())
      .replaceAll('{{codiconStyleUri}}', codiconStyleUri.toString())
      .replaceAll('{{cspSource}}', webview.cspSource);
  }
}

/**
 * Converts a period string to a dateFrom ISO string.
 *
 * @param period - The period identifier.
 * @returns ISO date string or undefined for "all".
 */
function periodToDateFrom(period?: string): string | undefined {
  const now = new Date();
  switch (period) {
    case 'today':
      return now.toISOString().slice(0, 10);
    case 'last24h': {
      const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    }
    case 'last7d': {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    }
    case 'last30d': {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    }
    default:
      return undefined;
  }
}

/**
 * Converts a period string to a dateTo ISO string.
 *
 * @param period - The period identifier.
 * @returns ISO date string or undefined for "all".
 */
function periodToDateTo(period?: string): string | undefined {
  if (!period || period === 'all') return undefined;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Computes a usage summary from filtered records.
 *
 * @param records - Filtered usage records.
 * @param appCtx - Application context for model lookups
 *   and provider/model names.
 * @returns Aggregated summary with per-model breakdown
 *   and entity filter info maps.
 */
function computeSummary(records: UsageRecord[], appCtx: AppContext): UsageStatsSummary {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCachedTokens = 0;
  let totalReasoningTokens = 0;
  let totalRequestCount = 0;
  let totalErrorCount = 0;
  let totalPromptTokensCost = 0;
  let totalCompletionTokensCost = 0;
  let totalCachedTokensCost = 0;

  const allProviders = appCtx.providerManager.getAllProvidersWithStatus();
  const providerNameMap = new Map(allProviders.map((p) => [p.id, p.name]));

  const perModel = new Map<
    string,
    {
      providerId: string;
      modelId: string;
      displayName: string | null;
      inputCostPer1m: number | null;
      outputCostPer1m: number | null;
      cachedInputCostPer1m: number | null;
      promptTokens: number;
      completionTokens: number;
      cachedTokens: number;
      reasoningTokens: number;
      promptTokensCost: number;
      completionTokensCost: number;
      cachedTokensCost: number;
    }
  >();

  for (const r of records) {
    totalPromptTokens += r.promptTokens;
    totalCompletionTokens += r.completionTokens;
    totalCachedTokens += r.cachedTokens;
    totalReasoningTokens += r.reasoningTokens;
    totalRequestCount += r.requestCount;
    totalErrorCount += r.errorCount;
    totalPromptTokensCost += r.promptTokensCost;
    totalCompletionTokensCost += r.completionTokensCost;
    totalCachedTokensCost += r.cachedTokensCost;

    const key = `${r.providerId}:${r.modelId}`;
    const existing = perModel.get(key);
    if (existing) {
      existing.promptTokens += r.promptTokens;
      existing.completionTokens += r.completionTokens;
      existing.cachedTokens += r.cachedTokens;
      existing.reasoningTokens += r.reasoningTokens;
      existing.promptTokensCost += r.promptTokensCost;
      existing.completionTokensCost += r.completionTokensCost;
      existing.cachedTokensCost += r.cachedTokensCost;
    } else {
      const allModels = appCtx.modelRegistry.getAllModels(r.providerId);
      const model = allModels.find((m) => m.id === r.modelId);
      perModel.set(key, {
        providerId: r.providerId,
        modelId: r.modelId,
        displayName:
          model?.displayName ?? `${providerNameMap.get(r.providerId) ?? r.providerId}/${r.modelId}`,
        inputCostPer1m: model?.inputCostPer1m ?? null,
        outputCostPer1m: model?.outputCostPer1m ?? null,
        cachedInputCostPer1m: model?.cachedInputCostPer1m ?? null,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        cachedTokens: r.cachedTokens,
        reasoningTokens: r.reasoningTokens,
        promptTokensCost: r.promptTokensCost,
        completionTokensCost: r.completionTokensCost,
        cachedTokensCost: r.cachedTokensCost,
      });
    }
  }

  // Build provider names map (all providers including removed
  // that have usage data).
  const providerNames: Record<string, { name: string; removed: boolean }> = {};
  const providerIdsInRecords = new Set(records.map((r) => r.providerId));
  for (const p of allProviders) {
    if (providerIdsInRecords.has(p.id)) {
      providerNames[p.id] = {
        name: p.name,
        removed: p.removed,
      };
    }
  }

  // Build model names map (all models including removed that
  // have usage data).
  const modelNames: Record<string, { name: string; removed: boolean }> = {};
  const allModelsWithStatus = appCtx.modelRegistry.getAllModelsWithStatus();
  const modelKeysInRecords = new Set(records.map((r) => `${r.providerId}:${r.modelId}`));
  for (const m of allModelsWithStatus) {
    const key = `${m.providerId}:${m.id}`;
    if (modelKeysInRecords.has(key)) {
      modelNames[key] = {
        name: m.displayName ?? `${providerNameMap.get(m.providerId) ?? m.providerId}/${m.id}`,
        removed: m.removed,
      };
    }
  }

  return {
    totalPromptTokens,
    totalCompletionTokens,
    totalCachedTokens,
    totalReasoningTokens,
    totalRequestCount,
    totalErrorCount,
    totalEstimatedCost: totalPromptTokensCost + totalCompletionTokensCost + totalCachedTokensCost,
    providerNames,
    modelNames,
    perModelBreakdown: [...perModel.values()],
  };
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
