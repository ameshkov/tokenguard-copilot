import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModelDefaults, ModelDefaultsEntry } from './model-defaults.js';
import { getDefaults, initDefaults, resetDefaults } from './model-defaults.js';

const jsonPath = resolve(__dirname, '..', '..', '..', '..', '..', 'assets', 'model-defaults.json');

beforeEach(() => {
  resetDefaults();
  initDefaults(jsonPath);
});

describe('ModelDefaults types', () => {
  it('should allow a valid ModelDefaultsEntry with exact match', () => {
    const entry: ModelDefaultsEntry = {
      match: { type: 'exact', value: 'gpt-4o' },
      contextSize: 128000,
      maxTokens: 16384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10.0,
      supportedCapabilities: [],
      reasoningEffortMap: {
        low: { reasoning_effort: 'low', reasoning: { effort: 'low' } },
        high: { reasoning_effort: 'high', reasoning: { effort: 'high' } },
      },
    };
    expect(entry.match.type).toBe('exact');
  });

  it('should allow a valid ModelDefaultsEntry with regex match', () => {
    const entry: ModelDefaultsEntry = {
      match: { type: 'regex', value: '^gpt-4o-' },
      contextSize: 128000,
      maxTokens: 16384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10.0,
      supportedCapabilities: [],
      reasoningEffortMap: {
        low: { reasoning_effort: 'low', reasoning: { effort: 'low' } },
        high: { reasoning_effort: 'high', reasoning: { effort: 'high' } },
      },
    };
    expect(entry.match.type).toBe('regex');
  });

  it('should allow optional cachedInputCostPer1M', () => {
    const entry: ModelDefaultsEntry = {
      match: { type: 'exact', value: 'gpt-4o' },
      contextSize: 128000,
      maxTokens: 16384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10.0,
      cachedInputCostPer1M: 1.25,
      supportedCapabilities: [],
      reasoningEffortMap: {
        low: { reasoning_effort: 'low', reasoning: { effort: 'low' } },
        high: { reasoning_effort: 'high', reasoning: { effort: 'high' } },
      },
    };
    expect(entry.cachedInputCostPer1M).toBe(1.25);
  });

  it('should produce ModelDefaults without match field', () => {
    const defaults: ModelDefaults = {
      contextSize: 128000,
      maxTokens: 16384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10.0,
      supportedCapabilities: [],
      reasoningEffortMap: {
        low: { reasoning_effort: 'low', reasoning: { effort: 'low' } },
        high: { reasoning_effort: 'high', reasoning: { effort: 'high' } },
      },
    };
    expect(defaults).not.toHaveProperty('match');
  });
});

describe('model-defaults.json schema validation', () => {
  let entries: ModelDefaultsEntry[];

  beforeAll(() => {
    const raw = readFileSync(jsonPath, 'utf-8');
    entries = JSON.parse(raw) as ModelDefaultsEntry[];
  });

  it('should be a non-empty array', () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every entry should have a valid match field', () => {
    for (const entry of entries) {
      expect(entry.match).toBeDefined();
      expect(['exact', 'regex']).toContain(entry.match.type);
      expect(typeof entry.match.value).toBe('string');
      expect(entry.match.value.length).toBeGreaterThan(0);
    }
  });

  it('every entry should have numeric fields > 0', () => {
    for (const entry of entries) {
      expect(entry.contextSize).toBeGreaterThan(0);
      expect(entry.maxTokens).toBeGreaterThan(0);
      expect(entry.inputCostPer1M).toBeGreaterThan(0);
      expect(entry.outputCostPer1M).toBeGreaterThan(0);
      if (entry.cachedInputCostPer1M !== undefined) {
        expect(entry.cachedInputCostPer1M).toBeGreaterThan(0);
      }
    }
  });

  it('every entry should have a supportedCapabilities array', () => {
    for (const entry of entries) {
      expect(Array.isArray(entry.supportedCapabilities)).toBe(true);
      for (const cap of entry.supportedCapabilities) {
        expect(typeof cap).toBe('string');
      }
    }
  });

  it('every regex pattern should be a valid RegExp', () => {
    for (const entry of entries) {
      if (entry.match.type === 'regex') {
        expect(() => new RegExp(entry.match.value)).not.toThrow();
      }
    }
  });

  it('should not have duplicate exact match values', () => {
    const exactValues = entries.filter((e) => e.match.type === 'exact').map((e) => e.match.value);
    const uniqueValues = new Set(exactValues);
    expect(uniqueValues.size).toBe(exactValues.length);
  });

  it('reasoningEffortMap values should be objects when present', () => {
    for (const entry of entries) {
      if (entry.reasoningEffortMap !== undefined) {
        expect(typeof entry.reasoningEffortMap).toBe('object');
        for (const [key, value] of Object.entries(entry.reasoningEffortMap)) {
          expect(typeof key).toBe('string');
          expect(typeof value).toBe('object');
          expect(value).not.toBeNull();
        }
      }
    }
  });

  it('every entry should have reasoningEffortMap when reasoning_effort capability is present', () => {
    for (const entry of entries) {
      if (entry.supportedCapabilities?.includes('reasoning_effort')) {
        expect(entry.reasoningEffortMap).toBeDefined();
      }
    }
  });

  it('every entry should have reasoningEffortMap when reasoning_effort capability is present', () => {
    for (const entry of entries) {
      if (entry.supportedCapabilities?.includes('reasoning_effort')) {
        expect(entry.reasoningEffortMap).toBeDefined();
      }
    }
  });
  it('preserveReasoning should be a boolean when present', () => {
    for (const entry of entries) {
      if (entry.preserveReasoning !== undefined) {
        expect(typeof entry.preserveReasoning).toBe('boolean');
      }
    }
  });
});

