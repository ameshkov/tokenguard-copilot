/** Cache control TTL enum. Maps to seconds only at wire-format level. */
export type CacheControlTtl = '5m' | '1h';

/** Cache control injection configuration for a model. */
export interface CacheControlConfig {
  /** Whether cache control injection is enabled. */
  enabled: boolean;
  /** Maximum number of cache control markers to inject. */
  maxMarkers: number;
  /** Optional TTL. Omitted = no TTL in marker. */
  ttl?: CacheControlTtl;
}

/** Provider metadata visible to the webview. */
export interface ProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
}

/** Model metadata visible to the webview. */
export interface ModelInfo {
  id: string;
  providerId: string;
  displayName: string | null;
  maxContextWindowTokens: number;
  maxOutputTokens: number;
  streaming: boolean;
  vision: boolean;
  temperature: number | null;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  defaultReasoningEffort: string | null;
  reasoningEffortMap: string | null;
  preserveReasoning: boolean;
  inputCostPer1m: number | null;
  outputCostPer1m: number | null;
  cachedInputCostPer1m: number | null;
  cacheControl: CacheControlConfig | null;
}

/** Model info fetched from a provider's /models endpoint. */
export interface FetchedModel {
  id: string;
  name: string | null;
  maxContextWindowTokens: number | null;
  maxOutputTokens: number | null;
  defaultReasoningEffort: string | null;
  vision: boolean | null;
}

/** Model defaults data returned to the webview. */
export interface ModelDefaultsResult {
  contextSize: number;
  maxTokens: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  cachedInputCostPer1M?: number;
  supportedCapabilities: string[];
  /** Maps reasoning effort level names to provider-specific
   *  chat completion body parameters. */
  reasoningEffortMap?: Record<string, Record<string, unknown>>;
  /** Default reasoning effort level for this model. When
   *  reasoningEffortMap is present, this must be one of its
   *  keys. */
  defaultReasoningEffort?: string;
  /** When true, preserve reasoning tokens between turns. */
  preserveReasoning?: boolean;
  /** Cache control injection configuration. */
  cacheControl?: CacheControlConfig;
}

/** Chat debug settings visible to the webview. */
export interface ChatDebugSettingsInfo {
  /** Whether debug logging is active. */
  enabled: boolean;
  /** Hours before logs are eligible for cleanup. */
  ttlHours: number;
}

/** Model configuration fields for add/edit. */
export interface ModelConfig {
  displayName: string | null;
  maxContextWindowTokens: number;
  maxOutputTokens: number;
  streaming: boolean;
  vision: boolean;
  temperature: number | null;
  topP: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  defaultReasoningEffort: string | null;
  reasoningEffortMap: string | null;
  preserveReasoning: boolean;
  inputCostPer1m: number | null;
  outputCostPer1m: number | null;
  cachedInputCostPer1m: number | null;
  cacheControl: CacheControlConfig | null;
}

/** Fetch usage statistics. */
export interface GetUsageStatsRequest extends WebviewRequest {
  type: 'getUsageStats';
  period?: string;
  providerIds?: string[];
  modelIds?: string[];
}

/** Reset usage statistics. */
export interface ResetUsageStatsRequest extends WebviewRequest {
  type: 'resetUsageStats';
  scope: 'all' | 'provider' | 'model';
  providerId?: string;
  modelId?: string;
}

// ---- Requests: webview → host ----

/** Base for all request messages. */
export interface WebviewRequest {
  requestId: string;
}

/** Fetch the list of active providers. */
export interface GetProvidersRequest extends WebviewRequest {
  type: 'getProviders';
}

/** Add a new provider. */
export interface AddProviderRequest extends WebviewRequest {
  type: 'addProvider';
  name: string;
  baseUrl: string;
  apiKey: string;
}

