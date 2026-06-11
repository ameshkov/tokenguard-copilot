import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { periodToDateFrom, periodToDateTo, computeSummary } from './usage-helpers.js';
import type { UsageRecord } from '../../db/index.js';
import type { ExtensionContext as AppContext } from '../../context.js';
import type { ModelInfo } from '@tokenguard/shared';

/**
 * Creates a minimal mock UsageRecord for testing.
 */
function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: 1,
    providerId: 'provider-1',
    modelId: 'model-a',
    date: '2025-06-01',
    promptTokens: 100,
    completionTokens: 50,
    cachedTokens: 0,
    reasoningTokens: 0,
    requestCount: 1,
    errorCount: 0,
    promptTokensCost: 0.001,
    completionTokensCost: 0.002,
    cachedTokensCost: 0,
    ...overrides,
  };
}

/**
 * Creates a mock AppContext with providerManager and modelRegistry spies.
 */
function createMockAppCtx(overrides?: {
  providers?: ReturnType<typeof makeProviderWithStatus>[];
  models?: ModelInfo[];
  modelsWithStatus?: ReturnType<typeof makeModelWithStatus>[];
}): AppContext {
  return {
    providerManager: {
      getAllProvidersWithStatus: vi.fn().mockReturnValue(overrides?.providers ?? []),
    },
    modelRegistry: {
      getAllModels: vi.fn().mockReturnValue(overrides?.models ?? []),
      getAllModelsWithStatus: vi.fn().mockReturnValue(overrides?.modelsWithStatus ?? []),
    },
  } as unknown as AppContext;
}

function makeProviderWithStatus(id: string, name: string, removed = false) {
  return { id, name, removed, baseUrl: 'https://example.com/api' };
}

function makeModelWithStatus(
  providerId: string,
  modelId: string,
  displayName: string | null = null,
  removed = false,
) {
  return {
    id: modelId,
    providerId,
    displayName,
    removed,
    maxContextWindowTokens: 4096,
    maxOutputTokens: 1024,
    streaming: true,
    vision: false,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: true,
    inputCostPer1m: null,
    outputCostPer1m: null,
    cachedInputCostPer1m: null,
    cacheControl: null,
    customFields: null,
  };
}

function makeModelInfo(
  providerId: string,
  modelId: string,
  displayName: string | null = null,
  inputCostPer1m: number | null = null,
  outputCostPer1m: number | null = null,
  cachedInputCostPer1m: number | null = null,
): ModelInfo {
  return {
    id: modelId,
    providerId,
    displayName,
    maxContextWindowTokens: 4096,
    maxOutputTokens: 1024,
    streaming: true,
    vision: false,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: true,
    inputCostPer1m,
    outputCostPer1m,
    cachedInputCostPer1m,
    cacheControl: null,
    customFields: null,
  };
}

describe('periodToDateFrom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-11T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today when period is "today"', () => {
    expect(periodToDateFrom('today')).toBe('2025-06-11');
  });

  it('returns 24 hours ago when period is "last24h"', () => {
    expect(periodToDateFrom('last24h')).toBe('2025-06-10');
  });

  it('returns 7 days ago when period is "last7d"', () => {
    expect(periodToDateFrom('last7d')).toBe('2025-06-04');
  });

  it('returns 30 days ago when period is "last30d"', () => {
    expect(periodToDateFrom('last30d')).toBe('2025-05-12');
  });

  it('returns undefined when period is undefined', () => {
    expect(periodToDateFrom(undefined)).toBeUndefined();
  });

  it('returns undefined for unknown period strings', () => {
    expect(periodToDateFrom('unknown')).toBeUndefined();
  });

  it('returns undefined for "all"', () => {
    expect(periodToDateFrom('all')).toBeUndefined();
  });
});

