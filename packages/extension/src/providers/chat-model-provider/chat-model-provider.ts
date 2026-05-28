import * as vscode from 'vscode';
import type { CacheControlConfig } from '@tokenguard/shared';
import type { Model, Provider } from '../../db/schema.js';
import {
  ChatHandler,
  type ChatContext,
  type OpenAITool,
  type UsageCollector,
} from '../../services/chat-handler/chat-handler.js';
import type { ChatDebugLogger } from '../../services/chat-debug-logger/index.js';
import type { TokenCounter } from '../../services/token-counter/index.js';
import type { ReasoningCacheService } from '../../services/reasoning-cache/reasoning-cache-service.js';
import type { UsageTracker } from '../../services/usage-tracker/index.js';

/**
 * Map entry associating a model with its provider for
 * dispatching chat responses.
 */
export interface ModelMapEntry {
  /** The database model row. */
  model: Model;
  /** The database provider row. */
  provider: Provider;
}

/**
 * Dependencies required to create a
 * {@link ChatModelProvider}.
 */
export interface ChatModelProviderDeps {
  /** Lookup map: model identifier → model + provider. */
  modelMap: ReadonlyMap<string, ModelMapEntry>;
  /** Pre-built chat information objects for VS Code. */
  chatInfos: vscode.LanguageModelChatInformation[];
  /**
   * Emitter that fires when model information changes.
   * The provider subscribes to its event so VS Code
   * re-queries model info.
   */
  chatInfoEmitter: vscode.EventEmitter<void>;
  /** VS Code SecretStorage for API keys. */
  secrets: vscode.SecretStorage;
  /** Logger for debug log files. */
  chatDebugLogger: ChatDebugLogger;
  /** Token counting service for provideTokenCount. */
  tokenCounter: TokenCounter;
  /** Reasoning cache service for preserving reasoning. */
  reasoningCacheService: ReasoningCacheService;
  /** Usage tracker for recording request metrics. */
  usageTracker: UsageTracker;
}

/**
 * Registers models with VS Code's
 * `languageModelChatProvider` API and handles the
 * `provideLanguageModelChatResponse`,
 * `provideLanguageModelChatInformation`, and
 * `provideTokenCount` callbacks.
 *
 * Sits at the provider layer — receives data from
 * `ModelRegistry` (service layer) and delegates request
 * handling to `ChatHandler`.
 */
export class ChatModelProvider {
  /**
   * Registers all models with VS Code and returns a
   * disposable that unregisters the provider.
   *
   * @param deps - Provider dependencies including model
   *   map, chat infos, and service instances.
   * @returns A disposable that unregisters the provider.
   */
  static register(deps: ChatModelProviderDeps): vscode.Disposable {
    return vscode.lm.registerLanguageModelChatProvider('tokenguard-copilot', {
      onDidChangeLanguageModelChatInformation: deps.chatInfoEmitter.event,
      provideLanguageModelChatInformation: () => deps.chatInfos,
      provideLanguageModelChatResponse: async (modelInfo, messages, options, progress, token) => {
        const entry = deps.modelMap.get(modelInfo.id);
        if (!entry) {
          throw new Error(`Unknown model: ${modelInfo.id}`);
        }

        const apiKey = await deps.secrets.get(
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

        // Map VS Code toolMode to OpenAI tool_choice.
        const toolMode: 'auto' | 'required' =
          options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';

        // Convert VS Code tools to OpenAI format.
        const tools: OpenAITool[] | undefined =
          options.tools && options.tools.length > 0
            ? options.tools.map((tool) => ({
                type: 'function' as const,
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: (tool.inputSchema ?? {
                    type: 'object',
                    properties: {},
                  }) as Record<string, unknown>,
                },
              }))
            : undefined;

        // Cache control from model DB settings.
        const cacheControl: CacheControlConfig | undefined = entry.model.cacheControl
          ? (JSON.parse(entry.model.cacheControl) as CacheControlConfig)
          : undefined;

        const ctx: ChatContext = {
          model: entry.model,
          provider: entry.provider,
          apiKey: apiKey ?? '',
          reasoningEffort,
          tools,
          toolMode,
          chatDebugLogger: deps.chatDebugLogger,
          workspaceFolderUri: vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? '',
          cacheControl,
        };

        const handler = new ChatHandler(ctx, deps.reasoningCacheService);
        const usageCollector: UsageCollector = {
          usage: null,
        };

        try {
          await handler.handle(messages, progress, token, usageCollector);
        } catch (e) {
          deps.usageTracker.recordError(entry.model.providerId, entry.model.id);
          throw e;
        }

        // Record successful usage.
        const usage = usageCollector.usage;
        deps.usageTracker.recordUsage(entry.model.providerId, entry.model.id, {
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          cachedTokens: usage?.cachedTokens ?? 0,
          reasoningTokens: usage?.reasoningTokens ?? 0,
          success: true,
        });
      },
      provideTokenCount: async (_model, text) => {
        if (typeof text === 'string') {
          return deps.tokenCounter.countTokens(text);
        }
        return deps.tokenCounter.countMessageTokens(text);
      },
    });
  }
}
