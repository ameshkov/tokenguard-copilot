import { EventEmitter } from 'vscode';
import type { Disposable, LanguageModelChatInformation, SecretStorage } from 'vscode';
import type { ModelInfo, FetchedModel, ModelConfig, CacheControlConfig } from '@tokenguard/shared';
import type { ModelRepository, ProviderRepository } from '../../repositories/index.js';
import type { Model, Provider } from '../../db/index.js';
import type { ChatDebugLogger } from '../chat-debug-logger/index.js';
import type { TokenCounter } from '../token-counter/index.js';
import type { ReasoningCacheService } from '../reasoning-cache/index.js';
import type { UsageTracker } from '../usage-tracker/index.js';
import type { ContentRulesService } from '../content-rules/index.js';
import { ChatModelProvider } from '../../providers/index.js';
import type { Logger } from '../../logger/index.js';
import { buildUserAgent } from '../../utils/index.js';

/**
 * Manages model lifecycle: fetch from providers, persist
 * configuration, and orchestrate registration with VS Code
 * via {@link ChatModelProvider}.
 */
export class ModelRegistry {
  private readonly emitter = new EventEmitter<void>();

  /** Fires after models are added, modified, or removed. */
  readonly onModelsChanged = this.emitter.event;

  /** Disposable for the single registered chat model provider. */
  private registration: Disposable | null = null;

  /**
   * Emitter for `onDidChangeLanguageModelChatInformation`.
   * Firing this forces Copilot Chat to re-query model info
   * through the non-cached path, correctly picking up
   * `configurationSchema` and other extended properties.
   */
  private readonly chatInfoEmitter = new EventEmitter<void>();

  /**
   * Creates a new ModelRegistry.
   *
   * @param modelRepo - Data-access layer for the models table.
   * @param providerRepo - Data-access layer for the providers
   *   table (used to look up provider info for fetch).
   * @param secrets - VS Code SecretStorage for API keys.
   * @param chatDebugLogger - Logger for debug log files.
   * @param tokenCounter - Token counting service for
   *   provideTokenCount.
   * @param reasoningCacheService - Service for caching reasoning.
   * @param usageTracker - Service for tracking usage metrics.
   * @param logger - Logger for runtime diagnostics.
   * @param version - Extension version for User-Agent header.
   */
  constructor(
    private readonly modelRepo: ModelRepository,
    private readonly providerRepo: ProviderRepository,
    private readonly secrets: SecretStorage,
    private readonly chatDebugLogger: ChatDebugLogger,
    private readonly tokenCounter: TokenCounter,
    private readonly reasoningCacheService: ReasoningCacheService,
    private readonly usageTracker: UsageTracker,
    private readonly contentRulesService: ContentRulesService,
    private readonly logger: Logger,
    private readonly version: string,
  ) {}

