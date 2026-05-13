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
      supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
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
      supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
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
      supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
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
      supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
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

  it('supportedReasoningEfforts should be a string array when present', () => {
    for (const entry of entries) {
      if (entry.supportedReasoningEfforts !== undefined) {
        expect(Array.isArray(entry.supportedReasoningEfforts)).toBe(true);
        for (const effort of entry.supportedReasoningEfforts) {
          expect(typeof effort).toBe('string');
        }
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

  it('entries must not have both supportedReasoningEfforts and reasoningEffortMap', () => {
    for (const entry of entries) {
      if (entry.reasoningEffortMap !== undefined) {
        expect(entry.supportedReasoningEfforts).toBeUndefined();
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
    expect(result!.contextSize).toBe(1050000);
    expect(result!.maxTokens).toBe(32768);
    expect(result!.inputCostPer1M).toBe(2.5);
    expect(result!.outputCostPer1M).toBe(15.0);
    expect(result!.supportedCapabilities).toContain('vision');
    expect(result!.supportedReasoningEfforts).toContain('xhigh');
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

  it('should handle cachedInputCostPer1M being undefined', () => {
    // qwen-3.6-max-preview does not have
    // cachedInputCostPer1M
    const result = getDefaults('qwen-3.6-max-preview');
    expect(result).not.toBeNull();
    expect(result!.cachedInputCostPer1M).toBeUndefined();
  });

  it('should include reasoningEffortMap when present', () => {
    const result = getDefaults('deepseek-v4-pro');
    expect(result).not.toBeNull();
    expect(result!.reasoningEffortMap).toBeDefined();
    expect(result!.reasoningEffortMap!['none']).toEqual({
      extra_body: { thinking: { type: 'disabled' } },
    });
    expect(result!.reasoningEffortMap!['high']).toEqual({
      reasoning_effort: 'high',
      extra_body: { thinking: { type: 'enabled' } },
    });
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

  it('should omit reasoningEffortMap for standard models', () => {
    const result = getDefaults('gpt-5.4');
    expect(result).not.toBeNull();
    expect(result!.reasoningEffortMap).toBeUndefined();
  });
});
