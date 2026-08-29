import { describe, it, expect } from 'vitest';
import { deriveDefaults, type ModelsDevModel } from './derive-defaults.js';

const NON_QWEN_ID = 'acme/model-vision';

describe('deriveDefaults', () => {
  it('derives context, output, costs, and capabilities from a full entry', () => {
    const model: ModelsDevModel = {
      limit: { context: 200000, output: 8192 },
      cost: { input: 0.5, output: 1.5, cache_read: 0.05 },
      modalities: { input: ['text', 'image'] },
      reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
    };
    expect(deriveDefaults(model, NON_QWEN_ID)).toEqual({
      contextSize: 200000,
      maxTokens: 8192,
      inputCostPer1M: 0.5,
      outputCostPer1M: 1.5,
      cachedInputCostPer1M: 0.05,
      supportedCapabilities: ['vision', 'reasoning_effort'],
      reasoningEffortMap: {
        low: { reasoning_effort: 'low' },
        high: { reasoning_effort: 'high' },
      },
      preserveReasoning: true,
    });
  });

  it('derives defaultReasoningEffort from object-form reasoning', () => {
    const model: ModelsDevModel = {
      reasoning_options: [{ type: 'effort', values: ['minimal', 'high'] }],
      reasoning: { default_effort: 'high' },
    };
    expect(deriveDefaults(model, NON_QWEN_ID)).toEqual({
      supportedCapabilities: ['reasoning_effort'],
      reasoningEffortMap: {
        minimal: { reasoning_effort: 'minimal' },
        high: { reasoning_effort: 'high' },
      },
      defaultReasoningEffort: 'high',
      preserveReasoning: true,
    });
  });

  it('treats budget-only reasoning options as non-reasoning', () => {
    const model: ModelsDevModel = {
      reasoning_options: [{ type: 'budget_tokens' }],
    };
    expect(deriveDefaults(model, NON_QWEN_ID)).toEqual({ preserveReasoning: true });
  });

  it('restores Qwen toggle reasoning defaults from toggle-only entries', () => {
    const model: ModelsDevModel = {
      reasoning_options: [{ type: 'toggle' }],
    };
    expect(deriveDefaults(model, 'qwen3.7-max')).toEqual({
      supportedCapabilities: ['reasoning_effort'],
      reasoningEffortMap: {
        none: { enable_thinking: false },
        high: { enable_thinking: true, preserve_thinking: true },
      },
      defaultReasoningEffort: 'high',
      preserveReasoning: true,
      cacheControl: { enabled: true, maxMarkers: 4 },
    });
  });

  it('gives no reasoning effort defaults for boolean reasoning only', () => {
    const model: ModelsDevModel = { reasoning: true };
    expect(deriveDefaults(model, NON_QWEN_ID)).toEqual({ preserveReasoning: true });
  });

  it('ignores non-string and empty effort values', () => {
    const model: ModelsDevModel = {
      reasoning_options: [{ type: 'effort', values: ['low', '', 42 as unknown as string] }],
    };
    expect(deriveDefaults(model, NON_QWEN_ID)).toEqual({
      supportedCapabilities: ['reasoning_effort'],
      reasoningEffortMap: {
        low: { reasoning_effort: 'low' },
      },
      preserveReasoning: true,
    });
  });

  it('omits fields not present in the entry', () => {
    const model: ModelsDevModel = {
      limit: { context: 32000 },
      cost: { input: 0.1, output: 0.4 },
    };
    const result = deriveDefaults(model, NON_QWEN_ID);
    expect(result).toEqual({
      contextSize: 32000,
      inputCostPer1M: 0.1,
      outputCostPer1M: 0.4,
      preserveReasoning: true,
    });
    expect(result.maxTokens).toBeUndefined();
    expect(result.cachedInputCostPer1M).toBeUndefined();
    expect(result.supportedCapabilities).toBeUndefined();
    expect(result.reasoningEffortMap).toBeUndefined();
    expect(result.defaultReasoningEffort).toBeUndefined();
    expect(result.cacheControl).toBeUndefined();
  });

  it('returns an empty entry with preserve reasoning enabled by default', () => {
    expect(deriveDefaults({}, NON_QWEN_ID)).toEqual({ preserveReasoning: true });
  });

  it('enables prompt caching for Qwen 3.7 and older', () => {
    const model: ModelsDevModel = { limit: { context: 1000000 } };
    expect(deriveDefaults(model, 'qwen/qwen3.7-max')).toEqual({
      contextSize: 1000000,
      preserveReasoning: true,
      cacheControl: { enabled: true, maxMarkers: 4 },
    });
    expect(deriveDefaults(model, 'qwen3.6-plus').cacheControl).toEqual({
      enabled: true,
      maxMarkers: 4,
    });
    expect(deriveDefaults(model, 'alibaba/qwen3.5-flash').cacheControl).toEqual({
      enabled: true,
      maxMarkers: 4,
    });
    // The boundary is inclusive: bare "qwen3.7" is a 3.7 model.
    expect(deriveDefaults(model, 'qwen3.7').cacheControl).toEqual({
      enabled: true,
      maxMarkers: 4,
    });
  });

  it('does not enable prompt caching for Qwen 3.8 or non-Qwen models', () => {
    const model: ModelsDevModel = { limit: { context: 1000000 } };
    expect(deriveDefaults(model, 'qwen3.8-max').cacheControl).toBeUndefined();
    expect(deriveDefaults(model, 'gpt-5.4').cacheControl).toBeUndefined();
  });
});
