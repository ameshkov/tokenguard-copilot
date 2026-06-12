import { describe, it, expect } from 'vitest';
import {
  validateFormState,
  fieldLabel,
  buildCacheControl,
  buildModelConfig,
} from './model-config-validation.js';
import type { ModelConfigFormState } from './model-config-validation.js';
import type { ModelConfig } from '@tokenguard/shared';

/** Minimal valid form state fixture. */
function validState(overrides?: Partial<ModelConfigFormState>): ModelConfigFormState {
  return {
    displayName: 'Test Model',
    maxContextWindowTokens: '128000',
    maxOutputTokens: '16384',
    streaming: true,
    vision: false,
    temperature: '',
    topP: '',
    frequencyPenalty: '',
    presencePenalty: '',
    defaultReasoningEffort: '',
    reasoningEffortMap: {},
    preserveReasoning: false,
    inputCostPer1m: '',
    outputCostPer1m: '',
    cachedInputCostPer1m: '',
    cacheControlEnabled: false,
    cacheMaxMarkers: '4',
    cacheTtl: '',
    customFields: [],
    ...overrides,
  };
}

describe('validateFormState', () => {
  it('returns no errors for valid state', () => {
    const errors = validateFormState(validState());
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('requires max context window tokens to be a positive number', () => {
    const errors = validateFormState(validState({ maxContextWindowTokens: '' }));
    expect(errors.maxContextWindowTokens).toBe('Must be a positive number');

    const errors2 = validateFormState(validState({ maxContextWindowTokens: '0' }));
    expect(errors2.maxContextWindowTokens).toBe('Must be a positive number');
  });

  it('requires max output tokens to be a positive number', () => {
    const errors = validateFormState(validState({ maxOutputTokens: '' }));
    expect(errors.maxOutputTokens).toBe('Must be a positive number');
  });

  it('requires max output tokens to be less than context window', () => {
    const errors = validateFormState(
      validState({ maxContextWindowTokens: '1000', maxOutputTokens: '2000' }),
    );
    expect(errors.maxOutputTokens).toBe('Must be less than max context window tokens');
  });

  it('rejects output tokens equal to context window', () => {
    const errors = validateFormState(
      validState({ maxContextWindowTokens: '1000', maxOutputTokens: '1000' }),
    );
    expect(errors.maxOutputTokens).toBe('Must be less than max context window tokens');
  });

  it('validates temperature is between 0 and 2', () => {
    const errors = validateFormState(validState({ temperature: '3' }));
    expect(errors.temperature).toBe('Must be between 0 and 2');
  });

  it('validates topP is between 0 and 1', () => {
    const errors = validateFormState(validState({ topP: '2' }));
    expect(errors.topP).toBe('Must be between 0 and 1');
  });

  it('validates frequency penalty is between -2 and 2', () => {
    const errors = validateFormState(validState({ frequencyPenalty: '3' }));
    expect(errors.frequencyPenalty).toBe('Must be between -2 and 2');
  });

  it('validates presence penalty is between -2 and 2', () => {
    const errors = validateFormState(validState({ presencePenalty: '-3' }));
    expect(errors.presencePenalty).toBe('Must be between -2 and 2');
  });

  it('validates reasoning effort map JSON entries', () => {
    const errors = validateFormState(validState({ reasoningEffortMap: { low: 'not json' } }));
    expect(errors['effortMap_low']).toBe('Invalid JSON');
  });

  it('validates reasoning effort map entries are objects', () => {
    const errors = validateFormState(
      validState({ reasoningEffortMap: { low: '"just a string"' } }),
    );
    // '"just a string"' parses as a string primitive, not an object
    expect(errors['effortMap_low']).toBe('Must be a JSON object');
  });

  it('accepts empty effort map params', () => {
    const errors = validateFormState(validState({ reasoningEffortMap: { low: '' } }));
    expect(errors['effortMap_low']).toBeUndefined();
  });
});

describe('fieldLabel', () => {
  it('returns label for known fields', () => {
    expect(fieldLabel('maxContextWindowTokens')).toBe('Max Context Window Tokens');
    expect(fieldLabel('temperature')).toBe('Temperature');
  });

  it('returns label for effort map fields', () => {
    expect(fieldLabel('effortMap_low')).toBe('Body Params for "low"');
  });

  it('returns raw field name for unknown fields', () => {
    expect(fieldLabel('unknownField')).toBe('unknownField');
  });
});

describe('buildCacheControl', () => {
  it('returns null when disabled', () => {
    expect(buildCacheControl(false, '4', '')).toBeNull();
  });

  it('builds config with default maxMarkers when input is empty', () => {
    const config = buildCacheControl(true, '', '');
    expect(config).toEqual({ enabled: true, maxMarkers: 4 });
  });

  it('includes ttl when provided', () => {
    const config = buildCacheControl(true, '3', '5m');
    expect(config).toEqual({ enabled: true, maxMarkers: 3, ttl: '5m' });
  });

  it('omits ttl when empty', () => {
    const config = buildCacheControl(true, '5', '');
    expect(config).toEqual({ enabled: true, maxMarkers: 5 });
  });
});

describe('buildModelConfig', () => {
  it('builds a complete model config from form state', () => {
    const state = validState({
      displayName: 'My Model',
      temperature: '0.7',
      inputCostPer1m: '2.5',
      cacheControlEnabled: true,
      cacheMaxMarkers: '6',
      cacheTtl: '1h',
    });

    const config: ModelConfig = buildModelConfig(state);

    expect(config.displayName).toBe('My Model');
    expect(config.maxContextWindowTokens).toBe(128000);
    expect(config.maxOutputTokens).toBe(16384);
    expect(config.streaming).toBe(true);
    expect(config.temperature).toBe(0.7);
    expect(config.inputCostPer1m).toBe(2.5);
    expect(config.cacheControl).toEqual({ enabled: true, maxMarkers: 6, ttl: '1h' });
  });

  it('sets optional fields to null when empty', () => {
    const config = buildModelConfig(validState({ displayName: '' }));
    expect(config.displayName).toBeNull();
    expect(config.temperature).toBeNull();
    expect(config.cacheControl).toBeNull();
    expect(config.customFields).toBeNull();
  });

  it('serializes customFields as JSON', () => {
    const state = validState({
      customFields: [{ property: 'foo', type: 'string', value: 'bar' }],
    });
    const config = buildModelConfig(state);
    expect(config.customFields).toBe('[{"property":"foo","type":"string","value":"bar"}]');
  });

  it('serializes reasoningEffortMap', () => {
    const state = validState({
      reasoningEffortMap: { high: '{"reasoning_effort":"high"}' },
    });
    const config = buildModelConfig(state);
    expect(config.reasoningEffortMap).toBe('{"high":{"reasoning_effort":"high"}}');
  });

  it('returns null for reasoningEffortMap when no entries', () => {
    const config = buildModelConfig(validState());
    expect(config.reasoningEffortMap).toBeNull();
  });

  it('returns null for customFields when empty', () => {
    const config = buildModelConfig(validState({ customFields: [] }));
    expect(config.customFields).toBeNull();
  });
});
