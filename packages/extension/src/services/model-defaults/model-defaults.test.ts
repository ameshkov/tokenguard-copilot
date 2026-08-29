import { describe, it, expect } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FetchedModel } from '@tokenguard/shared';
import { ModelDefaultsService } from './model-defaults.js';
import { createMockLogger } from '../../test/mock-logger.js';

const fixtureJsonPath = resolve(
  __dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'models-dev.fixture.json',
);

/** Creates a service pointing at the shared fixture. */
function createFixtureService(): ModelDefaultsService {
  return new ModelDefaultsService({
    logger: createMockLogger(),
    jsonPath: fixtureJsonPath,
  });
}

function makeFetchedModel(overrides: Partial<FetchedModel> = {}): FetchedModel {
  return {
    id: 'acme/model-vision',
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

describe('ModelDefaultsService provider resolution', () => {
  it('resolves a provider by matching the base URL host against the api hosts', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/model-basic');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(32000);
  });

  it('matches the api host regardless of the base URL path', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v2/', 'acme/model-basic');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(32000);
  });

  it('resolves known SDK-only hosts via the hardcoded table', () => {
    const service = createFixtureService();
    // api.openai.com maps to the "openai" provider; the model lookup
    // uses the models.dev model key (gpt-4o, no prefix).
    const result = service.getDefaults('https://api.openai.com/v1', 'gpt-4o');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(128000);
    expect(result!.maxTokens).toBe(16384);
    expect(result!.inputCostPer1M).toBe(2.5);
  });

  it('resolves region-scoped Azure hosts via the openai.azure.com suffix', () => {
    const service = createFixtureService();
    // The unprefixed model key ("model-one") can only be found
    // through the azure provider, which the host suffix resolves.
    const result = service.getDefaults('https://my-resource.openai.azure.com', 'model-one');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(96000);
  });

  it('falls back to the model ID prefix when the host is unknown', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://gateway.example.com/v1', 'noded/chat');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(128000);
    expect(result!.maxTokens).toBe(8192);
  });

  it('searches all providers by model ID as a last resort', () => {
    const service = createFixtureService();
    // Unknown gateway host with an unprefixed model ID can only be
    // found by searching every provider's models map.
    const result = service.getDefaults('https://gateway.example.com/v1', 'gpt-4o');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(128000);
    expect(result!.maxTokens).toBe(16384);
  });

  it('resolves OpenRouter-style ~-prefixed latest aliases verbatim', () => {
    const service = createFixtureService();
    // models.dev keys "latest" aliases with a leading `~` and
    // OpenRouter uses the same ID in its /models response, so the
    // lookup must use the tilde-prefixed key as-is.
    const result = service.getDefaults('https://api.acme.test/v1', '~acme/model-latest');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(99000);
  });

  it('returns null when the host and prefix are unknown', () => {
    const service = createFixtureService();
    expect(service.getDefaults(null, 'unknown-model')).toBeNull();
    expect(service.getDefaults('https://unknown.example.com/v1', 'nope/model')).toBeNull();
    expect(service.getDefaults('https://api.acme.test/v1', 'acme/not-there')).toBeNull();
  });

  it('falls back to the model ID prefix when the base URL is invalid', () => {
    const service = createFixtureService();
    const result = service.getDefaults('not-a-url', 'noded/chat');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(128000);
  });
});

describe('ModelDefaultsService defaults derivation', () => {
  it('derives context, output, costs, and capabilities from a full entry', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/model-vision');
    expect(result).not.toBeNull();
    expect(result!.contextSize).toBe(200000);
    expect(result!.maxTokens).toBe(8192);
    expect(result!.inputCostPer1M).toBe(0.5);
    expect(result!.outputCostPer1M).toBe(1.5);
    expect(result!.cachedInputCostPer1M).toBe(0.05);
    expect(result!.supportedCapabilities).toEqual(['vision', 'reasoning_effort']);
    expect(result!.reasoningEffortMap).toEqual({
      low: { reasoning_effort: 'low' },
      high: { reasoning_effort: 'high' },
    });
  });

  it('derives defaultReasoningEffort from reasoning.default_effort', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/model-effort-default');
    expect(result).not.toBeNull();
    expect(result!.supportedCapabilities).toEqual(['reasoning_effort']);
    expect(result!.reasoningEffortMap).toEqual({
      minimal: { reasoning_effort: 'minimal' },
      high: { reasoning_effort: 'high' },
    });
    expect(result!.defaultReasoningEffort).toBe('high');
  });

  it('treats budget_tokens reasoning options without effort values as non-reasoning', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/model-budget');
    expect(result).not.toBeNull();
    expect(result!.supportedCapabilities).toBeUndefined();
    expect(result!.reasoningEffortMap).toBeUndefined();
  });

  it('omits fields not present in the entry', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/model-basic');
    expect(result).not.toBeNull();
    expect(result!.maxTokens).toBeUndefined();
    expect(result!.cachedInputCostPer1M).toBeUndefined();
    expect(result!.supportedCapabilities).toBeUndefined();
    expect(result!.reasoningEffortMap).toBeUndefined();
    expect(result!.defaultReasoningEffort).toBeUndefined();
  });

  it('enables preserve reasoning and prompt caching for Qwen 3.7 models', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/qwen3.7-max');
    expect(result).not.toBeNull();
    expect(result!.preserveReasoning).toBe(true);
    expect(result!.cacheControl).toEqual({ enabled: true, maxMarkers: 4 });
  });

  it('enables preserve reasoning but not prompt caching for other models', () => {
    const service = createFixtureService();
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/qwen3.8-max');
    expect(result).not.toBeNull();
    expect(result!.preserveReasoning).toBe(true);
    expect(result!.cacheControl).toBeUndefined();
  });
});

