import * as vscode from 'vscode';
import type { UsageRecordRepository } from '../../repositories/usage-record-repository.js';
import type { ModelRepository } from '../../repositories/model-repository.js';
import type { UsageRecord } from '../../db/schema.js';

/**
 * Token counts extracted from a chat completion
 * response.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

/**
 * Input to {@link UsageTracker.recordUsage}.
 */
export interface RecordUsageInput {
  /** Prompt tokens from the response. */
  promptTokens: number;
  /** Completion tokens from the response. */
  completionTokens: number;
  /** Cached prompt tokens. */
  cachedTokens: number;
  /** Reasoning tokens. */
  reasoningTokens: number;
  /** Whether the request succeeded. */
  success: boolean;
}

/**
 * Filter parameters for {@link UsageTracker.getStats}.
 */
export interface UsageStatsFilter {
  /** Provider ID filter (optional). */
  providerId?: string;
  /** Model ID filter (optional, requires providerId). */
  modelId?: string;
  /** Start date in ISO format (optional, inclusive). */
  dateFrom?: string;
  /** End date in ISO format (optional, inclusive). */
  dateTo?: string;
}

/**
 * Scope parameters for {@link UsageTracker.resetStats}.
 */
export interface ResetStatsScope {
  /** Reset scope. */
  scope: 'all' | 'provider' | 'model';
  /** Provider ID (required for 'provider' and 'model'). */
  providerId?: string;
  /** Model ID (required for 'model'). */
  modelId?: string;
}

/**
 * Computes the estimated cost for a single request.
 *
 * Uses the formula from the PRD:
 * ```
 * (promptTokens - cachedTokens) × inputCost / 1M
 *   + cachedTokens × cachedInputCost / 1M
 *   + completionTokens × outputCost / 1M
 * ```
 *
 * When `cachedInputCostPer1m` is `null`, falls back to
 * `inputCostPer1m`. When any cost value is `null`, it
 * is treated as 0.
 *
 * @param tokens - Token counts for this request.
 * @param inputCostPer1m - Input cost per 1M tokens, or
 *   null.
 * @param cachedInputCostPer1m - Cached input cost per 1M
 *   tokens, or null (falls back to inputCostPer1m).
 * @param outputCostPer1m - Output cost per 1M tokens, or
 *   null.
 * @returns Estimated cost in dollars.
 */
export function computeCost(
  tokens: TokenUsage,
  inputCostPer1m: number | null,
  cachedInputCostPer1m: number | null,
  outputCostPer1m: number | null,
): number {
  const inputRate = inputCostPer1m ?? 0;
  const outputRate = outputCostPer1m ?? 0;
  const cachedRate = cachedInputCostPer1m ?? inputRate;

  const nonCachedPrompt = tokens.promptTokens - tokens.cachedTokens;
  const promptCost = (nonCachedPrompt * inputRate) / 1_000_000;
  const cachedCost = (tokens.cachedTokens * cachedRate) / 1_000_000;
  const completionCost = (tokens.completionTokens * outputRate) / 1_000_000;

  return promptCost + cachedCost + completionCost;
}

/**
 * Tracks token usage and costs per model, aggregated daily.
 *
 * Provides query and reset APIs. Emits `onStatsChanged`
 * whenever usage data is modified.
 */
export class UsageTracker {
  private readonly emitter = new vscode.EventEmitter<void>();

  /** Fires after usage data is recorded or reset. */
  readonly onStatsChanged = this.emitter.event;

  /**
   * Creates a new UsageTracker.
   *
   * @param repo - Data-access layer for usage records.
   * @param modelRepo - Data-access layer for models (used
   *   to look up cost configuration).
   */
  constructor(
    private readonly repo: UsageRecordRepository,
    private readonly modelRepo: ModelRepository,
  ) {}

  /**
   * Records token usage for a single chat completion
   * request. Upserts the daily aggregate row for today's
   * date.
   *
   * When `success` is `false`, only the error count is
   * incremented — no tokens or cost are recorded.
   *
   * When `success` is `true` and token counts are all
   * zero, only the request count is incremented.
   *
   * @param providerId - The provider ID.
   * @param modelId - The model ID.
   * @param input - Token usage data.
   */
  recordUsage(providerId: string, modelId: string, input: RecordUsageInput): void {
    const today = new Date().toISOString().slice(0, 10);

    if (!input.success) {
      this.repo.upsert({
        providerId,
        modelId,
        date: today,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 0,
        errorCount: 1,
        estimatedCost: 0,
      });
      this.emitter.fire();
      return;
    }

    const model = this.modelRepo.findByKey(modelId, providerId);
    const cost = model
      ? computeCost(
          {
            promptTokens: input.promptTokens,
            completionTokens: input.completionTokens,
            cachedTokens: input.cachedTokens,
            reasoningTokens: input.reasoningTokens,
          },
          model.inputCostPer1m,
          model.cachedInputCostPer1m,
          model.outputCostPer1m,
        )
      : 0;

    this.repo.upsert({
      providerId,
      modelId,
      date: today,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      cachedTokens: input.cachedTokens,
      reasoningTokens: input.reasoningTokens,
      requestCount: 1,
      errorCount: 0,
      estimatedCost: cost,
    });
    this.emitter.fire();
  }

  /**
   * Convenience method to record a failed request.
   * Equivalent to calling {@link recordUsage} with
   * `success: false` and all token counts set to 0.
   *
   * @param providerId - The provider ID.
   * @param modelId - The model ID.
   */
  recordError(providerId: string, modelId: string): void {
    this.recordUsage(providerId, modelId, {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      success: false,
    });
  }

  /**
   * Returns usage records matching the given filters.
   *
   * All filter fields are optional. When omitted, the
   * corresponding dimension is not filtered.
   *
   * @param filter - Filter criteria.
   * @returns Array of matching usage records.
   */
  getStats(filter: UsageStatsFilter): UsageRecord[] {
    return this.repo.findByDateRange({
      providerId: filter.providerId,
      modelId: filter.modelId,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });
  }

  /**
   * Resets (deletes) usage stats according to the given
   * scope.
   *
   * @param scope - What to reset. Defaults to `{ scope:
   *   'all' }`.
   */
  resetStats(scope: ResetStatsScope = { scope: 'all' }): void {
    switch (scope.scope) {
      case 'all':
        this.repo.deleteAll();
        break;
      case 'provider': {
        if (!scope.providerId) {
          throw new Error('providerId is required for scope "provider"');
        }
        this.repo.deleteByProvider(scope.providerId);
        break;
      }
      case 'model': {
        if (!scope.providerId || !scope.modelId) {
          throw new Error('providerId and modelId are required for scope "model"');
        }
        this.repo.deleteByModel(scope.providerId, scope.modelId);
        break;
      }
    }
    this.emitter.fire();
  }
}
