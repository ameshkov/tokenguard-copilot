import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useModelConfigPreFill } from './use-model-config-prefill.js';
import type { ModelConfigPrefillSetters } from './use-model-config-prefill.js';
import type { FetchedModel, ModelDefaultsResult, ModelInfo } from '@tokenguard/shared';

function TestWrapper(props: {
  editingModel?: ModelInfo;
  fetchedModel?: FetchedModel;
  defaults?: ModelDefaultsResult | null;
  onFieldsSet?: (prefilled: Record<string, string>) => void;
}) {
  const setters: ModelConfigPrefillSetters = {
    setDisplayName: vi.fn(),
    setMaxContextWindowTokens: vi.fn(),
    setMaxOutputTokens: vi.fn(),
    setStreaming: vi.fn(),
    setVision: vi.fn(),
    setTemperature: vi.fn(),
    setTopP: vi.fn(),
    setFrequencyPenalty: vi.fn(),
    setPresencePenalty: vi.fn(),
    setDefaultReasoningEffort: vi.fn(),
    setReasoningEffortMap: vi.fn(),
    setPreserveReasoning: vi.fn(),
    setInputCostPer1m: vi.fn(),
    setOutputCostPer1m: vi.fn(),
    setCachedInputCostPer1m: vi.fn(),
    setCacheControlEnabled: vi.fn(),
    setCacheMaxMarkers: vi.fn(),
    setCacheTtl: vi.fn(),
    setCustomFields: vi.fn(),
    setPrefilledFields: (v: Record<string, string>) => {
      props.onFieldsSet?.(v);
    },
  };

  useModelConfigPreFill(props.editingModel, props.fetchedModel, props.defaults, setters);

  return null;
}

function makeModel(overrides?: Partial<ModelInfo>): ModelInfo {
  return {
    id: 'gpt-4o',
    providerId: 'p1',
    displayName: null,
    maxContextWindowTokens: 128000,
    maxOutputTokens: 16384,
    streaming: true,
    vision: false,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: false,
    inputCostPer1m: null,
    outputCostPer1m: null,
    cachedInputCostPer1m: null,
    cacheControl: null,
    customFields: null,
    ...overrides,
  };
}

function makeFetchedModel(overrides?: Partial<FetchedModel>): FetchedModel {
  return {
    id: 'gpt-4o',
    name: null,
    maxContextWindowTokens: null,
    maxOutputTokens: null,
    defaultReasoningEffort: null,
    vision: null,
    supportedReasoningEfforts: null,
    inputCostPer1M: null,
    outputCostPer1M: null,
    cachedInputCostPer1M: null,
    ...overrides,
  };
}

function makeDefaults(overrides?: Partial<ModelDefaultsResult>): ModelDefaultsResult {
  return {
    contextSize: 128000,
    maxTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
    supportedCapabilities: [],
    ...overrides,
  };
}

describe('useModelConfigPreFill', () => {
  it('fills from editing model', () => {
    const model = makeModel({ displayName: 'My GPT', maxContextWindowTokens: 64000 });
    const onFieldsSet = vi.fn();
    render(<TestWrapper editingModel={model} onFieldsSet={onFieldsSet} />);
    expect(onFieldsSet).toHaveBeenCalledWith({});
  });

  it('fills from fetched model', () => {
    const fetched = makeFetchedModel({
      name: 'GPT-4o',
      maxContextWindowTokens: 128000,
      maxOutputTokens: 16384,
    });
    const onFieldsSet = vi.fn();
    render(<TestWrapper fetchedModel={fetched} onFieldsSet={onFieldsSet} />);
    expect(onFieldsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'provider',
        maxContextWindowTokens: 'provider',
        maxOutputTokens: 'provider',
      }),
    );
  });

  it('fills from defaults when no provider data', () => {
    const onFieldsSet = vi.fn();
    render(
      <TestWrapper
        defaults={makeDefaults({ contextSize: 65536, maxTokens: 8192 })}
        onFieldsSet={onFieldsSet}
      />,
    );
    expect(onFieldsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        maxContextWindowTokens: 'defaults',
        maxOutputTokens: 'defaults',
      }),
    );
  });

  it('defaults do not override provider pre-fills', () => {
    const fetched = makeFetchedModel({ maxContextWindowTokens: 128000 });
    const onFieldsSet = vi.fn();
    render(
      <TestWrapper
        fetchedModel={fetched}
        defaults={makeDefaults({ contextSize: 64000 })}
        onFieldsSet={onFieldsSet}
      />,
    );
    const callArgs = onFieldsSet.mock.calls[0][0] as Record<string, string>;
    expect(callArgs.maxContextWindowTokens).toBe('provider');
  });

  it('marks vision capability from defaults', () => {
    const onFieldsSet = vi.fn();
    render(
      <TestWrapper
        defaults={makeDefaults({ supportedCapabilities: ['vision'] })}
        onFieldsSet={onFieldsSet}
      />,
    );
    const callArgs = onFieldsSet.mock.calls[0][0] as Record<string, string>;
    expect(callArgs.vision).toBe('defaults');
  });

  it('fills reasoningEffortMap from defaults', () => {
    const onFieldsSet = vi.fn();
    render(
      <TestWrapper
        defaults={makeDefaults({
          reasoningEffortMap: {
            low: { reasoning_effort: 'low' },
            high: { reasoning_effort: 'high' },
          },
        })}
        onFieldsSet={onFieldsSet}
      />,
    );
    const callArgs = onFieldsSet.mock.calls[0][0] as Record<string, string>;
    expect(callArgs.reasoningEffortMap).toBe('defaults');
  });
});
