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

/** Allowed types for a custom request body field. */
export type CustomFieldType = 'string' | 'number' | 'boolean' | 'json';

/**
 * A user-defined key-value pair injected into the chat
 * completion request body.
 */
export interface CustomField {
  /** Top-level request body property name. */
  property: string;
  /** Value type — determines validation and serialization. */
  type: CustomFieldType;
  /** Raw value as entered by the user. */
  value: string;
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
  customFields: string | null;
}

/** Model info fetched from a provider's /models endpoint. */
export interface FetchedModel {
  id: string;
  name: string | null;
  maxContextWindowTokens: number | null;
  maxOutputTokens: number | null;
  defaultReasoningEffort: string | null;
  vision: boolean | null;
  /** Reasoning effort levels supported by the provider. */
  supportedReasoningEfforts: string[] | null;
  /** Cost per 1M input tokens from provider pricing, if available. */
  inputCostPer1M: number | null;
  /** Cost per 1M output tokens from provider pricing, if available. */
  outputCostPer1M: number | null;
  /** Cost per 1M cached input tokens from provider pricing, if available. */
  cachedInputCostPer1M: number | null;
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
  /** Custom request body fields pre-filled from bundled
   *  model defaults. Keys are property names, values are
   *  typed defaults. */
  customFields?: Record<string, unknown>;
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
  customFields: string | null;
}

/** A content transformation rule applied to messages before
 *  they reach the language model. */
export interface ContentRuleInfo {
  /** Unique identifier (UUID v4). */
  id: string;
  /** User-defined label. Must be non-empty and unique. */
  name: string;
  /** Whether the rule participates in processing. */
  enabled: boolean;
  /** Role filter: 'system', 'user', or 'all' to match all roles. */
  matchRole: 'system' | 'user' | 'all';
  /** 0-indexed position in the messages array, or null for no filter. */
  matchMessageNumber: number | null;
  /** Glob/wildcard pattern for model ID, or null for no filter. */
  matchModelPattern: string | null;
  /** Regex pattern the message content must match for the rule to
   *  apply. Uses {@link regexFlags} for matching behavior. Null or
   *  empty means no content filter. */
  matchContentPattern: string | null;
  /** Tools that must ALL be present. Null or empty = no requirement. */
  matchToolPresent: string[] | null;
  /** Tools that must ALL be absent. Null or empty = no requirement. */
  matchToolAbsent: string[] | null;
  /** The find regex pattern (JavaScript RegExp syntax). */
  regexPattern: string;
  /** Regex flags string (e.g., 'gi', 'gim'). Applied to both
   *  {@link regexPattern} (find-replace) and
   *  {@link matchContentPattern} (content matching). */
  regexFlags: string;
  /** Replacement string with $1, $2 capture group references. */
  substitution: string;
  /** Position in the ordered rules list. */
  sortOrder: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-modification timestamp. */
  updatedAt: string;
}

/** Parameters for creating or updating a content rule.
 *  Server-generated fields (id, sortOrder, timestamps) are
 *  excluded. */
export interface AddContentRuleParams {
  name: string;
  enabled: boolean;
  matchRole: 'system' | 'user' | 'all';
  matchMessageNumber: number | null;
  matchModelPattern: string | null;
  matchContentPattern: string | null;
  matchToolPresent: string[] | null;
  matchToolAbsent: string[] | null;
  regexPattern: string;
  regexFlags: string;
  substitution: string;
}

/** Fetch all content rules, ordered by sortOrder. */
export interface GetContentRulesRequest extends WebviewRequest {
  type: 'getContentRules';
}

/** Fetch a single content rule by ID. */
export interface GetContentRuleRequest extends WebviewRequest {
  type: 'getContentRule';
  id: string;
}

/** Add a new content rule. */
export interface AddContentRuleRequest extends WebviewRequest {
  type: 'addContentRule';
  params: AddContentRuleParams;
}

/** Update an existing content rule. */
export interface UpdateContentRuleRequest extends WebviewRequest {
  type: 'updateContentRule';
  id: string;
  params: Partial<AddContentRuleParams>;
}

/** Delete a content rule. */
export interface DeleteContentRuleRequest extends WebviewRequest {
  type: 'deleteContentRule';
  id: string;
}

/** Reorder content rules by providing the full ordered list of IDs. */
export interface ReorderContentRulesRequest extends WebviewRequest {
  type: 'reorderContentRules';
  orderedIds: string[];
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
  | ResetUsageStatsRequest
  | GetContentRulesRequest
  | GetContentRuleRequest
  | AddContentRuleRequest
  | UpdateContentRuleRequest
  | DeleteContentRuleRequest
  | ReorderContentRulesRequest;

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

/** Response to GetContentRulesRequest. */
export interface GetContentRulesResponse extends HostResponse {
  type: 'getContentRulesResult';
  rules: ContentRuleInfo[];
}

/** Response to GetContentRuleRequest. */
export interface GetContentRuleResponse extends HostResponse {
  type: 'getContentRuleResult';
  rule: ContentRuleInfo | null;
}

/** Response to AddContentRuleRequest. */
export interface AddContentRuleResponse extends HostResponse {
  type: 'addContentRuleResult';
  success: boolean;
  rule?: ContentRuleInfo;
  error?: string;
}

/** Response to UpdateContentRuleRequest. */
export interface UpdateContentRuleResponse extends HostResponse {
  type: 'updateContentRuleResult';
  success: boolean;
  rule?: ContentRuleInfo;
  error?: string;
}

/** Response to DeleteContentRuleRequest. */
export interface DeleteContentRuleResponse extends HostResponse {
  type: 'deleteContentRuleResult';
  success: boolean;
  error?: string;
}

/** Response to ReorderContentRulesRequest. */
export interface ReorderContentRulesResponse extends HostResponse {
  type: 'reorderContentRulesResult';
  success: boolean;
  rules?: ContentRuleInfo[];
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
  | ResetUsageStatsResponse
  | GetContentRulesResponse
  | GetContentRuleResponse
  | AddContentRuleResponse
  | UpdateContentRuleResponse
  | DeleteContentRuleResponse
  | ReorderContentRulesResponse;

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
  promptTokensCost: number;
  completionTokensCost: number;
  cachedTokensCost: number;
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
  promptTokensCost: number;
  completionTokensCost: number;
  cachedTokensCost: number;
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
