import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { providers } from '../../db/index.js';
import { ModelRepository, ProviderRepository } from '../../repositories/index.js';
import { ModelRegistry } from './model-registry.js';
import type { ChatDebugLogger } from '../chat-debug-logger/index.js';
import type { ModelConfig, CacheControlConfig } from '@tokenguard/shared';
import type { Database } from '../../db/index.js';
import type { DatabaseSync } from 'node:sqlite';
import { createMockLogger } from '../../test/mock-logger.js';

const mockRegister = vi.hoisted(() =>
  vi.fn<
    (
      vendor: string,
      provider: import('vscode').LanguageModelChatProvider,
    ) => { dispose: ReturnType<typeof vi.fn> }
  >(() => ({
    dispose: vi.fn(),
  })),
);

vi.mock('vscode', () => ({
  EventEmitter: class {
    private handlers: (() => void)[] = [];
    event = (handler: () => void) => {
      this.handlers.push(handler);
      return { dispose: () => {} };
    };
    fire() {
      for (const h of this.handlers) h();
    }
    dispose() {}
  },
  lm: {
    registerLanguageModelChatProvider: mockRegister,
  },
}));

describe('ModelRegistry', () => {
  let db: Database;
  let raw: DatabaseSync;
  let modelRepo: ModelRepository;
  let providerRepo: ProviderRepository;
  let registry: ModelRegistry;
  let mockLogger: ChatDebugLogger;
  const providerId = 'provider-1';

  const validConfig: ModelConfig = {
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
  };

  const mockReasoningCacheService = {
    backfillReasoning: vi.fn(),
    cacheReasoning: vi.fn(),
  };

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    db.insert(providers)
      .values({
        id: providerId,
        name: 'Test Provider',
        baseUrl: 'https://api.test.com/v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    modelRepo = new ModelRepository(db);
    providerRepo = new ProviderRepository(db);
    const secrets = {
      get: vi.fn().mockResolvedValue('test-api-key'),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    };
    mockLogger = {
      logRequest: vi.fn(),
    } as unknown as ChatDebugLogger;
    const mockTokenCounter = {
      countTokens: vi.fn().mockResolvedValue(0),
      countMessageTokens: vi.fn().mockResolvedValue(0),
    };
    const mockUsageTracker = {
      recordUsage: vi.fn(),
      recordError: vi.fn(),
    };
    registry = new ModelRegistry(
      modelRepo,
      providerRepo,
      secrets as unknown as import('vscode').SecretStorage,
      mockLogger,
      mockTokenCounter as unknown as import('../token-counter/index.js').TokenCounter,
      mockReasoningCacheService as unknown as import('../reasoning-cache/reasoning-cache-service.js').ReasoningCacheService,
      mockUsageTracker as unknown as import('../usage-tracker/index.js').UsageTracker,
      createMockLogger(),
    );
  });

  afterEach(() => {
    clearTestDb(raw);
    vi.restoreAllMocks();
  });

  describe('fetchModels', () => {
    it('fetches and parses models from provider', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'gpt-4o',
                  name: 'GPT-4o',
                  capabilities: {
                    supports: {
                      vision: true,
                    },
                    limits: {
                      max_context_window_tokens: 128000,
                      max_output_tokens: 16384,
                    },
                  },
                },
              ],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('gpt-4o');
      expect(models[0].name).toBe('GPT-4o');
      expect(models[0].maxContextWindowTokens).toBe(128000);
      expect(models[0].maxOutputTokens).toBe(16384);
      expect(models[0].vision).toBe(true);
    });

    it('parses vision from capabilities.supports.vision', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'vision-model',
                  capabilities: {
                    supports: { vision: true },
                  },
                },
              ],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      expect(models[0].vision).toBe(true);
    });

    it('calculates maxOutputTokens from context minus prompt tokens', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'calc-model',
                  capabilities: {
                    limits: {
                      max_context_window_tokens: 200000,
                      max_prompt_tokens: 134500,
                    },
                  },
                },
              ],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      expect(models[0].maxOutputTokens).toBe(65500);
    });

    it('parses supportedReasoningEfforts array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'reasoning-model',
                  supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
                  defaultReasoningEffort: 'medium',
                },
              ],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      expect(models[0].supportedReasoningEfforts).toEqual(['none', 'low', 'medium', 'high']);
      expect(models[0].defaultReasoningEffort).toBe('medium');
    });

    it('parses pricing fields from provider response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'priced-model',
                  pricing: {
                    prompt: 0.15,
                    completion: 0.3,
                    input_cache_read: 0.075,
                  },
                },
              ],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      expect(models[0].inputCostPer1M).toBe(0.15);
      expect(models[0].outputCostPer1M).toBe(0.3);
      expect(models[0].cachedInputCostPer1M).toBe(0.075);
    });

    it('parses string pricing values from provider response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'string-priced-model',
                  pricing: {
                    prompt: '0.3',
                    completion: '1.2',
                    input_cache_read: '0.06',
                  },
                },
              ],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      expect(models[0].inputCostPer1M).toBe(0.3);
      expect(models[0].outputCostPer1M).toBe(1.2);
      expect(models[0].cachedInputCostPer1M).toBe(0.06);
    });

    it('includes input_cache_write in input cost for OpenRouter-style pricing', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: 'openrouter-model',
                  pricing: {
                    prompt: '1.5',
                    completion: '7.5',
                    input_cache_read: '0.15',
                    input_cache_write: '2.0',
                  },
                },
              ],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      // input = prompt + input_cache_write = 1.5 + 2.0 = 3.5
      expect(models[0].inputCostPer1M).toBe(3.5);
      expect(models[0].outputCostPer1M).toBe(7.5);
      expect(models[0].cachedInputCostPer1M).toBe(0.15);
    });

    it('returns null for missing fields', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [{ id: 'minimal-model' }],
            }),
        }),
      );

      const models = await registry.fetchModels(providerId);
      expect(models[0].name).toBeNull();
      expect(models[0].maxContextWindowTokens).toBeNull();
      expect(models[0].maxOutputTokens).toBeNull();
      expect(models[0].vision).toBeNull();
      expect(models[0].defaultReasoningEffort).toBeNull();
      expect(models[0].supportedReasoningEfforts).toBeNull();
      expect(models[0].inputCostPer1M).toBeNull();
      expect(models[0].outputCostPer1M).toBeNull();
      expect(models[0].cachedInputCostPer1M).toBeNull();
    });
  });

  describe('addModel', () => {
    it('persists model and fires event', () => {
      const handler = vi.fn();
      registry.onModelsChanged(handler);

      const model = registry.addModel(providerId, 'gpt-4o', validConfig);
      expect(model.id).toBe('gpt-4o');
      expect(model.providerId).toBe(providerId);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('throws when model already exists', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      expect(() => registry.addModel(providerId, 'gpt-4o', validConfig)).toThrow('already exists');
    });

    it('validates maxContextWindowTokens > 0', () => {
      expect(() =>
        registry.addModel(providerId, 'gpt-4o', {
          ...validConfig,
          maxContextWindowTokens: 0,
        }),
      ).toThrow('Max context window tokens must be positive');
    });

    it('validates maxOutputTokens > 0', () => {
      expect(() =>
        registry.addModel(providerId, 'gpt-4o', {
          ...validConfig,
          maxOutputTokens: 0,
        }),
      ).toThrow('Max output tokens must be positive');
    });

    it('validates temperature range', () => {
      expect(() =>
        registry.addModel(providerId, 'gpt-4o', {
          ...validConfig,
          temperature: 3,
        }),
      ).toThrow('Temperature must be between 0 and 2');
    });

    it('validates topP range', () => {
      expect(() =>
        registry.addModel(providerId, 'gpt-4o', {
          ...validConfig,
          topP: 1.5,
        }),
      ).toThrow('Top P must be between 0 and 1');
    });

    it('validates frequency penalty range', () => {
      expect(() =>
        registry.addModel(providerId, 'gpt-4o', {
          ...validConfig,
          frequencyPenalty: -3,
        }),
      ).toThrow('Frequency penalty must be between -2 and 2');
    });

    it('validates presence penalty range', () => {
      expect(() =>
        registry.addModel(providerId, 'gpt-4o', {
          ...validConfig,
          presencePenalty: 5,
        }),
      ).toThrow('Presence penalty must be between -2 and 2');
    });

    it('throws when provider not found', () => {
      expect(() => registry.addModel('nonexistent', 'gpt-4o', validConfig)).toThrow(
        'Provider not found',
      );
    });

    it('throws when display name conflicts with another model', () => {
      registry.addModel(providerId, 'model-a', {
        ...validConfig,
        displayName: 'Unique Name',
      });
      expect(() =>
        registry.addModel(providerId, 'model-b', {
          ...validConfig,
          displayName: 'Unique Name',
        }),
      ).toThrow('A model with this display name already exists');
    });

    it('allows null display name without uniqueness check', () => {
      registry.addModel(providerId, 'model-a', {
        ...validConfig,
        displayName: null,
      });
      expect(() =>
        registry.addModel(providerId, 'model-b', {
          ...validConfig,
          displayName: null,
        }),
      ).not.toThrow();
    });
  });

  describe('getModels', () => {
    it('returns active models as ModelInfo', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      const models = registry.getModels();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('gpt-4o');
      expect(models[0].streaming).toBe(true);
    });

    it('filters by providerId', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      const models = registry.getModels('other-provider');
      expect(models).toHaveLength(0);
    });
  });

  describe('getAllModels', () => {
    it('returns both active and removed models', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      registry.addModel(providerId, 'gpt-4o-mini', validConfig);
      registry.removeModel(providerId, 'gpt-4o');

      const allModels = registry.getAllModels();
      expect(allModels).toHaveLength(2);
    });

    it('filters by providerId', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      const models = registry.getAllModels('other-provider');
      expect(models).toHaveLength(0);
    });
  });

  describe('getAllModelsWithStatus', () => {
    it('includes removed flag for active models', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      const all = registry.getAllModelsWithStatus();
      expect(all).toHaveLength(1);
      expect(all[0].removed).toBe(false);
    });

    it('includes removed flag for removed models', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      registry.removeModel(providerId, 'gpt-4o');
      const all = registry.getAllModelsWithStatus();
      expect(all).toHaveLength(1);
      expect(all[0].removed).toBe(true);
    });
  });

  describe('updateModel', () => {
    it('updates model config and fires event', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      const handler = vi.fn();
      registry.onModelsChanged(handler);

      const updated = registry.updateModel(providerId, 'gpt-4o', {
        ...validConfig,
        displayName: 'Custom Name',
      });
      expect(updated.displayName).toBe('Custom Name');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('throws when model not found', () => {
      expect(() => registry.updateModel(providerId, 'nonexistent', validConfig)).toThrow(
        'Model not found',
      );
    });

    it('throws when display name conflicts with another model', () => {
      registry.addModel(providerId, 'model-a', {
        ...validConfig,
        displayName: 'Name A',
      });
      registry.addModel(providerId, 'model-b', {
        ...validConfig,
        displayName: 'Name B',
      });
      expect(() =>
        registry.updateModel(providerId, 'model-b', {
          ...validConfig,
          displayName: 'Name A',
        }),
      ).toThrow('A model with this display name already exists');
    });

    it('allows keeping the same display name on update', () => {
      registry.addModel(providerId, 'model-a', {
        ...validConfig,
        displayName: 'Same Name',
      });
      expect(() =>
        registry.updateModel(providerId, 'model-a', {
          ...validConfig,
          displayName: 'Same Name',
        }),
      ).not.toThrow();
    });
  });

  describe('removeModel', () => {
    it('soft-removes model and fires event', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      const handler = vi.fn();
      registry.onModelsChanged(handler);

      registry.removeModel(providerId, 'gpt-4o');
      expect(registry.getModels()).toHaveLength(0);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('throws when model not found', () => {
      expect(() => registry.removeModel(providerId, 'nonexistent')).toThrow('Model not found');
    });
  });

  describe('removeModelsByProvider', () => {
    it('soft-removes all models for a provider', () => {
      registry.addModel(providerId, 'model-a', validConfig);
      registry.addModel(providerId, 'model-b', validConfig);

      registry.removeModelsByProvider(providerId);

      expect(registry.getModels(providerId)).toHaveLength(0);
    });

    it('re-registers provider after removing models', () => {
      const mockDispose = vi.fn();
      mockRegister.mockReturnValue({ dispose: mockDispose });

      registry.addModel(providerId, 'model-a', validConfig);
      registry.addModel(providerId, 'model-b', validConfig);
      registry.registerAll();
      mockDispose.mockClear();

      registry.removeModelsByProvider(providerId);

      // Previous registration disposed
      expect(mockDispose).toHaveBeenCalledOnce();
    });

    it('fires onModelsChanged event', () => {
      registry.addModel(providerId, 'model-a', validConfig);
      const handler = vi.fn();
      registry.onModelsChanged(handler);

      registry.removeModelsByProvider(providerId);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not affect models from other providers', () => {
      const otherProviderId = 'other-provider-id';
      providerRepo.insert({
        id: otherProviderId,
        name: 'Other',
        baseUrl: 'https://other.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      registry.addModel(providerId, 'model-a', validConfig);
      registry.addModel(otherProviderId, 'model-b', validConfig);

      registry.removeModelsByProvider(providerId);

      expect(registry.getModels(providerId)).toHaveLength(0);
      expect(registry.getModels(otherProviderId)).toHaveLength(1);
    });

    it('is a no-op when provider has no models', () => {
      const handler = vi.fn();
      registry.onModelsChanged(handler);

      registry.removeModelsByProvider(providerId);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('registerAll', () => {
    it('registers a single provider for all enabled models', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      registry.addModel(providerId, 'gpt-4o-mini', validConfig);
      mockRegister.mockClear();

      registry.registerAll();

      expect(mockRegister).toHaveBeenCalledOnce();
      expect(mockRegister).toHaveBeenCalledWith(
        'tokenguard-copilot',
        expect.objectContaining({
          provideLanguageModelChatInformation: expect.any(Function),
          provideLanguageModelChatResponse: expect.any(Function),
          provideTokenCount: expect.any(Function),
        }),
      );
    });

    it('returns chat info for all enabled models', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      registry.addModel(providerId, 'gpt-4o-mini', validConfig);
      mockRegister.mockClear();

      registry.registerAll();

      const provider = mockRegister.mock.calls[0]![1]!;
      const infos = provider.provideLanguageModelChatInformation(
        {} as import('vscode').PrepareLanguageModelChatModelOptions,
        null as unknown as import('vscode').CancellationToken,
      );
      expect(infos).toHaveLength(2);
    });

    it('sets toolCalling and imageInput capabilities', () => {
      const visionConfig = { ...validConfig, vision: true };
      registry.addModel(providerId, 'gpt-4o', visionConfig);
      registry.addModel(providerId, 'gpt-4o-mini', validConfig);
      mockRegister.mockClear();

      registry.registerAll();

      const provider = mockRegister.mock.calls[0]![1]!;
      const infos = provider.provideLanguageModelChatInformation(
        {} as import('vscode').PrepareLanguageModelChatModelOptions,
        null as unknown as import('vscode').CancellationToken,
      ) as import('vscode').LanguageModelChatInformation[];
      expect(infos[0]!.capabilities).toEqual({
        toolCalling: true,
        imageInput: true,
      });
      expect(infos[1]!.capabilities).toEqual({
        toolCalling: true,
        imageInput: false,
      });
    });

    it('attaches configurationSchema for models with reasoningEffortMap', () => {
      registry.addModel(providerId, 'o3', {
        ...validConfig,
        reasoningEffortMap:
          '{"low":{"reasoning_effort":"low"},"medium":{"reasoning_effort":"medium"},"high":{"reasoning_effort":"high"}}',
        defaultReasoningEffort: 'medium',
      });
      mockRegister.mockClear();

      registry.registerAll();

      const provider = mockRegister.mock.calls[0]![1]!;
      const infos = provider.provideLanguageModelChatInformation(
        {} as import('vscode').PrepareLanguageModelChatModelOptions,
        null as unknown as import('vscode').CancellationToken,
      ) as unknown as Record<string, unknown>[];
      expect(infos[0]!.configurationSchema).toEqual({
        properties: {
          reasoningEffort: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            default: 'medium',
          },
        },
      });
    });

    it('omits configurationSchema for models without reasoningEffortMap', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      mockRegister.mockClear();

      registry.registerAll();

      const provider = mockRegister.mock.calls[0]![1]!;
      const infos = provider.provideLanguageModelChatInformation(
        {} as import('vscode').PrepareLanguageModelChatModelOptions,
        null as unknown as import('vscode').CancellationToken,
      ) as unknown as Record<string, unknown>[];
      expect(infos[0]!.configurationSchema).toBeUndefined();
    });

    it('provides onDidChangeLanguageModelChatInformation event', () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      mockRegister.mockClear();

      registry.registerAll();

      const provider = mockRegister.mock.calls[0]![1]!;
      expect(provider.onDidChangeLanguageModelChatInformation).toBeDefined();
    });
  });

  describe('disposeAll', () => {
    it('disposes all registrations', () => {
      const mockDispose = vi.fn();
      mockRegister.mockReturnValue({ dispose: mockDispose });

      registry.addModel(providerId, 'gpt-4o', validConfig);
      registry.registerAll();
      registry.disposeAll();

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('cacheControl', () => {
    it('persists cacheControl from addModel and returns it in ModelInfo', () => {
      const cacheControl: CacheControlConfig = {
        enabled: true,
        maxMarkers: 4,
        ttl: '5m',
      };
      const model = registry.addModel(providerId, 'qwen-model', {
        ...validConfig,
        cacheControl,
      });
      expect(model.cacheControl).toEqual(cacheControl);

      const models = registry.getModels();
      expect(models).toHaveLength(1);
      expect(models[0].cacheControl).toEqual(cacheControl);
    });

    it('updates cacheControl via updateModel', () => {
      registry.addModel(providerId, 'qwen-model', validConfig);
      const updated = registry.updateModel(providerId, 'qwen-model', {
        ...validConfig,
        cacheControl: {
          enabled: true,
          maxMarkers: 2,
        },
      });
      expect(updated.cacheControl).toEqual({
        enabled: true,
        maxMarkers: 2,
      });
    });

    it('returns null cacheControl when not configured', () => {
      const model = registry.addModel(providerId, 'gpt-4o', validConfig);
      expect(model.cacheControl).toBeNull();
    });
  });

  describe('customFields', () => {
    it('persists customFields from addModel and returns it in ModelInfo', () => {
      const customFields = JSON.stringify([
        { property: 'reasoning_split', type: 'boolean', value: 'true' },
      ]);
      const model = registry.addModel(providerId, 'custom-model', {
        ...validConfig,
        customFields,
      });
      expect(model.customFields).toBe(customFields);

      const models = registry.getModels();
      expect(models).toHaveLength(1);
      expect(models[0].customFields).toBe(customFields);
    });

    it('updates customFields via updateModel', () => {
      registry.addModel(providerId, 'custom-model', validConfig);
      const newFields = JSON.stringify([{ property: 'foo', type: 'string', value: 'bar' }]);
      const updated = registry.updateModel(providerId, 'custom-model', {
        ...validConfig,
        customFields: newFields,
      });
      expect(updated.customFields).toBe(newFields);
    });

    it('returns null customFields when not configured', () => {
      const model = registry.addModel(providerId, 'gpt-4o', validConfig);
      expect(model.customFields).toBeNull();
    });
  });

  describe('provideTokenCount', () => {
    it('calls countTokens for string input', async () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      mockRegister.mockClear();

      registry.registerAll();

      const provider = mockRegister.mock.calls[0]![1]!;
      const result = await provider.provideTokenCount(
        { id: 'test-model' } as import('vscode').LanguageModelChatInformation,
        'Hello world',
        null as unknown as import('vscode').CancellationToken,
      );
      expect(result).toBe(0);
    });

    it('calls countMessageTokens for message input', async () => {
      registry.addModel(providerId, 'gpt-4o', validConfig);
      mockRegister.mockClear();

      registry.registerAll();

      const provider = mockRegister.mock.calls[0]![1]!;
      const msg = {
        role: 1,
        content: [],
        name: undefined,
      };
      const result = await provider.provideTokenCount(
        { id: 'test-model' } as import('vscode').LanguageModelChatInformation,
        msg as unknown as import('vscode').LanguageModelChatRequestMessage,
        null as unknown as import('vscode').CancellationToken,
      );
      expect(result).toBe(0);
    });
  });
});