describe('ModelDefaultsService.applyToFetched', () => {
  it('fills null fields from defaults', () => {
    const service = createFixtureService();
    const result = service.applyToFetched(makeFetchedModel(), 'https://api.acme.test/v1');
    expect(result.maxContextWindowTokens).toBe(200000);
    expect(result.maxOutputTokens).toBe(8192);
    expect(result.vision).toBe(true);
    expect(result.supportedReasoningEfforts).toEqual(['low', 'high']);
    expect(result.inputCostPer1M).toBe(0.5);
    expect(result.outputCostPer1M).toBe(1.5);
    expect(result.cachedInputCostPer1M).toBe(0.05);
    expect(result.defaultReasoningEffort).toBeNull();
  });

  it('does not override non-null provider values', () => {
    const service = createFixtureService();
    const result = service.applyToFetched(
      makeFetchedModel({
        maxContextWindowTokens: 999999,
        maxOutputTokens: 4096,
        vision: false,
        supportedReasoningEfforts: ['minimal'],
        inputCostPer1M: 9.9,
        outputCostPer1M: 9.8,
        cachedInputCostPer1M: 9.7,
        defaultReasoningEffort: 'low',
      }),
      'https://api.acme.test/v1',
    );
    expect(result.maxContextWindowTokens).toBe(999999);
    expect(result.maxOutputTokens).toBe(4096);
    expect(result.vision).toBe(false);
    expect(result.supportedReasoningEfforts).toEqual(['minimal']);
    expect(result.inputCostPer1M).toBe(9.9);
    expect(result.outputCostPer1M).toBe(9.8);
    expect(result.cachedInputCostPer1M).toBe(9.7);
    expect(result.defaultReasoningEffort).toBe('low');
  });

  it('returns the original object when no defaults are found', () => {
    const service = createFixtureService();
    const fetched = makeFetchedModel({ id: 'unknown/model' });
    const result = service.applyToFetched(fetched, 'https://api.acme.test/v1');
    expect(result).toBe(fetched);
  });

  it('does not mutate the input when filling', () => {
    const service = createFixtureService();
    const fetched = makeFetchedModel();
    const result = service.applyToFetched(fetched, 'https://api.acme.test/v1');
    expect(result).not.toBe(fetched);
    expect(fetched.maxContextWindowTokens).toBeNull();
  });
});

describe('ModelDefaultsService loading', () => {
  it('loads the bundled snapshot lazily once with an injected jsonPath', () => {
    const logger = createMockLogger();
    const service = new ModelDefaultsService({ logger, jsonPath: fixtureJsonPath });
    const result = service.getDefaults('https://api.acme.test/v1', 'acme/model-basic');
    expect(result).not.toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      'Model defaults loaded',
      expect.stringContaining('fixtures'),
    );
  });

  it('stays usable when the jsonPath is missing or invalid', () => {
    const logger = createMockLogger();
    const tmpPath = resolve(__dirname, 'test-invalid-defaults.json');
    writeFileSync(tmpPath, '{ not json');
    try {
      const service = new ModelDefaultsService({ logger, jsonPath: tmpPath });
      expect(service.getDefaults('https://api.acme.test/v1', 'acme/model-basic')).toBeNull();
      expect(service.applyToFetched(makeFetchedModel(), 'https://api.acme.test/v1')).toEqual(
        makeFetchedModel(),
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load model defaults',
        expect.any(String),
        expect.stringContaining('test-invalid-defaults.json'),
      );
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it('defaults jsonPath to the bundled assets file', () => {
    const service = new ModelDefaultsService({ logger: createMockLogger() });
    expect(service).toBeInstanceOf(ModelDefaultsService);
  });
});
