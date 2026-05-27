import * as vscode from 'vscode';
import type { ModelInfo, FetchedModel, ModelConfig, CacheControlConfig } from '@tokenguard/shared';
import type { ModelRepository } from '../../repositories/model-repository.js';
import type { ProviderRepository } from '../../repositories/provider-repository.js';
import type { Model, Provider } from '../../db/schema.js';
import {
  ChatHandler,
  type ChatContext,
  type OpenAITool,
  type UsageCollector,
} from '../chat-handler/chat-handler.js';
import type { ChatDebugLogger } from '../chat-debug-logger/index.js';
import type { ModelDefaults } from '../model-defaults/model-defaults.js';
import type { TokenCounter } from '../token-counter/index.js';
import type { ReasoningCacheService } from '../reasoning-cache/reasoning-cache-service.js';
import type { UsageTracker } from '../usage-tracker/index.js';

/**
 * Manages model lifecycle: fetch from providers, persist
 * configuration, register/unregister with VS Code's
 * languageModelChatProvider API.
 */
export class ModelRegistry {
  private readonly emitter = new vscode.EventEmitter<void>();

  /** Fires after models are added, modified, or removed. */
  readonly onModelsChanged = this.emitter.event;

  /** Disposable for the single registered chat model provider. */
  private registration: vscode.Disposable | null = null;

  /**
   * Emitter for `onDidChangeLanguageModelChatInformation`.
   * Firing this forces Copilot Chat to re-query model info
   * through the non-cached path, correctly picking up
   * `configurationSchema` and other extended properties.
   */
  private readonly chatInfoEmitter = new vscode.EventEmitter<void>();

  /**
   * Creates a new ModelRegistry.
   *
   * @param modelRepo - Data-access layer for the models table.
   * @param providerRepo - Data-access layer for the providers
   *   table (used to look up provider info for fetch).
   * @param secrets - VS Code SecretStorage for API keys.
   * @param getDefaults - Lookup function for bundled model
   *   defaults (used for reasoning effort translation).
   * @param chatDebugLogger - Logger for debug log files.
   * @param tokenCounter - Token counting service for
   *   provideTokenCount.
   */
  constructor(
    private readonly modelRepo: ModelRepository,
    private readonly providerRepo: ProviderRepository,
    private readonly secrets: vscode.SecretStorage,
    private readonly getDefaults: (modelId: string) => ModelDefaults | null,
    private readonly chatDebugLogger: ChatDebugLogger,
    private readonly tokenCounter: TokenCounter,
    private readonly reasoningCacheService: ReasoningCacheService,
    private readonly usageTracker: UsageTracker,
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
    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey ?? ''}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    const data = body.data ?? [];

    // Get already-added model IDs to exclude
    const existing = new Set(this.modelRepo.findActive(providerId).map((m) => m.id));

