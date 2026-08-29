import { isQwen37OrOlder, type ModelDefaultsResult } from '@tokenguard/shared';

/**
 * Subsection of a models.dev model entry used for defaults.
 *
 * All fields are optional — models.dev entries do not
 * guarantee every property.
 */
export interface ModelsDevModel {
  /** Context / output token limits. */
  limit?: {
    /** Maximum context window size in tokens. */
    context?: number;
    /** Maximum output tokens. */
    output?: number;
  };
  /** Cost in dollars per 1M tokens. */
  cost?: {
    /** Cost per 1M input tokens. */
    input?: number;
    /** Cost per 1M output tokens. */
    output?: number;
    /** Cost per 1M cached input tokens. */
    cache_read?: number;
  };
  /**
   * Whether the model reasons. May be a boolean or an
   * object with a `default_effort` hint.
   */
  reasoning?: boolean | { default_effort?: unknown };
  /** Reasoning configuration options (effort, budget). */
  reasoning_options?: Array<{
    type?: string;
    values?: string[];
  }>;
  /** Input/output modality lists. */
  modalities?: {
    input?: string[];
  };
}

/** Default cache control configuration for the Qwen 3.7 crutch. */
const QWEN_CACHE_CONTROL = { enabled: true, maxMarkers: 4 };

/**
 * Derives a {@link ModelDefaultsResult} from a models.dev
 * model entry. Fields present in the entry are set, plus
 * universal "crutch" defaults:
 *
 * - `preserveReasoning` is enabled for every model — reasoning
 *   tokens are kept across turns whenever a provider returns them.
 * - `cacheControl` is enabled for Qwen models of version 3.7 or
 *   older, which pair with the Alibaba-style request bodies.
 *
 * @param model - The models.dev model entry.
 * @param modelId - The model identifier (used for Qwen family
 *   detection; model entries do not carry the ID key).
 * @returns The derived defaults.
 */
export function deriveDefaults(model: ModelsDevModel, modelId: string): ModelDefaultsResult {
  const result: ModelDefaultsResult = {};

  const limit = model.limit;
  if (typeof limit?.context === 'number') {
    result.contextSize = limit.context;
  }
  if (typeof limit?.output === 'number') {
    result.maxTokens = limit.output;
  }

  const cost = model.cost;
  if (typeof cost?.input === 'number') {
    result.inputCostPer1M = cost.input;
  }
  if (typeof cost?.output === 'number') {
    result.outputCostPer1M = cost.output;
  }
  if (typeof cost?.cache_read === 'number') {
    result.cachedInputCostPer1M = cost.cache_read;
  }

  const capabilities: string[] = [];
  const inputs = model.modalities?.input;
  if (Array.isArray(inputs) && inputs.includes('image')) {
    capabilities.push('vision');
  }
  const effortOptions = Array.isArray(model.reasoning_options)
    ? model.reasoning_options.find(
        (option) => option?.type === 'effort' && Array.isArray(option.values),
      )
    : undefined;
  if (effortOptions !== undefined) {
    capabilities.push('reasoning_effort');
  }
  if (capabilities.length > 0) {
    result.supportedCapabilities = capabilities;
  }

  if (effortOptions?.values !== undefined) {
    const effortMap: Record<string, Record<string, unknown>> = {};
    for (const effort of effortOptions.values) {
      if (typeof effort === 'string' && effort.length > 0) {
        effortMap[effort] = { reasoning_effort: effort };
      }
    }
    if (Object.keys(effortMap).length > 0) {
      result.reasoningEffortMap = effortMap;
    }
  }

  // The object-form `reasoning` entry (with `default_effort`) is
  // only present in the models.dev dataset when a provider ships
  // it; the bundled snapshot currently carries only boolean
  // `reasoning` values, so this branch is exercised by tests and
  // future snapshots. For OpenRouter-backed models the
  // authoritative value comes from the provider `/models`
  // response's `reasoning.default_effort`.
  if (model.reasoning !== null && typeof model.reasoning === 'object') {
    const defaultEffort = model.reasoning.default_effort;
    if (typeof defaultEffort === 'string') {
      result.defaultReasoningEffort = defaultEffort;
    }
  }

  // Universal crutch: preserve reasoning by default for every
  // model, and enable prompt caching for Qwen ≤ 3.7.
  result.preserveReasoning = true;
  if (isQwen37OrOlder(modelId)) {
    result.cacheControl = QWEN_CACHE_CONTROL;
  }

  return result;
}
