import type {
  ProviderInfo,
  ModelInfo,
  FetchedModel,
  ModelDefaultsResult,
} from '@tokenguard/shared';

/** Sample provider entries for the mock API. */
export const sampleProviders: ProviderInfo[] = [
  {
    id: 'prov-openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'prov-anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
  },
];

/** Sample configured models for the mock API. */
export const sampleModels: ModelInfo[] = [
  {
    id: 'gpt-4o',
    providerId: 'prov-openai',
    displayName: 'GPT-4o',
    maxContextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    streaming: true,
    vision: true,
    temperature: 0.7,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    supportedReasoningEfforts: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: false,
    inputCostPer1m: 2.5,
    outputCostPer1m: 10.0,
    cachedInputCostPer1m: 1.25,
  },
  {
    id: 'claude-sonnet-4-20250514',
    providerId: 'prov-anthropic',
    displayName: 'Claude Sonnet 4',
    maxContextWindowTokens: 200_000,
    maxOutputTokens: 16_000,
    streaming: true,
    vision: true,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    supportedReasoningEfforts: 'low,medium,high',
    defaultReasoningEffort: 'medium',
    reasoningEffortMap:
      '{"low":{"reasoning":{"effort":"low"}},"medium":{"reasoning":{"effort":"medium"}},"high":{"reasoning":{"effort":"high"}}}',
    preserveReasoning: true,
    inputCostPer1m: 3.0,
    outputCostPer1m: 15.0,
    cachedInputCostPer1m: 0.3,
  },
];

/** Models returned by a simulated /v1/models fetch. */
export const sampleFetchedModels: FetchedModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    maxContextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    supportedReasoningEfforts: null,
    defaultReasoningEffort: null,
    vision: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    maxContextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    supportedReasoningEfforts: null,
    defaultReasoningEffort: null,
    vision: true,
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    maxContextWindowTokens: 200_000,
    maxOutputTokens: 100_000,
    supportedReasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    vision: false,
  },
];

/** Bundled model defaults for the mock API. */
export const sampleDefaults: ModelDefaultsResult = {
  contextSize: 128_000,
  maxTokens: 16_384,
  inputCostPer1M: 2.5,
  outputCostPer1M: 10.0,
  cachedInputCostPer1M: 1.25,
  supportedCapabilities: ['streaming', 'vision'],
};
