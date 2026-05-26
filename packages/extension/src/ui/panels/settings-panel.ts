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
} from '@tokenguard/shared';
import type { UsageRecord } from '../../db/schema.js';

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
              estimatedCost: r.estimatedCost,
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
  let totalEstimatedCost = 0;

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
      estimatedCost: number;
    }
  >();

  for (const r of records) {
    totalPromptTokens += r.promptTokens;
    totalCompletionTokens += r.completionTokens;
    totalCachedTokens += r.cachedTokens;
    totalReasoningTokens += r.reasoningTokens;
    totalRequestCount += r.requestCount;
    totalErrorCount += r.errorCount;
    totalEstimatedCost += r.estimatedCost;

    const key = `${r.providerId}:${r.modelId}`;
    const existing = perModel.get(key);
    if (existing) {
      existing.promptTokens += r.promptTokens;
      existing.completionTokens += r.completionTokens;
      existing.cachedTokens += r.cachedTokens;
      existing.reasoningTokens += r.reasoningTokens;
      existing.estimatedCost += r.estimatedCost;
    } else {
      const allModels = appCtx.modelRegistry.getAllModels(r.providerId);
      const model = allModels.find((m) => m.id === r.modelId);
      perModel.set(key, {
        providerId: r.providerId,
        modelId: r.modelId,
        displayName: model?.displayName ?? r.modelId,
        inputCostPer1m: model?.inputCostPer1m ?? null,
        outputCostPer1m: model?.outputCostPer1m ?? null,
        cachedInputCostPer1m: model?.cachedInputCostPer1m ?? null,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        cachedTokens: r.cachedTokens,
        reasoningTokens: r.reasoningTokens,
        estimatedCost: r.estimatedCost,
      });
    }
  }

  // Build provider names map (all providers including removed
  // that have usage data).
  const providerNames: Record<string, { name: string; removed: boolean }> = {};
  const allProviders = appCtx.providerManager.getAllProvidersWithStatus();
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
        name: m.displayName ?? m.id,
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
    totalEstimatedCost,
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