describe('periodToDateTo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-11T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today for any non-empty period other than "all"', () => {
    expect(periodToDateTo('today')).toBe('2025-06-11');
    expect(periodToDateTo('last24h')).toBe('2025-06-11');
    expect(periodToDateTo('last7d')).toBe('2025-06-11');
    expect(periodToDateTo('last30d')).toBe('2025-06-11');
  });

  it('returns undefined when period is undefined', () => {
    expect(periodToDateTo(undefined)).toBeUndefined();
  });

  it('returns undefined when period is "all"', () => {
    expect(periodToDateTo('all')).toBeUndefined();
  });
});

describe('computeSummary', () => {
  it('returns zero totals for empty records', () => {
    const appCtx = createMockAppCtx();
    const summary = computeSummary([], appCtx);

    expect(summary.totalPromptTokens).toBe(0);
    expect(summary.totalCompletionTokens).toBe(0);
    expect(summary.totalCachedTokens).toBe(0);
    expect(summary.totalReasoningTokens).toBe(0);
    expect(summary.totalRequestCount).toBe(0);
    expect(summary.totalErrorCount).toBe(0);
    expect(summary.totalEstimatedCost).toBe(0);
    expect(summary.providerNames).toEqual({});
    expect(summary.modelNames).toEqual({});
    expect(summary.perModelBreakdown).toEqual([]);
  });

  it('aggregates a single record correctly', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OpenAI')],
      models: [makeModelInfo('provider-1', 'model-a', 'GPT-4')],
    });

    const records = [makeRecord()];
    const summary = computeSummary(records, appCtx);

    expect(summary.totalPromptTokens).toBe(100);
    expect(summary.totalCompletionTokens).toBe(50);
    expect(summary.totalRequestCount).toBe(1);
    expect(summary.totalEstimatedCost).toBeCloseTo(0.003);
    expect(summary.perModelBreakdown).toHaveLength(1);
    expect(summary.perModelBreakdown[0].providerId).toBe('provider-1');
    expect(summary.perModelBreakdown[0].modelId).toBe('model-a');
    expect(summary.perModelBreakdown[0].displayName).toBe('GPT-4');
  });

  it('aggregates multiple records for the same model', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OpenAI')],
      models: [makeModelInfo('provider-1', 'model-a', 'GPT-4')],
    });

    const records = [
      makeRecord({ id: 1, promptTokens: 100, completionTokens: 50 }),
      makeRecord({ id: 2, promptTokens: 200, completionTokens: 100 }),
    ];

    const summary = computeSummary(records, appCtx);

    expect(summary.totalPromptTokens).toBe(300);
    expect(summary.totalCompletionTokens).toBe(150);
    expect(summary.perModelBreakdown).toHaveLength(1);
    expect(summary.perModelBreakdown[0].promptTokens).toBe(300);
    expect(summary.perModelBreakdown[0].completionTokens).toBe(150);
  });

  it('aggregates records across different models', () => {
    const appCtx = createMockAppCtx({
      providers: [
        makeProviderWithStatus('provider-1', 'OpenAI'),
        makeProviderWithStatus('provider-2', 'Anthropic'),
      ],
      models: [
        makeModelInfo('provider-1', 'model-a', 'GPT-4'),
        makeModelInfo('provider-2', 'model-b', 'Claude'),
      ],
    });

    const records = [
      makeRecord({ id: 1, providerId: 'provider-1', modelId: 'model-a', promptTokens: 100 }),
      makeRecord({ id: 2, providerId: 'provider-2', modelId: 'model-b', promptTokens: 200 }),
    ];

    const summary = computeSummary(records, appCtx);

    expect(summary.totalPromptTokens).toBe(300);
    expect(summary.perModelBreakdown).toHaveLength(2);
  });

  it('builds providerNames map from records', () => {
    const appCtx = createMockAppCtx({
      providers: [
        makeProviderWithStatus('provider-1', 'OpenAI'),
        makeProviderWithStatus('provider-2', 'Anthropic'),
      ],
    });

    const records = [
      makeRecord({ providerId: 'provider-1', modelId: 'model-a' }),
      makeRecord({ providerId: 'provider-2', modelId: 'model-b' }),
    ];

    const summary = computeSummary(records, appCtx);

    expect(summary.providerNames).toEqual({
      'provider-1': { name: 'OpenAI', removed: false },
      'provider-2': { name: 'Anthropic', removed: false },
    });
  });

  it('includes removed providers in providerNames', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OldProvider', true)],
    });

    const records = [makeRecord({ providerId: 'provider-1' })];
    const summary = computeSummary(records, appCtx);

    expect(summary.providerNames['provider-1']).toEqual({
      name: 'OldProvider',
      removed: true,
    });
  });

  it('builds modelNames map from records', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OpenAI')],
      modelsWithStatus: [
        makeModelWithStatus('provider-1', 'model-a', 'GPT-4'),
        makeModelWithStatus('provider-1', 'model-b', 'GPT-3.5'),
      ],
    });

    const records = [
      makeRecord({ providerId: 'provider-1', modelId: 'model-a' }),
      makeRecord({ providerId: 'provider-1', modelId: 'model-b' }),
    ];

    const summary = computeSummary(records, appCtx);

    expect(summary.modelNames).toEqual({
      'provider-1:model-a': { name: 'GPT-4', removed: false },
      'provider-1:model-b': { name: 'GPT-3.5', removed: false },
    });
  });

  it('falls back to providerId/modelId when model has no displayName', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OpenAI')],
      models: [makeModelInfo('provider-1', 'model-a', null)],
    });

    const records = [makeRecord()];
    const summary = computeSummary(records, appCtx);

    expect(summary.perModelBreakdown[0].displayName).toBe('OpenAI/model-a');
  });

  it('falls back to providerId when provider name is not found', () => {
    const appCtx = createMockAppCtx({
      providers: [],
      models: [],
    });

    const records = [makeRecord()];
    const summary = computeSummary(records, appCtx);

    expect(summary.perModelBreakdown[0].displayName).toBe('provider-1/model-a');
  });

  it('includes cost info from model registry', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OpenAI')],
      models: [makeModelInfo('provider-1', 'model-a', 'GPT-4', 5, 15, 2.5)],
    });

    const records = [makeRecord()];
    const summary = computeSummary(records, appCtx);

    expect(summary.perModelBreakdown[0].inputCostPer1m).toBe(5);
    expect(summary.perModelBreakdown[0].outputCostPer1m).toBe(15);
    expect(summary.perModelBreakdown[0].cachedInputCostPer1m).toBe(2.5);
  });

  it('computes totalEstimatedCost from cost aggregates', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OpenAI')],
      models: [makeModelInfo('provider-1', 'model-a', 'GPT-4')],
    });

    const records = [
      makeRecord({
        promptTokensCost: 0.01,
        completionTokensCost: 0.02,
        cachedTokensCost: 0.005,
      }),
    ];

    const summary = computeSummary(records, appCtx);

    expect(summary.totalEstimatedCost).toBeCloseTo(0.035);
  });

  it('handles cached and reasoning tokens', () => {
    const appCtx = createMockAppCtx({
      providers: [makeProviderWithStatus('provider-1', 'OpenAI')],
      models: [makeModelInfo('provider-1', 'model-a', 'GPT-4')],
    });

    const records = [
      makeRecord({
        cachedTokens: 30,
        reasoningTokens: 20,
        cachedTokensCost: 0.001,
      }),
    ];

    const summary = computeSummary(records, appCtx);

    expect(summary.totalCachedTokens).toBe(30);
    expect(summary.totalReasoningTokens).toBe(20);
    expect(summary.perModelBreakdown[0].cachedTokens).toBe(30);
    expect(summary.perModelBreakdown[0].reasoningTokens).toBe(20);
  });
});