/** Edit an existing provider. */
export interface EditProviderRequest extends WebviewRequest {
  type: 'editProvider';
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

/** Remove a provider (soft-delete). */
export interface RemoveProviderRequest extends WebviewRequest {
  type: 'removeProvider';
  id: string;
}

/** Reset all settings (clear DB + secrets). */
export interface ResetSettingsRequest extends WebviewRequest {
  type: 'resetSettings';
}

/** Fetch all configured (non-removed) models. */
export interface GetModelsRequest extends WebviewRequest {
  type: 'getModels';
}

/** Fetch available models from a provider endpoint. */
export interface FetchAvailableModelsRequest extends WebviewRequest {
  type: 'fetchAvailableModels';
  providerId: string;
}

/** Add a model to a provider. */
export interface AddModelRequest extends WebviewRequest {
  type: 'addModel';
  providerId: string;
  modelId: string;
  config: ModelConfig;
}

/** Edit an existing model's configuration. */
export interface EditModelRequest extends WebviewRequest {
  type: 'editModel';
  providerId: string;
  modelId: string;
  config: ModelConfig;
}

/** Remove a model (soft-delete). */
export interface RemoveModelRequest extends WebviewRequest {
  type: 'removeModel';
  providerId: string;
  modelId: string;
}

/** Get bundled defaults for a model ID. */
export interface GetModelDefaultsRequest extends WebviewRequest {
  type: 'getModelDefaults';
  modelId: string;
}

/** Fetch current chat debug settings. */
export interface GetChatDebugSettingsRequest extends WebviewRequest {
  type: 'getChatDebugSettings';
}

/** Update chat debug settings. */
export interface UpdateChatDebugSettingsRequest extends WebviewRequest {
  type: 'updateChatDebugSettings';
  enabled?: boolean;
  ttlHours?: number;
}

/** Clear all chat debug logs. */
export interface ClearChatDebugLogsRequest extends WebviewRequest {
  type: 'clearChatDebugLogs';
}

/** Union of all webview → host messages. */
export type WebviewCommand =
  | GetProvidersRequest
  | AddProviderRequest
  | EditProviderRequest
  | RemoveProviderRequest
  | ResetSettingsRequest
  | GetModelsRequest
  | FetchAvailableModelsRequest
  | AddModelRequest
  | EditModelRequest
  | RemoveModelRequest
  | GetModelDefaultsRequest
  | GetChatDebugSettingsRequest
  | UpdateChatDebugSettingsRequest
  | ClearChatDebugLogsRequest
  | GetUsageStatsRequest
  | ResetUsageStatsRequest;

// ---- Responses: host → webview ----

/** Base for all response messages. */
export interface HostResponse {
  requestId: string;
}

/** Response to GetProvidersRequest. */
export interface GetProvidersResponse extends HostResponse {
  type: 'getProvidersResult';
  providers: ProviderInfo[];
}

/** Response to AddProviderRequest. */
export interface AddProviderResponse extends HostResponse {
  type: 'addProviderResult';
  success: boolean;
  provider?: ProviderInfo;
  error?: string;
}

/** Response to EditProviderRequest. */
export interface EditProviderResponse extends HostResponse {
  type: 'editProviderResult';
  success: boolean;
  provider?: ProviderInfo;
  error?: string;
}

/** Response to RemoveProviderRequest. */
export interface RemoveProviderResponse extends HostResponse {
  type: 'removeProviderResult';
  success: boolean;
  error?: string;
}

/** Response to ResetSettingsRequest. */
export interface ResetSettingsResponse extends HostResponse {
  type: 'resetSettingsResult';
  success: boolean;
  error?: string;
}

/** Response to GetModelsRequest. */
export interface GetModelsResponse extends HostResponse {
  type: 'getModelsResult';
  models: ModelInfo[];
}

/** Response to FetchAvailableModelsRequest. */
export interface FetchAvailableModelsResponse extends HostResponse {
  type: 'fetchAvailableModelsResult';
  success: boolean;
  models?: FetchedModel[];
  error?: string;
}

/** Response to AddModelRequest. */
export interface AddModelResponse extends HostResponse {
  type: 'addModelResult';
  success: boolean;
  model?: ModelInfo;
  error?: string;
}

/** Response to EditModelRequest. */
export interface EditModelResponse extends HostResponse {
  type: 'editModelResult';
  success: boolean;
  model?: ModelInfo;
  error?: string;
}

/** Response to RemoveModelRequest. */
export interface RemoveModelResponse extends HostResponse {
  type: 'removeModelResult';
  success: boolean;
  error?: string;
}

/** Response to GetModelDefaultsRequest. */
export interface GetModelDefaultsResponse extends HostResponse {
  type: 'getModelDefaultsResult';
  defaults: ModelDefaultsResult | null;
}

/** Response to GetChatDebugSettingsRequest. */
export interface GetChatDebugSettingsResponse extends HostResponse {
  type: 'getChatDebugSettingsResult';
  settings: ChatDebugSettingsInfo;
}

/** Response to UpdateChatDebugSettingsRequest. */
export interface UpdateChatDebugSettingsResponse extends HostResponse {
  type: 'updateChatDebugSettingsResult';
  success: boolean;
  settings?: ChatDebugSettingsInfo;
  error?: string;
}

/** Response to ClearChatDebugLogsRequest. */
export interface ClearChatDebugLogsResponse extends HostResponse {
  type: 'clearChatDebugLogsResult';
  success: boolean;
  error?: string;
}

/** Union of all host → webview messages. */
export type HostMessage =
  | GetProvidersResponse
  | AddProviderResponse
  | EditProviderResponse
  | RemoveProviderResponse
  | ResetSettingsResponse
  | GetModelsResponse
  | FetchAvailableModelsResponse
  | AddModelResponse
  | EditModelResponse
  | RemoveModelResponse
  | GetModelDefaultsResponse
  | GetChatDebugSettingsResponse
  | UpdateChatDebugSettingsResponse
  | ClearChatDebugLogsResponse
  | GetUsageStatsResponse
  | ResetUsageStatsResponse;

// ---- Usage Stats types ----

/** A single daily usage record. */
export interface UsageRecordInfo {
  providerId: string;
  modelId: string;
  date: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  requestCount: number;
  errorCount: number;
  estimatedCost: number;
}

/** Named entity entry for filter dropdowns. */
export interface NamedEntityInfo {
  name: string;
  removed: boolean;
}

/** Per-model cost breakdown entry. */
export interface PerModelBreakdown {
  providerId: string;
  modelId: string;
  displayName: string | null;
  inputCostPer1m: number | null;
  outputCostPer1m: number | null;
  cachedInputCostPer1m: number | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  estimatedCost: number;
}

/** Aggregated usage statistics summary. */
export interface UsageStatsSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalReasoningTokens: number;
  totalRequestCount: number;
  totalErrorCount: number;
  totalEstimatedCost: number;
  providerNames: Record<string, NamedEntityInfo>;
  modelNames: Record<string, NamedEntityInfo>;
  perModelBreakdown: PerModelBreakdown[];
}

/** Response to GetUsageStatsRequest. */
export interface GetUsageStatsResponse extends HostResponse {
  type: 'getUsageStatsResult';
  records: UsageRecordInfo[];
  summary: UsageStatsSummary;
}

/** Response to ResetUsageStatsRequest. */
export interface ResetUsageStatsResponse extends HostResponse {
  type: 'resetUsageStatsResult';
  success: boolean;
  error?: string;
}