    return data
      .filter((entry) => typeof entry.id === 'string' && !existing.has(entry.id))
      .map((entry) => parseFetchedModel(entry));
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
      createdAt: now,
      updatedAt: now,
    });

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
    });

    if (!updated) {
      throw new Error('Model not found');
    }

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

    this.refreshRegistration();
    this.emitter.fire();
  }

  /**
   * Registers all enabled non-removed models with VS Code's
   * languageModelChatProvider API. Called on activation.
   */
  registerAll(): void {
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

    const chatInfos: vscode.LanguageModelChatInformation[] = [];

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
                  enum: keys,
                  default: model.defaultReasoningEffort ?? keys[0],
                },
              },
            };
          }
        } catch {
          // Invalid JSON — skip schema
          // TODO: Log error
        }
      }

      chatInfos.push({
        id: identifier,
        name: model.displayName ?? `${provider.name}/${model.id}`,
        family: model.id,
        version: model.id,
        maxInputTokens: model.maxContextWindowTokens,
        maxOutputTokens: model.maxOutputTokens,
        isUserSelectable: true,
        capabilities: {
          toolCalling: true,
          imageInput: !!model.vision,
        },
        ...(configurationSchema ? { configurationSchema } : {}),
      } as vscode.LanguageModelChatInformation);
    }

    this.registration = vscode.lm.registerLanguageModelChatProvider('tokenguard-copilot', {
      onDidChangeLanguageModelChatInformation: this.chatInfoEmitter.event,
      provideLanguageModelChatInformation: () => chatInfos,
      provideLanguageModelChatResponse: async (modelInfo, messages, options, progress, token) => {
        const entry = modelMap.get(modelInfo.id);
        if (!entry) {
          throw new Error(`Unknown model: ${modelInfo.id}`);
        }

        const apiKey = await this.secrets.get(
          `tokenguard-copilot.provider.${entry.model.providerId}`,
        );

        // Read reasoning effort from model picker
        // selection or fall back to model's default.

        type ModelConfigurationOptions = vscode.ProvideLanguageModelChatResponseOptions & {
          readonly modelConfiguration?: Record<string, unknown>;
          readonly configuration?: Record<string, unknown>;
        };

        const extOptions = options as ModelConfigurationOptions;

        const configuredEffort =
          extOptions.modelConfiguration?.reasoningEffort ??
          extOptions.configuration?.reasoningEffort;

        const reasoningEffort =
          typeof configuredEffort === 'string'
            ? configuredEffort
            : (entry.model.defaultReasoningEffort ?? null);

        // Map VS Code toolMode to OpenAI tool_choice value.
        const toolMode: 'auto' | 'required' =
          options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';

        // Convert VS Code tools to OpenAI format
        const tools: OpenAITool[] | undefined =
          options.tools && options.tools.length > 0
            ? options.tools.map((tool) => ({
                type: 'function' as const,
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.inputSchema as Record<string, unknown> | undefined,
                },
              }))
            : undefined;

        const defaults = this.getDefaults(entry.model.id);

        // Cache control: model DB value takes precedence over defaults
        const cacheControl: CacheControlConfig | undefined = entry.model.cacheControl
          ? (JSON.parse(entry.model.cacheControl) as CacheControlConfig)
          : defaults?.cacheControl;

        const ctx: ChatContext = {
          model: entry.model,
          provider: entry.provider,
          apiKey: apiKey ?? '',
          defaults,
          reasoningEffort,
          tools,
          toolMode,
          chatDebugLogger: this.chatDebugLogger,
          workspaceFolderUri: vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? '',
          cacheControl,
        };

        const handler = new ChatHandler(ctx, this.reasoningCacheService);
        const usageCollector: UsageCollector = { usage: null };

        try {
          await handler.handle(messages, progress, token, usageCollector);
        } catch (e) {
          // Record error
          this.usageTracker.recordError(entry.model.providerId, entry.model.id);
          throw e;
        }

        // Record successful usage
        const usage = usageCollector.usage;
        this.usageTracker.recordUsage(entry.model.providerId, entry.model.id, {
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          cachedTokens: usage?.cachedTokens ?? 0,
          reasoningTokens: usage?.reasoningTokens ?? 0,
          success: true,
        });
      },
      provideTokenCount: async (_model, text) => {
        if (typeof text === 'string') {
          return this.tokenCounter.countTokens(text);
        }
        return this.tokenCounter.countMessageTokens(text);
      },
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
  };
}

/**
 * Parses a raw model object from the `/models` response into
 * a FetchedModel.
 *
 * @param entry - Raw model object from the API response.
 * @returns Parsed FetchedModel.
 */
function parseFetchedModel(entry: Record<string, unknown>): FetchedModel {
  const capabilities = entry.capabilities as Record<string, unknown> | undefined;
  const limits = capabilities?.limits as Record<string, unknown> | undefined;

  const defaultEffort = entry.defaultReasoningEffort;

  return {
    id: entry.id as string,
    name: typeof entry.name === 'string' ? entry.name : null,
    maxContextWindowTokens:
      typeof limits?.max_context_window_tokens === 'number'
        ? limits.max_context_window_tokens
        : null,
    maxOutputTokens:
      typeof limits?.max_output_tokens === 'number' ? limits.max_output_tokens : null,
    defaultReasoningEffort: typeof defaultEffort === 'string' ? defaultEffort : null,
    vision: typeof entry.vision === 'boolean' ? entry.vision : null,
  };
}