  /**
   * Fetches available models from a provider's `/models`
   * endpoint, excluding models already added.
   *
   * @param providerId - The provider ID.
   * @returns Array of fetched model info objects.
   * @throws Error if provider not found or fetch fails.
   */
  async fetchModels(providerId: string): Promise<FetchedModel[]> {
    const provider = this.providerRepo.findById(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const apiKey = await this.secrets.get(`tokenguard-copilot.provider.${providerId}`);

    const modelsUrl = provider.baseUrl.replace(/\/+$/, '') + '/models';
    this.logger.debug(
      'Fetching models from provider',
      `provider=${provider.name}`,
      `url=${modelsUrl}`,
    );

    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey ?? ''}`,
        'User-Agent': buildUserAgent(this.version),
      },
    });

    if (!response.ok) {
      this.logger.warn(
        'Failed to fetch models',
        `provider=${provider.name}`,
        `status=${response.status}`,
      );
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    const data = body.data ?? [];

    // Get already-added model IDs to exclude
    const existing = new Set(this.modelRepo.findActive(providerId).map((m) => m.id));

    const fetched = data
      .filter((entry) => typeof entry.id === 'string' && !existing.has(entry.id))
      .map((entry) => parseFetchedModel(entry));

    this.logger.debug(
      'Models fetched',
      `provider=${provider.name}`,
      `total=${data.length}`,
      `new=${fetched.length}`,
      `existing=${existing.size}`,
    );

    return fetched;
  }

  /**
   * Adds a model to a provider with the given configuration.
   *
   * @param providerId - The provider ID.
   * @param modelId - The model ID.
   * @param config - Model configuration.
   * @returns The created model info.
   * @throws Error if validation fails or model already exists.
   */
  addModel(providerId: string, modelId: string, config: ModelConfig): ModelInfo {
    const provider = this.providerRepo.findById(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    if (this.modelRepo.existsByKey(modelId, providerId)) {
      throw new Error(`Model "${modelId}" already exists for this provider`);
    }

    validateConfig(config);

    if (config.displayName !== null && this.modelRepo.existsByDisplayName(config.displayName)) {
      throw new Error('A model with this display name already exists');
    }

    const now = new Date().toISOString();

    // If a soft-deleted row exists for this model, reactivate
    // it instead of inserting a new row with a conflicting
    // primary key. This is the fix for:
    //   add a model → remove it → you cannot add it again
    const existing = this.modelRepo.findByKey(modelId, providerId);
    if (existing) {
      const row = this.modelRepo.reactivate(modelId, providerId, {
        displayName: config.displayName,
        maxContextWindowTokens: config.maxContextWindowTokens,
        maxOutputTokens: config.maxOutputTokens,
        streaming: config.streaming ? 1 : 0,
        vision: config.vision ? 1 : 0,
        temperature: config.temperature,
        topP: config.topP,
        frequencyPenalty: config.frequencyPenalty,
        presencePenalty: config.presencePenalty,
        defaultReasoningEffort: config.defaultReasoningEffort,
        reasoningEffortMap: config.reasoningEffortMap,
        preserveReasoning: config.preserveReasoning ? 1 : 0,
        inputCostPer1m: config.inputCostPer1m,
        outputCostPer1m: config.outputCostPer1m,
        cachedInputCostPer1m: config.cachedInputCostPer1m,
        cacheControl: config.cacheControl ? JSON.stringify(config.cacheControl) : null,
        customFields: config.customFields ?? null,
      });

      this.logger.debug(
        'Model reactivated',
        `model=${modelId}`,
        `provider_id=${providerId}`,
        `display_name=${config.displayName ?? modelId}`,
      );

      this.refreshRegistration();
      this.emitter.fire();
      return toModelInfo(row!);
    }

    const row = this.modelRepo.insert({
      id: modelId,
      providerId,
      displayName: config.displayName,
      maxContextWindowTokens: config.maxContextWindowTokens,
      maxOutputTokens: config.maxOutputTokens,
      streaming: config.streaming ? 1 : 0,
      vision: config.vision ? 1 : 0,
      temperature: config.temperature,
      topP: config.topP,
      frequencyPenalty: config.frequencyPenalty,
      presencePenalty: config.presencePenalty,
      defaultReasoningEffort: config.defaultReasoningEffort,
      reasoningEffortMap: config.reasoningEffortMap,
      preserveReasoning: config.preserveReasoning ? 1 : 0,
      inputCostPer1m: config.inputCostPer1m,
      outputCostPer1m: config.outputCostPer1m,
      cachedInputCostPer1m: config.cachedInputCostPer1m,
      cacheControl: config.cacheControl ? JSON.stringify(config.cacheControl) : null,
      customFields: config.customFields ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.debug(
      'Model added',
      `model=${row.id}`,
      `provider_id=${row.providerId}`,
      `display_name=${row.displayName ?? row.id}`,
    );

    this.refreshRegistration();
    this.emitter.fire();
    return toModelInfo(row);
  }

  /**
   * Updates a model's configuration.
   *
   * @param providerId - The provider ID.
   * @param modelId - The model ID.
   * @param config - Updated model configuration.
   * @returns The updated model info.
   * @throws Error if model not found or validation fails.
   */
  updateModel(providerId: string, modelId: string, config: ModelConfig): ModelInfo {
    validateConfig(config);

    if (
      config.displayName !== null &&
      this.modelRepo.existsByDisplayName(config.displayName, modelId, providerId)
    ) {
      throw new Error('A model with this display name already exists');
    }

    const updated = this.modelRepo.update(modelId, providerId, {
      displayName: config.displayName,
      maxContextWindowTokens: config.maxContextWindowTokens,
      maxOutputTokens: config.maxOutputTokens,
      streaming: config.streaming ? 1 : 0,
      vision: config.vision ? 1 : 0,
      temperature: config.temperature,
      topP: config.topP,
      frequencyPenalty: config.frequencyPenalty,
      presencePenalty: config.presencePenalty,
      defaultReasoningEffort: config.defaultReasoningEffort,
      reasoningEffortMap: config.reasoningEffortMap,
      preserveReasoning: config.preserveReasoning ? 1 : 0,
      inputCostPer1m: config.inputCostPer1m,
      outputCostPer1m: config.outputCostPer1m,
      cachedInputCostPer1m: config.cachedInputCostPer1m,
      cacheControl: config.cacheControl ? JSON.stringify(config.cacheControl) : null,
      customFields: config.customFields ?? null,
    });

    if (!updated) {
      throw new Error('Model not found');
    }

    this.logger.debug('Model updated', `model=${modelId}`, `provider_id=${providerId}`);

    this.refreshRegistration();
    this.emitter.fire();
    return toModelInfo(updated);
  }

  /**
   * Returns all non-removed models as ModelInfo objects.
   *
   * @param providerId - Optional provider ID filter.
   * @returns Array of model info objects.
   */
  getModels(providerId?: string): ModelInfo[] {
    return this.modelRepo.findActive(providerId).map(toModelInfo);
  }

  /**
   * Returns all models including removed, optionally
   * filtered by provider.
   *
   * @param providerId - Optional provider ID filter.
   * @returns Array of all model info objects.
   */
  getAllModels(providerId?: string): ModelInfo[] {
    return this.modelRepo.findAll(providerId).map(toModelInfo);
  }

  /**
   * Returns all models including removed, with the
   * `removed` flag from the database row.
   *
   * @returns Array of model info objects with status.
   */
  getAllModelsWithStatus(): (ModelInfo & {
    removed: boolean;
  })[] {
    return this.modelRepo.findAll().map((row) => ({
      ...toModelInfo(row),
      removed: row.removed === 1,
    }));
  }

  /**
   * Soft-removes a model and unregisters it from Copilot Chat.
   *
   * @param providerId - The provider ID.
   * @param modelId - The model ID.
   * @throws Error if model not found.
   */
  removeModel(providerId: string, modelId: string): void {
    const removed = this.modelRepo.softRemove(modelId, providerId);
    if (!removed) {
      throw new Error('Model not found');
    }

    this.logger.debug('Model removed', `model=${modelId}`, `provider_id=${providerId}`);

    this.refreshRegistration();
    this.emitter.fire();
  }

  /**
   * Soft-removes all models for a provider and unregisters them
   * from Copilot Chat.
   *
   * @param providerId - The provider whose models to remove.
   */
  removeModelsByProvider(providerId: string): void {
    const activeModels = this.modelRepo.findActive(providerId);

    for (const model of activeModels) {
      this.modelRepo.softRemove(model.id, model.providerId);
    }

    this.logger.debug(
      'All models removed for provider',
      `provider_id=${providerId}`,
      `count=${activeModels.length}`,
    );

    this.refreshRegistration();
    this.emitter.fire();
  }

  /**
   * Registers all enabled non-removed models with VS Code's
   * languageModelChatProvider API. Called on activation.
   */
  registerAll(): void {
    this.logger.info('Registering all enabled models');
    this.refreshRegistration();
  }

  /**
   * Re-registers the single chat model provider with all
   * currently active and enabled models. Disposes the previous
   * registration before creating a new one.
   */
  private refreshRegistration(): void {
    if (this.registration) {
      this.registration.dispose();
      this.registration = null;
    }

    const activeModels = this.modelRepo.findActive().filter((m) => m.enabled);

    if (activeModels.length === 0) return;

    // Build a lookup map for dispatching chat responses.
    const modelMap = new Map<string, { model: Model; provider: Provider }>();

    const chatInfos: LanguageModelChatInformation[] = [];

    for (const model of activeModels) {
      const provider = this.providerRepo.findById(model.providerId);
      if (!provider) continue;

      const identifier = `tokenguard-copilot.${provider.name}.${model.id}`;

      modelMap.set(identifier, { model, provider });

      // Parse reasoning effort map for
      // configurationSchema. Use the keys of the
      // reasoningEffortMap as the available effort levels.
      let configurationSchema: Record<string, unknown> | undefined;
      const effortMapRaw = model.reasoningEffortMap;
      if (effortMapRaw) {
        try {
          const parsed = JSON.parse(effortMapRaw) as Record<string, unknown>;
          const keys = Object.keys(parsed);
          if (keys.length > 0) {
            configurationSchema = {
              properties: {
                reasoningEffort: {
                  type: 'string',
                  title: 'Thinking Effort',
                  enum: keys,
                  enumItemLabels: keys.map(
                    (level) => level.charAt(0).toUpperCase() + level.slice(1),
                  ),
                  enumDescriptions: keys.map((level) => {
                    switch (level) {
                      case 'none':
                        return 'No reasoning applied';
                      case 'minimal':
                        return 'Minimal reasoning for fastest responses';
                      case 'low':
                        return 'Faster responses with less reasoning';
                      case 'medium':
                        return 'Balanced reasoning and speed';
                      case 'high':
                        return 'Greater reasoning depth but slower';
                      case 'xhigh':
                        return 'Highest reasoning depth but slowest';
                      case 'max':
                        return 'Absolute maximum capability with no constraints';
                      default:
                        return level;
                    }
                  }),
                  default: model.defaultReasoningEffort ?? keys[0],
                  group: 'navigation',
                },
              },
            };
          }
        } catch {
          // Invalid JSON — skip schema
          this.logger.warn('Invalid reasoningEffortMap JSON for model', model.id);
        }
      }

      const fullModelId = `${provider.name}/${model.id}`;
      const displayName = model.displayName ?? `${fullModelId}`;
      chatInfos.push({
        id: identifier,
        name: displayName,
        family: model.id,
        version: model.id,
        maxInputTokens: model.maxContextWindowTokens - model.maxOutputTokens,
        maxOutputTokens: model.maxOutputTokens,
        tooltip: `${displayName} is contributed via the TokenGuard Copilot (${fullModelId}).`,
        isUserSelectable: true,
        capabilities: {
          toolCalling: true,
          imageInput: !!model.vision,
        },
        ...(configurationSchema ? { configurationSchema } : {}),
      } as LanguageModelChatInformation);
    }

    this.registration = ChatModelProvider.register({
      modelMap,
      chatInfos,
      chatInfoEmitter: this.chatInfoEmitter,
      secrets: this.secrets,
      chatDebugLogger: this.chatDebugLogger,
      tokenCounter: this.tokenCounter,
      reasoningCacheService: this.reasoningCacheService,
      usageTracker: this.usageTracker,
      contentRulesService: this.contentRulesService,
      logger: this.logger,
      version: this.version,
    });

    // Force Copilot Chat to re-query model info through the
    // non-cached path so configurationSchema is picked up.
    this.chatInfoEmitter.fire();
  }

  /**
   * Disposes the model registration. Called on deactivation.
   */
  disposeAll(): void {
    if (this.registration) {
      this.registration.dispose();
      this.registration = null;
    }
    this.chatInfoEmitter.dispose();
    this.emitter.dispose();
  }
}

/**
 * Validates model configuration values.
 *
 * @param config - The configuration to validate.
 * @throws Error if any value is out of range.
 */
function validateConfig(config: ModelConfig): void {
  if (config.maxContextWindowTokens <= 0) {
    throw new Error('Max context window tokens must be positive');
  }
  if (config.maxOutputTokens <= 0) {
    throw new Error('Max output tokens must be positive');
  }
  if (config.maxOutputTokens >= config.maxContextWindowTokens) {
    throw new Error('Max output tokens must be less than max context window tokens');
  }
  if (config.temperature !== null && (config.temperature < 0 || config.temperature > 2)) {
    throw new Error('Temperature must be between 0 and 2');
  }
  if (config.topP !== null && (config.topP < 0 || config.topP > 1)) {
    throw new Error('Top P must be between 0 and 1');
  }
  if (
    config.frequencyPenalty !== null &&
    (config.frequencyPenalty < -2 || config.frequencyPenalty > 2)
  ) {
    throw new Error('Frequency penalty must be between -2 and 2');
  }
  if (
    config.presencePenalty !== null &&
    (config.presencePenalty < -2 || config.presencePenalty > 2)
  ) {
    throw new Error('Presence penalty must be between -2 and 2');
  }
}

/**
 * Maps a database Model row to a ModelInfo object for the
 * webview.
 *
 * @param row - Database model row.
 * @returns ModelInfo with all fields.
 */
function toModelInfo(row: Model): ModelInfo {
  return {
    id: row.id,
    providerId: row.providerId,
    displayName: row.displayName,
    maxContextWindowTokens: row.maxContextWindowTokens,
    maxOutputTokens: row.maxOutputTokens,
    streaming: row.streaming === 1,
    vision: row.vision === 1,
    temperature: row.temperature,
    topP: row.topP,
    frequencyPenalty: row.frequencyPenalty,
    presencePenalty: row.presencePenalty,
    defaultReasoningEffort: row.defaultReasoningEffort,
    reasoningEffortMap: row.reasoningEffortMap ?? null,
    preserveReasoning: row.preserveReasoning === 1,
    inputCostPer1m: row.inputCostPer1m,
    outputCostPer1m: row.outputCostPer1m,
    cachedInputCostPer1m: row.cachedInputCostPer1m,
    cacheControl: row.cacheControl ? (JSON.parse(row.cacheControl) as CacheControlConfig) : null,
    customFields: row.customFields ?? null,
  };
}

/**
 * Parses a raw model object from a provider's `/models` endpoint into
 * a FetchedModel.
 *
 * Extraction rules:
 * - vision is read from `capabilities.supports.vision` (nested path only).
 * - maxOutputTokens tries `limits.max_output_tokens` first, then falls
 *   back to `max_context_window_tokens - max_prompt_tokens` (assuming
 *   max_prompt_tokens is the max *input* token limit).
 * - supportedReasoningEfforts is read from the top-level array.
 * - Pricing (inputCostPer1M, outputCostPer1M, cachedInputCostPer1M)
 *   is read from the top-level `pricing` object. Values are treated
 *   as per-1M-tokens.
 *
 * @param entry - Raw model object from the API response.
 * @returns Parsed FetchedModel.
 */
function parseFetchedModel(entry: Record<string, unknown>): FetchedModel {
  const capabilities = entry.capabilities as Record<string, unknown> | undefined;
  const limits = capabilities?.limits as Record<string, unknown> | undefined;
  const supports = capabilities?.supports as Record<string, unknown> | undefined;
  const pricing = entry.pricing as Record<string, unknown> | undefined;

  const defaultEffort = entry.defaultReasoningEffort;

  // maxOutputTokens: try max_output_tokens first, then calculate
  let maxOutputTokens: number | null = null;
  if (typeof limits?.max_output_tokens === 'number') {
    maxOutputTokens = limits.max_output_tokens;
  } else if (
    typeof limits?.max_context_window_tokens === 'number' &&
    typeof limits?.max_prompt_tokens === 'number'
  ) {
    maxOutputTokens = limits.max_context_window_tokens - limits.max_prompt_tokens;
  }

  // supportedReasoningEfforts: validate as array of strings
  let supportedReasoningEfforts: string[] | null = null;
  const rawEfforts = entry.supportedReasoningEfforts;
  if (Array.isArray(rawEfforts)) {
    const strings = rawEfforts.filter((e): e is string => typeof e === 'string');
    if (strings.length > 0) {
      supportedReasoningEfforts = strings;
    }
  }

  // Pricing: extract from pricing object (values per 1M tokens)
  let inputCostPer1M: number | null = null;
  let outputCostPer1M: number | null = null;
  let cachedInputCostPer1M: number | null = null;
  if (pricing) {
    const parsePricingValue = (v: unknown): number | null => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const prompt = parsePricingValue(pricing.prompt);
    const inputCacheWrite = parsePricingValue(pricing.input_cache_write);
    // inputCostPer1M = prompt + input_cache_write (OpenRouter charges
    // cache writes as part of input; we assume all input is cached)
    inputCostPer1M = prompt !== null ? prompt + (inputCacheWrite ?? 0) : null;
    outputCostPer1M = parsePricingValue(pricing.completion);
    cachedInputCostPer1M = parsePricingValue(pricing.input_cache_read);
  }

  return {
    id: entry.id as string,
    name: typeof entry.name === 'string' ? entry.name : null,
    maxContextWindowTokens:
      typeof limits?.max_context_window_tokens === 'number'
        ? limits.max_context_window_tokens
        : null,
    maxOutputTokens,
    defaultReasoningEffort: typeof defaultEffort === 'string' ? defaultEffort : null,
    vision: typeof supports?.vision === 'boolean' ? supports.vision : null,
    supportedReasoningEfforts,
    inputCostPer1M,
    outputCostPer1M,
    cachedInputCostPer1M,
  };
}
