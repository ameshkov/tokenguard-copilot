import {
  LanguageModelDataPart,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
} from 'vscode';
import type {
  CancellationToken,
  LanguageModelChatRequestMessage,
  LanguageModelResponsePart,
  Progress,
} from 'vscode';
import { randomUUID } from 'node:crypto';
import { USAGE_DATA_PART_MIME } from '@tokenguard/shared';
import type { CacheControlConfig, CustomField } from '@tokenguard/shared';
import type { Model, Provider } from '../../db/index.js';
import type { ChatDebugLogger } from '../chat-debug-logger/index.js';
import {
  extractReasoning,
  extractReasoningFields,
  reasoningToThinkingPart,
  summarizeError,
  truncate,
  buildUserAgent,
} from '../../utils/index.js';
import type { ReasoningFields } from '../../utils/index.js';
import type { ReasoningCacheService } from '../reasoning-cache/index.js';
import { CacheControlService } from '../cache-control/index.js';
import type { ContentRulesService, RuleApplicationResult } from '../content-rules/index.js';
import type { Logger } from '../../logger/index.js';
import { translateMessages } from './translate-messages.js';

/** Maximum length of error response body text included in error messages. */
const MAX_ERROR_TEXT_LENGTH = 128;

/**
 * OpenAI-format tool definition for the
 * `/chat/completions` request body.
 */
export interface OpenAITool {
  /** Tool type — always `'function'`. */
  type: 'function';
  /** Function definition. */
  function: {
    /** Function name. */
    name: string;
    /** Function description. */
    description?: string;
    /** JSON Schema for the function parameters. */
    parameters?: Record<string, unknown>;
  };
}

/**
 * OpenAI-format tool call returned by the model in an
 * assistant message or streaming delta.
 */
export interface OpenAIToolCall {
  /** Tool call ID assigned by the model. */
  id: string;
  /** Tool type — always `'function'`. */
  type: 'function';
  /** Function call details. */
  function: {
    /** Function name. */
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
  };
}

/**
 * A single content part in an OpenAI-format message with an
 * optional `cache_control` marker.
 */
export interface OpenAIContentPart {
  /** Content type — always `'text'`. */
  type: 'text';
  /** Text content. */
  text: string;
  /** Cache control marker injected by the cache control service. */
  cache_control?: {
    /** Cache type — typically `'ephemeral'`. */
    type: string;
    /** Optional TTL in seconds. */
    ttl?: number;
  };
}

/**
 * An image URL content part for OpenAI-format messages.
 * The URL is a base64-encoded data URI.
 */
interface OpenAIImageContentPart {
  /** Content type — always `'image_url'`. */
  type: 'image_url';
  /** Image URL (data URI or external URL). */
  image_url: {
    /** The image URL. */
    url: string;
  };
  /** Cache control marker injected by the cache control service. */
  cache_control?: {
    /** Cache type — typically `'ephemeral'`. */
    type: string;
    /** Optional TTL in seconds. */
    ttl?: number;
  };
}

/** Union of supported content part types. */
export type OpenAIContentPartUnion = OpenAIContentPart | OpenAIImageContentPart;

/**
 * OpenAI-format chat message for the `/chat/completions`
 * request body.
 *
 * Supports text messages (system/user/assistant), assistant
 * messages with tool calls, and tool-result messages.
 */
export interface OpenAIMessage {
  /** Message role. */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /**
   * Text content — may be a plain string, a structured content-part
   * array (used when cache control markers are injected or images
   * are present), or null for tool-call-only messages.
   */
  content: string | OpenAIContentPartUnion[] | null;
  /** Tool calls requested by the assistant. */
  tool_calls?: OpenAIToolCall[];
  /** ID of the tool call this message responds to. */
  tool_call_id?: string;
  /** Reasoning content (string) — DeepSeek, Kimi, GLM, Qwen, MiMo. */
  reasoning_content?: string;
  /** Reasoning (string) — Anthropic plaintext. */
  reasoning?: string;
  /** Reasoning details (array) — Anthropic structured. */
  reasoning_details?: Array<{ type: string; text?: string }>;
}

/**
 * Context required to handle a chat completion request for
 * a specific model.
 */
