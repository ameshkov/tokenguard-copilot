import { type Webview, commands } from 'vscode';
import type { ExtensionContext as AppContext } from '../../context.js';
import type {
  WebviewCommand,
  AddContentRuleParams,
  GetChatDebugSettingsResponse,
  UpdateChatDebugSettingsResponse,
  ClearChatDebugLogsResponse,
  GetUsageStatsResponse,
  ResetUsageStatsResponse,
  GetContentRulesResponse,
  GetContentRuleResponse,
  AddContentRuleResponse,
  UpdateContentRuleResponse,
  DeleteContentRuleResponse,
  ReorderContentRulesResponse,
} from '@tokenguard/shared';
import { errorMessage } from './message-handler-core.js';
import { toContentRuleInfo, validateContentRuleParams } from './content-rule-helpers.js';
import { computeSummary, periodToDateFrom, periodToDateTo } from './usage-helpers.js';

// ── Update content rule validation helper ──────────────────

/**
 * Validates the fields of an updateContentRule request.
 *
 * Only checks fields that are present in the partial params.
 *
 * @param params - The partial update parameters.
 * @param ruleId - The ID of the rule being updated (for name
 *   uniqueness exclusion).
 * @param validateName - Function to check name uniqueness.
 * @returns An error message string, or null if valid.
 */
function validateUpdateContentRuleFields(
  params: Partial<AddContentRuleParams>,
  ruleId: string,
  validateName: (name: string, excludeId?: string) => boolean,
): string | null {
  // Validate name uniqueness if name is being changed
  if (params.name !== undefined) {
    const name = params.name.trim();
    if (name.length === 0) {
      return 'Name is required.';
    }
    if (validateName(name, ruleId)) {
      return `A content rule with the name "${name}" already exists.`;
    }
  }
  // Validate regex pattern if changed
  if (params.regexPattern !== undefined) {
    try {
      new RegExp(params.regexPattern);
    } catch {
      return 'Invalid regex pattern.';
    }
  }
  // Validate regex flags if changed
  if (params.regexFlags !== undefined) {
    if (!/^[gims]*$/.test(params.regexFlags)) {
      return 'Invalid regex flags. Only g, i, m, s are allowed.';
    }
  }
  // Validate match role if changed
  if (params.matchRole !== undefined && !['system', 'user', 'all'].includes(params.matchRole)) {
    return 'Match role must be "system", "user", or "all".';
  }
  // Validate match message number if changed
  if (params.matchMessageNumber !== undefined && params.matchMessageNumber !== null) {
    if (
      typeof params.matchMessageNumber !== 'number' ||
      !Number.isInteger(params.matchMessageNumber) ||
      params.matchMessageNumber < 0
    ) {
      return 'Match message number must be a non-negative integer.';
    }
  }
  // Validate match content pattern if changed
  if (
    params.matchContentPattern !== undefined &&
    params.matchContentPattern !== null &&
    params.matchContentPattern.length > 0
  ) {
    try {
      const flags = params.regexFlags ?? '';
      new RegExp(params.matchContentPattern, flags);
    } catch {
      return 'Invalid match content pattern.';
    }
  }
  return null;
}

// ── Debug handlers ─────────────────────────────────────────

