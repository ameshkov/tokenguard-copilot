import type { UsageRecord } from '../../db/index.js';
import type { UsageStatsSummary, PerModelBreakdown, NamedEntityInfo } from '@tokenguard/shared';
import type { ExtensionContext as AppContext } from '../../context.js';

/**
 * Converts a period string to a dateFrom ISO string.
 *
 * @param period - The period identifier.
 * @returns ISO date string or undefined for "all".
 */
export function periodToDateFrom(period?: string): string | undefined {
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
export function periodToDateTo(period?: string): string | undefined {
  if (!period || period === 'all') return undefined;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Aggregates usage records into totals and per-model breakdown.
 *
 * @param records - The usage records to aggregate.
 * @param appCtx - Application context for model lookups.
 * @returns Totals and per-model breakdown.
 */
function aggregateUsageRecords(
  records: UsageRecord[],
  appCtx: AppContext,
): {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;
  totalRequestCount: number;
  totalErrorCount: number;
  totalPromptTokensCost: number;
  totalCompletionTokensCost: number;
  totalCachedTokensCost: number;
  perModelBreakdown: PerModelBreakdown[];
} {
  const allProviders = appCtx.providerManager.getAllProvidersWithStatus();
  const providerNameMap = new Map(allProviders.map((p) => [p.id, p.name]));

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCachedTokens = 0;
  let totalReasoningTokens = 0;
  let totalRequestCount = 0;
  let totalErrorCount = 0;
  let totalPromptTokensCost = 0;
  let totalCompletionTokensCost = 0;
  let totalCachedTokensCost = 0;

  const perModel = new Map<string, PerModelBreakdown>();

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

  return {
    totalPromptTokens,
    totalCompletionTokens,
    totalCachedTokens,
    totalReasoningTokens,
    totalRequestCount,
    totalErrorCount,
    totalPromptTokensCost,
    totalCompletionTokensCost,
    totalCachedTokensCost,
    perModelBreakdown: [...perModel.values()],
  };
}

/**
 * Builds a provider names map from usage records.
 *
 * Includes all providers that appear in the records,
 * including removed ones.
 *
 * @param records - The usage records.
 * @param appCtx - Application context for provider lookups.
 * @returns A map of provider ID to name and removed status.
 */
function buildProviderNamesMap(
  records: UsageRecord[],
  appCtx: AppContext,
): Record<string, NamedEntityInfo> {
  const providerNames: Record<string, NamedEntityInfo> = {};
  const providerIdsInRecords = new Set(records.map((r) => r.providerId));
  const allProviders = appCtx.providerManager.getAllProvidersWithStatus();

  for (const p of allProviders) {
    if (providerIdsInRecords.has(p.id)) {
      providerNames[p.id] = {
        name: p.name,
        removed: p.removed,
      };
    }
  }
  return providerNames;
}

/**
 * Builds a model names map from usage records.
 *
 * Includes all models that appear in the records,
 * including removed ones.
 *
 * @param records - The usage records.
 * @param appCtx - Application context for model lookups.
 * @returns A map of "providerId:modelId" key to name and
 *   removed status.
 */
function buildModelNamesMap(
  records: UsageRecord[],
  appCtx: AppContext,
): Record<string, NamedEntityInfo> {
  const modelNames: Record<string, NamedEntityInfo> = {};
  const modelKeysInRecords = new Set(records.map((r) => `${r.providerId}:${r.modelId}`));
  const allModelsWithStatus = appCtx.modelRegistry.getAllModelsWithStatus();
  const allProviders = appCtx.providerManager.getAllProvidersWithStatus();
  const providerNameMap = new Map(allProviders.map((p) => [p.id, p.name]));

  for (const m of allModelsWithStatus) {
    const key = `${m.providerId}:${m.id}`;
    if (modelKeysInRecords.has(key)) {
      modelNames[key] = {
        name: m.displayName ?? `${providerNameMap.get(m.providerId) ?? m.providerId}/${m.id}`,
        removed: m.removed,
      };
    }
  }
  return modelNames;
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
export function computeSummary(records: UsageRecord[], appCtx: AppContext): UsageStatsSummary {
  const aggregated = aggregateUsageRecords(records, appCtx);
  const providerNames = buildProviderNamesMap(records, appCtx);
  const modelNames = buildModelNamesMap(records, appCtx);

  return {
    totalPromptTokens: aggregated.totalPromptTokens,
    totalCompletionTokens: aggregated.totalCompletionTokens,
    totalCachedTokens: aggregated.totalCachedTokens,
    totalReasoningTokens: aggregated.totalReasoningTokens,
    totalRequestCount: aggregated.totalRequestCount,
    totalErrorCount: aggregated.totalErrorCount,
    totalEstimatedCost:
      aggregated.totalPromptTokensCost +
      aggregated.totalCompletionTokensCost +
      aggregated.totalCachedTokensCost,
    providerNames,
    modelNames,
    perModelBreakdown: aggregated.perModelBreakdown,
  };
}