export interface ChatContext {
  /** The model database row. */
  model: Model;
  /** The provider database row. */
  provider: Provider;
  /** The provider's API key. */
  apiKey: string;
  /**
   * User-selected reasoning effort level from the model
   * picker, or the model's default. `null` when the model
   * does not support reasoning effort.
   */
  reasoningEffort?: string | null;
  /**
   * OpenAI-format tool definitions from the VS Code request
   * options. `undefined` when no tools are provided.
   */
  tools?: OpenAITool[];

  /**
   * Tool calling mode passed to the OpenAI API as
   * `tool_choice`. `'auto'` lets the model decide whether
   * to call tools; `'required'` forces a tool call.
   * Defaults to `'auto'` when not set.
   */
  toolMode?: 'auto' | 'required';

  /**
   * Logger for writing debug log files. When provided
   * and debug mode is enabled, request-response pairs
   * are logged after response handling completes.
   * Logging is fire-and-forget — errors do not propagate.
   */
  chatDebugLogger?: ChatDebugLogger;

  /**
   * Workspace folder URI string for computing the
   * workspace ID in debug logs. Required when
   * `chatDebugLogger` is provided.
   */
  workspaceFolderUri?: string;

  /**
   * Workspace folder paths for display in debug log
   * metadata (supports multi-root workspaces).
   */
  workspaceFolders?: string[];

  /**
   * Cache control configuration for injecting
   * `cache_control` markers into content blocks.
   * When enabled, markers are placed on the farthest
   * content blocks within a sliding window.
   */
  cacheControl?: CacheControlConfig;

  /**
   * Optional logger for runtime diagnostics.
   * When provided, logs request lifecycle events
   * and errors.
   */
  logger?: Logger;

  /**
   * Content rules service for applying regex-based
   * message transformations before the request is sent.
   * `undefined` when no rules service is configured.
   */
  contentRules?: ContentRulesService;

  /**
   * Extension version string for the User-Agent header
   * sent with the HTTP request. When not provided, the
   * User-Agent falls back to `TokenGuardCopilot/v0.0.0`.
   */
  version?: string;
}

/**
 * Handles chat completion requests by bridging VS Code Copilot
 * Chat messages to OpenAI-compatible `/v1/chat/completions`
 * requests. Supports both streaming (SSE) and non-streaming
 * modes.
 */
export class ChatHandler {
  private readonly ctx: ChatContext;
  private readonly reasoningCacheService: ReasoningCacheService;

  /**
   * Creates a ChatHandler for a specific model/provider.
   *
   * @param ctx - Chat context with model, provider, API
   *   key, and defaults.
   * @param reasoningCacheService - Service for backfilling
   *   and caching reasoning content across multi-turn
   *   conversations.
   */
  constructor(ctx: ChatContext, reasoningCacheService: ReasoningCacheService) {
    this.ctx = ctx;
    this.reasoningCacheService = reasoningCacheService;
  }