/**
 * Handles the getChatDebugSettings webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleGetChatDebugSettings(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'getChatDebugSettings' }>,
): Promise<void> {
  const settings = appCtx.chatDebugSettings.getSettings();
  await webview.postMessage({
    type: 'getChatDebugSettingsResult',
    requestId: message.requestId,
    settings,
  } satisfies GetChatDebugSettingsResponse);
}

/**
 * Handles the updateChatDebugSettings webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleUpdateChatDebugSettings(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'updateChatDebugSettings' }>,
): Promise<void> {
  try {
    const settings = appCtx.chatDebugSettings.updateSettings({
      enabled: message.enabled,
      ttlHours: message.ttlHours,
    });
    await webview.postMessage({
      type: 'updateChatDebugSettingsResult',
      requestId: message.requestId,
      success: true,
      settings,
    } satisfies UpdateChatDebugSettingsResponse);
    if (message.enabled !== undefined) {
      void commands.executeCommand(
        'setContext',
        'tokenguard-copilot.chatDebugEnabled',
        settings.enabled,
      );
    }
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'updateChatDebugSettingsResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies UpdateChatDebugSettingsResponse);
  }
}

/**
 * Handles the clearChatDebugLogs webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleClearChatDebugLogs(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'clearChatDebugLogs' }>,
): Promise<void> {
  try {
    appCtx.chatDebugCleanup.clearAll();
    await webview.postMessage({
      type: 'clearChatDebugLogsResult',
      requestId: message.requestId,
      success: true,
    } satisfies ClearChatDebugLogsResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'clearChatDebugLogsResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies ClearChatDebugLogsResponse);
  }
}

// ── Content rule handlers ──────────────────────────────────

/**
 * Handles the getContentRules webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleGetContentRules(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'getContentRules' }>,
): Promise<void> {
  const rules = appCtx.contentRules.getAll();
  await webview.postMessage({
    type: 'getContentRulesResult',
    requestId: message.requestId,
    rules: rules.map((r) => toContentRuleInfo(r)),
  } satisfies GetContentRulesResponse);
}

/**
 * Handles the getContentRule webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleGetContentRule(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'getContentRule' }>,
): Promise<void> {
  const rule = appCtx.contentRules.getById(message.id);
  await webview.postMessage({
    type: 'getContentRuleResult',
    requestId: message.requestId,
    rule: rule ? toContentRuleInfo(rule) : null,
  } satisfies GetContentRuleResponse);
}

/**
 * Handles the addContentRule webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleAddContentRule(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'addContentRule' }>,
): Promise<void> {
  try {
    const validationError = validateContentRuleParams(message.params, (name, excludeId) =>
      appCtx.contentRules.validateName(name, excludeId),
    );
    if (validationError) {
      await webview.postMessage({
        type: 'addContentRuleResult',
        requestId: message.requestId,
        success: false,
        error: validationError,
      } satisfies AddContentRuleResponse);
      return;
    }
    const rule = appCtx.contentRules.create({
      ...message.params,
      enabled: message.params.enabled ? 1 : 0,
    });
    await webview.postMessage({
      type: 'addContentRuleResult',
      requestId: message.requestId,
      success: true,
      rule: toContentRuleInfo(rule),
    } satisfies AddContentRuleResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'addContentRuleResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies AddContentRuleResponse);
  }
}

/**
 * Handles the updateContentRule webview message.
 *
 * Validates changed fields via
 * {@link validateUpdateContentRuleFields}, then applies
 * the partial update.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleUpdateContentRule(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'updateContentRule' }>,
): Promise<void> {
  try {
    const validationError = validateUpdateContentRuleFields(
      message.params,
      message.id,
      (name, excludeId) => appCtx.contentRules.validateName(name, excludeId),
    );
    if (validationError) {
      await webview.postMessage({
        type: 'updateContentRuleResult',
        requestId: message.requestId,
        success: false,
        error: validationError,
      } satisfies UpdateContentRuleResponse);
      return;
    }

    const changes: Record<string, unknown> = { ...message.params };
    if (message.params.enabled !== undefined) {
      changes.enabled = message.params.enabled ? 1 : 0;
    }
    const rule = appCtx.contentRules.update(message.id, changes);
    if (!rule) {
      await webview.postMessage({
        type: 'updateContentRuleResult',
        requestId: message.requestId,
        success: false,
        error: 'Content rule not found.',
      } satisfies UpdateContentRuleResponse);
      return;
    }
    await webview.postMessage({
      type: 'updateContentRuleResult',
      requestId: message.requestId,
      success: true,
      rule: toContentRuleInfo(rule),
    } satisfies UpdateContentRuleResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'updateContentRuleResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies UpdateContentRuleResponse);
  }
}

/**
 * Handles the deleteContentRule webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleDeleteContentRule(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'deleteContentRule' }>,
): Promise<void> {
  try {
    const deleted = appCtx.contentRules.delete(message.id);
    if (!deleted) {
      await webview.postMessage({
        type: 'deleteContentRuleResult',
        requestId: message.requestId,
        success: false,
        error: 'Content rule not found.',
      } satisfies DeleteContentRuleResponse);
      return;
    }
    await webview.postMessage({
      type: 'deleteContentRuleResult',
      requestId: message.requestId,
      success: true,
    } satisfies DeleteContentRuleResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'deleteContentRuleResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies DeleteContentRuleResponse);
  }
}

/**
 * Handles the reorderContentRules webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleReorderContentRules(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'reorderContentRules' }>,
): Promise<void> {
  try {
    appCtx.contentRules.reorder(message.orderedIds);
    const rules = appCtx.contentRules.getAll();
    await webview.postMessage({
      type: 'reorderContentRulesResult',
      requestId: message.requestId,
      success: true,
      rules: rules.map((r) => toContentRuleInfo(r)),
    } satisfies ReorderContentRulesResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'reorderContentRulesResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies ReorderContentRulesResponse);
  }
}

// ── Usage stats handlers ───────────────────────────────────

/**
 * Handles the getUsageStats webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleGetUsageStats(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'getUsageStats' }>,
): Promise<void> {
  const filter = {
    providerId: message.providerIds?.length === 1 ? message.providerIds[0] : undefined,
    modelId: message.modelIds?.length === 1 ? message.modelIds[0] : undefined,
    dateFrom: periodToDateFrom(message.period),
    dateTo: periodToDateTo(message.period),
  };
  const records = appCtx.usageTracker.getStats(filter);

  // If multiple providers/models are selected,
  // filter in-memory (the repo only supports single ID).
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

  await webview.postMessage({
    type: 'getUsageStatsResult',
    requestId: message.requestId,
    records: usageRecords,
    summary,
  } satisfies GetUsageStatsResponse);
}

/**
 * Handles the resetUsageStats webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleResetUsageStats(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'resetUsageStats' }>,
): Promise<void> {
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
    await webview.postMessage({
      type: 'resetUsageStatsResult',
      requestId: message.requestId,
      success: true,
    } satisfies ResetUsageStatsResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'resetUsageStatsResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies ResetUsageStatsResponse);
  }
}