describe('getDefaults', () => {
  it('should return defaults for an exact model ID match', () => {
    const result = getDefaults('gpt-5.4');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(272000);
    expect(result!.maxTokens).toBe(65500);
    expect(result!.inputCostPer1M).toBe(2.5);
    expect(result!.outputCostPer1M).toBe(15.0);
    expect(result!.supportedCapabilities).toContain('vision');
    expect(result!.reasoningEffortMap).toBeDefined();
    expect(Object.keys(result!.reasoningEffortMap!)).toContain('xhigh');
  });

  it('should return defaults for a regex pattern match', () => {
    const result = getDefaults('kimi-k2.6-preview');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(262000);
  });

  it('should return null for an unknown model ID', () => {
    const result = getDefaults('unknown-model-xyz');
    expect(result).toBeNull();
  });

  it('should prefer exact match over regex match', () => {
    // "kimi-k2.6" matches both the exact entry and the
    // "^kimi-k2" regex. Exact should win.
    const result = getDefaults('kimi-k2.6');
    expect(result).not.toBeNull();
    expect(result!.cachedInputCostPer1M).toBe(0.15);
  });

  it('should match the first regex when multiple regexes match', () => {
    // "kimi-k2.6" should match the "^kimi-k2" regex
    const result = getDefaults('kimi-k2.6');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(262000);
  });

  it('should return defaults without the match field', () => {
    const result = getDefaults('gpt-5.4');
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('match');
  });

  it('should include cachedInputCostPer1M when present', () => {
    const result = getDefaults('qwen3.6-plus');
    expect(result).not.toBeNull();
    expect(result!.cachedInputCostPer1M).toBe(0.05);
  });

  it('should include reasoningEffortMap when present', () => {
    const result = getDefaults('deepseek-v4-pro');
    expect(result).not.toBeNull();
    expect(result!.reasoningEffortMap).toBeDefined();
    expect(result!.reasoningEffortMap!['none']).toEqual({
      thinking: { type: 'disabled' },
    });
    expect(result!.reasoningEffortMap!['high']).toEqual({
      reasoning_effort: 'high',
      thinking: { type: 'enabled' },
    });
  });

  it('should include reasoningEffortMap for models with reasoning_effort capability', () => {
    const result = getDefaults('gpt-5.4');
    expect(result).not.toBeNull();
    expect(result!.reasoningEffortMap).toBeDefined();
    expect(Object.keys(result!.reasoningEffortMap!)).toContain('low');
    expect(Object.keys(result!.reasoningEffortMap!)).toContain('high');
  });

  it('should include defaultReasoningEffort for reasoningEffortMap models', () => {
    const result = getDefaults('deepseek-v4-pro');
    expect(result).not.toBeNull();
    expect(result!.defaultReasoningEffort).toBe('high');
  });

  it('should include preserveReasoning when present', () => {
    const result = getDefaults('kimi-k2.6');
    expect(result).not.toBeNull();
    expect(result!.preserveReasoning).toBe(true);
  });

  it('should omit preserveReasoning for standard models', () => {
    const result = getDefaults('gpt-5.4');
    expect(result).not.toBeNull();
    expect(result!.preserveReasoning).toBeUndefined();
  });

  it('should include cacheControl for Qwen models', () => {
    const result = getDefaults('qwen3.7-max');
    expect(result).not.toBeNull();
    expect(result!.cacheControl).toBeDefined();
    expect(result!.cacheControl!.enabled).toBe(true);
    expect(result!.cacheControl!.maxMarkers).toBe(4);
    expect(result!.cacheControl!.ttl).toBeUndefined();
  });

  it('should omit cacheControl for models without it', () => {
    const result = getDefaults('deepseek-v4-flash');
    expect(result).not.toBeNull();
    expect(result!.cacheControl).toBeUndefined();
  });

  it('should include reasoningEffortMap for all reasoning models', () => {
    const result = getDefaults('gpt-5.4');
    expect(result).not.toBeNull();
    expect(result!.reasoningEffortMap).toBeDefined();
    expect(Object.keys(result!.reasoningEffortMap!).length).toBeGreaterThan(0);
  });
});