  /**
   * Parses the JSON-serialized custom fields string from
   * a model record and converts each field's value
   * according to its type discriminator.
   *
   * Returns an object mapping property names to their
   * converted values. Fields with invalid values (e.g.
   * malformed JSON) are silently skipped.
   *
   * @param customFields - JSON string of
   *   `CustomField[]`, or `null`.
   * @returns Key-value pairs to merge into the request
   *   body.
   */
  private static parseCustomFields(customFields: string | null): Record<string, unknown> {
    if (!customFields) {
      return {};
    }

    let fields: CustomField[];
    try {
      fields = JSON.parse(customFields) as CustomField[];
    } catch {
      return {};
    }

    if (!Array.isArray(fields)) {
      return {};
    }

    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (!field.property) {
        continue;
      }

      switch (field.type) {
        case 'string':
          result[field.property] = field.value;
          break;
        case 'number': {
          if (field.value === '') {
            break;
          }
          const n = Number(field.value);
          if (!Number.isFinite(n)) {
            break;
          }
          result[field.property] = n;
          break;
        }
        case 'boolean':
          if (field.value === '') {
            break;
          }
          result[field.property] = field.value === 'true';
          break;
        case 'json':
          if (field.value === '') {
            break;
          }
          try {
            result[field.property] = JSON.parse(field.value) as unknown;
          } catch {
            // Skip fields with invalid JSON values.
          }
          break;
      }
    }
    return result;
  }

  /**
   * Builds the request body for the `/chat/completions`
   * endpoint.
   *
   * Includes model ID, messages, streaming flag, sampling
   * parameters, and reasoning effort configuration. When the
   * model has a `reasoningEffortMap` in its defaults, the
   * configured effort level is translated into
   * provider-specific body parameters by merging the
   * corresponding map entry. For models without a map, the
   * standard `reasoning_effort` field is used.
   *
   * @param messages - OpenAI-format messages.
   * @param ctx - Chat context with model, provider, and
   *   defaults.
   * @returns Request body object.
   */
  static buildRequestBody(messages: OpenAIMessage[], ctx: ChatContext): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: ctx.model.id,
      messages,
      stream: ctx.model.streaming === 1,
    };

    if (ctx.model.streaming === 1) {
      body.stream_options = { include_usage: true };
    }

    if (ctx.model.temperature !== null) {
      body.temperature = ctx.model.temperature;
    }
    if (ctx.model.topP !== null) {
      body.top_p = ctx.model.topP;
    }
    if (ctx.model.frequencyPenalty !== null) {
      body.frequency_penalty = ctx.model.frequencyPenalty;
    }
    if (ctx.model.presencePenalty !== null) {
      body.presence_penalty = ctx.model.presencePenalty;
    }

    // Reasoning effort
    const effortLevel = ctx.reasoningEffort ?? ctx.model.defaultReasoningEffort;
    if (effortLevel && ctx.model.reasoningEffortMap) {
      try {
        const effortMap = JSON.parse(ctx.model.reasoningEffortMap) as Record<
          string,
          Record<string, unknown>
        >;
        if (effortLevel in effortMap) {
          Object.assign(body, effortMap[effortLevel]);
        }
      } catch {
        // Invalid JSON — skip reasoning effort
      }
    }

    // Tool definitions
    if (ctx.tools && ctx.tools.length > 0) {
      body.tools = ctx.tools;
      body.tool_choice = ctx.toolMode ?? 'auto';
      body.parallel_tool_calls = true;
    }

    // Custom fields — highest override priority
    const customFieldValues = ChatHandler.parseCustomFields(ctx.model.customFields);
    Object.assign(body, customFieldValues);

    return body;
  }

  /**
   * Extracts token usage from a parsed chat completion
   * response JSON body.
   *
   * Reads `usage.prompt_tokens`,
   * `usage.completion_tokens`,
   * `usage.prompt_tokens_details.cached_tokens`, and
   * `usage.completion_tokens_details.reasoning_tokens`.
   * Missing fields default to 0.
   *
   * @param json - Parsed response JSON.
   * @returns ChatUsage object or null if `usage` is
   *   absent.
   */
  static extractUsageFromResponse(json: Record<string, unknown>): ChatUsage | null {
    const usage = json.usage as Record<string, unknown> | undefined;
    if (!usage) return null;

    const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const completionTokens =
      typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;

    const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
    const cachedTokens = typeof details?.cached_tokens === 'number' ? details.cached_tokens : 0;

    const completionDetails = usage.completion_tokens_details as
      | Record<string, unknown>
      | undefined;
    const reasoningTokens =
      typeof completionDetails?.reasoning_tokens === 'number'
        ? completionDetails.reasoning_tokens
        : 0;

    return { promptTokens, completionTokens, cachedTokens, reasoningTokens };
  }

  /**
   * Handles a non-streaming response from the
   * `/chat/completions` endpoint.
   *
   * Extracts `choices[0].message.content` from the JSON
   * response and reports it as a single
   * `LanguageModelTextPart`.
   *
   * @param response - The fetch Response object.
   * @param progress - VS Code progress reporter.
   * @throws Error if the response is not OK or has no content.
   */
  static async handleNonStreaming(
    response: Response,
    progress: Progress<LanguageModelResponsePart>,
    reasoningOut?: ReasoningCollector,
    usageOut?: UsageCollector,
    logger?: Logger,
  ): Promise<void> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger?.error(
        `HTTP ${response.status} ${response.statusText} response body:`,
        errorText || '(empty)',
      );
      throw new Error(
        `${response.status} ${response.statusText}` +
          (errorText ? `: ${truncate(errorText, MAX_ERROR_TEXT_LENGTH)}` : ''),
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
          reasoning?: string;
          reasoning_details?: Array<{
            type: string;
            text?: string;
          }>;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    // Report token usage if available
    const usage = json.usage;
    if (usage?.prompt_tokens !== undefined && usage?.completion_tokens !== undefined) {
      const usageData = {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        prompt_tokens_details: {
          cached_tokens: 0,
        },
      };
      progress.report(
        new LanguageModelDataPart(
          new TextEncoder().encode(JSON.stringify(usageData)),
          USAGE_DATA_PART_MIME,
        ),
      );
    }

    // Collect usage for the usage tracker
    if (usageOut) {
      usageOut.usage = ChatHandler.extractUsageFromResponse(
        json as unknown as Record<string, unknown>,
      );
    }

    const message = json.choices?.[0]?.message;
    if (reasoningOut) {
      reasoningOut.fields = extractReasoningFields(message ?? {});
    }
    const reasoningContent = extractReasoning(message ?? {});
    const content = message?.content;
    const toolCalls = message?.tool_calls;

    logger?.debug(
      'Non-streaming response received',
      `content_len=${content?.length ?? 0}`,
      `reasoning_len=${reasoningContent?.length ?? 0}`,
      `tool_calls=${toolCalls?.length ?? 0}`,
    );

    if (!content && !reasoningContent && (!toolCalls || toolCalls.length === 0)) {
      throw new Error('No response content');
    }

    // Report reasoning content first (before main content),
    // with presentFields metadata so only the fields the
    // server actually sent are reconstructed on the next turn.
    const thinkingPart = reasoningToThinkingPart(message ?? {});
    if (thinkingPart) {
      progress.report(thinkingPart as unknown as LanguageModelResponsePart);
    }

    if (content) {
      progress.report(new LanguageModelTextPart(content));
    }

    if (toolCalls) {
      for (const tc of toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          logger?.warn(
            'Failed to parse tool call arguments in non-streaming response',
            `tool_name=${tc.function.name}`,
            `arguments=${tc.function.arguments}`,
          );
          args = {};
        }
        progress.report(new LanguageModelToolCallPart(tc.id, tc.function.name, args));
      }
    }
  }

  /**
   * Handles a streaming SSE response from the
   * `/chat/completions` endpoint.
   *
   * Reads the response body as a stream of SSE events,
   * parses each `data:` line, extracts
   * `choices[0].delta.content`, and reports each content
   * chunk via `progress.report()`.
   *
   * @param response - The fetch Response object.
   * @param progress - VS Code progress reporter.
   * @param token - Cancellation token.
   * @throws Error if the response is not OK or the body is
   *   null.
   */
  static async handleStreaming(
    response: Response,
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
    reasoningOut?: ReasoningCollector,
    usageOut?: UsageCollector,
    logger?: Logger,
  ): Promise<void> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger?.error(
        `HTTP ${response.status} ${response.statusText} response body:`,
        errorText || '(empty)',
      );
      throw new Error(
        `${response.status} ${response.statusText}` +
          (errorText ? `: ${truncate(errorText, MAX_ERROR_TEXT_LENGTH)}` : ''),
      );
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

    let buffer = '';
    const pendingToolCalls = new Map<number, OpenAIToolCall>();

    const flushToolCalls = (): void => {
      for (const tc of pendingToolCalls.values()) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }
        progress.report(new LanguageModelToolCallPart(tc.id, tc.function.name, args));
      }
      pendingToolCalls.clear();
    };

    try {
      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (token.isCancellationRequested) break;

          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            flushToolCalls();
            return;
          }

          let parsed: {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_content?: string;
                reasoning?: string;
                reasoning_details?: Array<{
                  type: string;
                  text?: string;
                }>;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  type?: string;
                  function?: {
                    name?: string;
                    arguments?: string;
                  };
                }>;
              };
              finish_reason?: string | null;
            }>;
            usage?: {
              prompt_tokens: number;
              completion_tokens: number;
              total_tokens: number;
            };
          };
          try {
            parsed = JSON.parse(data) as typeof parsed;
          } catch {
            continue;
          }

          // Report usage when present in any chunk
          if (parsed.usage) {
            const u = parsed.usage;
            if (typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number') {
              const usageData = {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
                prompt_tokens_details: {
                  cached_tokens: 0,
                },
              };
              progress.report(
                new LanguageModelDataPart(
                  new TextEncoder().encode(JSON.stringify(usageData)),
                  USAGE_DATA_PART_MIME,
                ),
              );
            }

            // Also capture for UsageTracker (only on final chunk
            // where usage is non-null)
            if (usageOut && !usageOut.usage) {
              usageOut.usage = ChatHandler.extractUsageFromResponse(
                parsed as unknown as Record<string, unknown>,
              );
            }
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          // Trace every SSE chunk for diagnostics
          logger?.trace(
            'SSE chunk received',
            `has_content=${!!choice?.delta?.content}`,
            `has_reasoning=${!!(
              choice?.delta?.reasoning_content ??
              choice?.delta?.reasoning ??
              choice?.delta?.reasoning_details
            )}`,
            `has_tool_calls=${!!choice?.delta?.tool_calls?.length}`,
            `finish_reason=${choice?.finish_reason ?? 'null'}`,
            `has_usage=${!!parsed.usage}`,
            `content_len=${(choice?.delta?.content ?? '').length}`,
          );

          // Surface reasoning content as thinking parts (before main content),
          // with presentFields metadata so only the fields the server actually
          // sent are reconstructed on the next turn.
          const thinkingPart = reasoningToThinkingPart(choice.delta ?? {});
          if (thinkingPart) {
            progress.report(thinkingPart as unknown as LanguageModelResponsePart);
          }

          const content = choice.delta?.content;
          if (content) {
            progress.report(new LanguageModelTextPart(content));
          }

          // Accumulate reasoning fields from deltas
          if (reasoningOut && choice.delta) {
            const df = extractReasoningFields(choice.delta);
            if (df) {
              if (!reasoningOut.fields) reasoningOut.fields = {};
              if (df.reasoning_content)
                reasoningOut.fields.reasoning_content =
                  (reasoningOut.fields.reasoning_content ?? '') + df.reasoning_content;
              if (df.reasoning)
                reasoningOut.fields.reasoning =
                  (reasoningOut.fields.reasoning ?? '') + df.reasoning;
              if (df.reasoning_details) {
                if (!reasoningOut.fields.reasoning_details)
                  reasoningOut.fields.reasoning_details = [];
                reasoningOut.fields.reasoning_details.push(...df.reasoning_details);
              }
            }
          }

          // Accumulate tool call deltas
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              let pending = pendingToolCalls.get(tc.index);
              if (!pending && tc.id) {
                pending = {
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: '',
                    arguments: '',
                  },
                };
                pendingToolCalls.set(tc.index, pending);
              }
              if (pending) {
                if (tc.function?.name) {
                  pending.function.name += tc.function.name;
                }
                if (tc.function?.arguments) {
                  pending.function.arguments += tc.function.arguments;
                }
              }
            }
          }

          // Flush on finish_reason
          if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
            flushToolCalls();
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  /**
   * Handles a chat completion request by translating
   * messages, sending to the provider, and processing
   * the response.
   *
   * When `chatDebugLogger` is configured, captures response
   * content and timing for debug logging after the request
   * completes. Logging is fire-and-forget — errors do not
   * propagate to the caller.
   *
   * @param messages - VS Code chat request messages.
   * @param progress - VS Code progress reporter.
   * @param token - Cancellation token.
   * @throws Error if the request fails or is cancelled.
   */
  async handle(
    messages: readonly LanguageModelChatRequestMessage[],
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
    usageCollector?: UsageCollector,
  ): Promise<void> {
    const translated = translateMessages(messages);

    // Generate a unique request ID for correlation across
    // headers, runtime logs, debug Markdown files, and
    // error messages.
    const requestId = randomUUID();

    // Apply content rules (if configured)
    let ruleResults: RuleApplicationResult[] | undefined;
    let processedMessages = translated;
    if (this.ctx.contentRules) {
      const toolNames = this.ctx.tools?.map((t) => t.function.name) ?? [];
      const result = this.ctx.contentRules.applyRules(
        processedMessages,
        this.ctx.model.id,
        toolNames,
      );
      processedMessages = result.messages;
      ruleResults = result.ruleResults;
    }

    // Backfill reasoning from cache into assistant messages
    this.reasoningCacheService.backfillReasoning(
      processedMessages,
      this.ctx.model.preserveReasoning === 1,
    );

    // Inject cache control markers when enabled
    const finalMessages =
      this.ctx.cacheControl?.enabled === true
        ? CacheControlService.injectMarkers(processedMessages, this.ctx.cacheControl)
        : processedMessages;

    const body = ChatHandler.buildRequestBody(finalMessages, this.ctx);

    const url = this.ctx.provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    this.ctx.logger?.debug(
      'Chat completion request',
      `model=${this.ctx.model.id}`,
      `streaming=${this.ctx.model.streaming === 1}`,
      `requestId=${requestId}`,
    );

    const abortController = new AbortController();
    const cancelDisposable = token.onCancellationRequested(() => {
      abortController.abort();
    });

    const startTime = new Date();
    let responseContent = '';
    const responseToolCalls: Array<{
      id: string;
      name: string;
      arguments: string;
    }> = [];

    const capturingProgress: typeof progress = {
      report(part) {
        progress.report(part);
        if (part instanceof LanguageModelTextPart) {
          responseContent += part.value;
        } else if (part instanceof LanguageModelToolCallPart) {
          responseToolCalls.push({
            id: part.callId,
            name: part.name,
            arguments: JSON.stringify(part.input),
          });
        }
      },
    };

    const reasoningCollector: ReasoningCollector = { fields: null };

    let error: string | undefined;
    let cancelled = false;

    try {
      const response = await ChatHandler.fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.ctx.apiKey}`,
            'User-Agent': buildUserAgent(this.ctx.version),
            'X-TokenGuard-Request-Id': requestId,
          },
          body: JSON.stringify(body),
          signal: abortController.signal,
        },
        this.ctx.logger,
        requestId,
      );

      if (this.ctx.model.streaming === 1) {
        await ChatHandler.handleStreaming(
          response,
          capturingProgress,
          token,
          reasoningCollector,
          usageCollector,
          this.ctx.logger,
        );
      } else {
        await ChatHandler.handleNonStreaming(
          response,
          capturingProgress,
          reasoningCollector,
          usageCollector,
          this.ctx.logger,
        );
      }

      const duration = Date.now() - startTime.getTime();
      this.ctx.logger?.debug(
        'Chat completion response',
        `model=${this.ctx.model.id}`,
        `duration=${duration}ms`,
        `response_content_len=${responseContent.length}`,
        `tool_calls=${responseToolCalls.length}`,
        `has_reasoning=${!!reasoningCollector.fields}`,
        `requestId=${requestId}`,
      );

      // Cache reasoning after successful response
      try {
        this.reasoningCacheService.cacheReasoning(
          processedMessages,
          reasoningCollector.fields,
          {
            content: responseContent,
            toolCalls: responseToolCalls.map((tc) => ({
              id: tc.id,
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            })),
          },
          this.ctx.model.preserveReasoning === 1,
        );
      } catch (cacheError) {
        this.ctx.logger?.warn(
          'Failed to cache reasoning',
          `model=${this.ctx.model.id}`,
          `error=${String(cacheError)}`,
        );
      }
    } catch (e) {
      if (token.isCancellationRequested || (e instanceof Error && e.name === 'AbortError')) {
        cancelled = true;
        this.ctx.logger?.debug('Chat completion cancelled by user', `requestId=${requestId}`);
      } else {
        const message = e instanceof Error ? e.message : String(e);
        const detail = summarizeError(e);
        // Persist the bare message as the canonical error and
        // append the cause-chain summary on a new line so the
        // Chat Debug Markdown "Error" section is diagnosable
        // from a single per-session file.
        error = detail ? `${message}\n${detail}` : message;
        this.ctx.logger?.error(
          'Chat completion failed',
          `model=${this.ctx.model.id}`,
          `requestId=${requestId}`,
          `error=${message}`,
          `detail=${detail}`,
        );

        // Augment the thrown error message so VS Code shows
        // the request ID for correlation.
        if (e instanceof Error) {
          e.message = `[req ${requestId}] ${e.message}`;
          throw e;
        }
        throw new Error(`[req ${requestId}] ${String(e)}`);
      }
      // Re-throw for cancellation; augmentation above already
      // re-throws for non-cancellation errors.
      throw e;
    } finally {
      cancelDisposable.dispose();
      const endTime = new Date();

      if (this.ctx.chatDebugLogger && this.ctx.workspaceFolderUri) {
        try {
          this.ctx.chatDebugLogger.logRequest({
            requestId,
            messages: finalMessages,
            responseContent,
            responseToolCalls,
            responseReasoning: extractReasoning(reasoningCollector.fields ?? {}),
            modelName: `${this.ctx.provider.name}/${this.ctx.model.id}`,
            modelOptions: Object.fromEntries(
              Object.entries(body).filter(
                ([k]) =>
                  ![
                    'model',
                    'messages',
                    'stream',
                    'stream_options',
                    'tools',
                    'tool_choice',
                    'parallel_tool_calls',
                  ].includes(k),
              ),
            ),
            tools: this.ctx.tools,
            toolMode: this.ctx.toolMode,
            startTime,
            endTime,
            cancelled,
            error,
            usage: usageCollector?.usage ?? null,
            workspaceFolderUri: this.ctx.workspaceFolderUri,
            workspaceFolders: this.ctx.workspaceFolders ?? [],
            contentRules: ruleResults,
          });
        } catch (logError: unknown) {
          // Fire-and-forget: logging errors must not
          // affect the chat response.
          this.ctx.logger?.warn(
            'Failed to write debug log',
            logError instanceof Error ? logError.message : String(logError),
          );
        }
      }
    }
  }

  /**
   * Sends a request via `fetch` and retries it once if the
   * first attempt throws. This is a targeted mitigation for
   * Node's undici keep-alive pool handing out a half-dead
   * connection — a second attempt usually succeeds because
   * the bad connection has been removed from the pool.
   *
   * Only thrown errors (network-level failures) trigger the
   * retry — successful HTTP responses (including 4xx/5xx
   * statuses) are returned as-is. The first failure is
   * logged at `warn` level; a second failure is re-thrown
   * for the caller's existing error handling. User
   * cancellation (`init.signal.aborted`) is NOT retried so
   * the cancellation flow in `handle()` is preserved.
   *
   * @param url - Request URL to fetch.
   * @param init - Fetch request init options (must include
   *   a `signal` for cancellation support).
   * @param logger - Optional logger for the warning on
   *   first failure.
   * @param requestId - Per-request correlation ID for log
   *   lines.
   * @returns The fetch Response — either from the first
   *   attempt or the retry.
   */
  private static async fetchWithRetry(
    url: string,
    init: RequestInit,
    logger: Logger | undefined,
    requestId: string,
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (e) {
      // Do not retry user-initiated cancellation — let it
      // propagate so handle() can distinguish cancellation
      // from network failures.
      if (init.signal?.aborted) {
        throw e;
      }

      logger?.warn(
        'Chat completion fetch failed, retrying once',
        `requestId=${requestId}`,
        `error=${e instanceof Error ? e.message : String(e)}`,
      );

      return await fetch(url, init);
    }
  }
}

/**
 * Mutable wrapper passed to streaming/non-streaming
 * handlers to capture raw reasoning fields from
 * responses.
 */
export interface ReasoningCollector {
  /** The collected reasoning fields, or `null` if none. */
  fields: ReasoningFields | null;
}

/**
 * Token usage extracted from a chat completion response.
 * Mirrors {@link TokenUsage} from the usage-tracker module
 * but defined here to avoid circular imports.
 */
export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

/**
 * Mutable wrapper passed to streaming/non-streaming
 * handlers to capture usage data for recording.
 */
export interface UsageCollector {
  /** Collected usage data, or null if not yet available. */
  usage: ChatUsage | null;
}
