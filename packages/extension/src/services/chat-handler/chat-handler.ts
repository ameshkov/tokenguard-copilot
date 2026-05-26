import * as vscode from 'vscode';
import { USAGE_DATA_PART_MIME } from '@tokenguard/shared';
import type { ModelDefaults } from '../model-defaults/model-defaults.js';
import type { Model, Provider } from '../../db/schema.js';
import type { ChatDebugLogger } from '../chat-debug-logger/index.js';
import { extractReasoning, extractReasoningFields } from '../../utils/reasoning.js';
import type { ReasoningFields } from '../../utils/reasoning.js';
import type { ReasoningCacheService } from '../reasoning-cache/reasoning-cache-service.js';

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
interface OpenAIToolCall {
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
 * OpenAI-format chat message for the `/chat/completions`
 * request body.
 *
 * Supports text messages (system/user/assistant), assistant
 * messages with tool calls, and tool-result messages.
 */
export interface OpenAIMessage {
  /** Message role. */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Text content (may be null for tool-call-only messages). */
  content: string | null;
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
  /** Model defaults (for reasoningEffortMap). */
  defaults: ModelDefaults | null;
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
   * Translates VS Code chat messages into OpenAI-format
   * messages.
   *
   * Extracts text content from `LanguageModelTextPart`
   * instances, concatenates multiple text parts per message,
   * and maps VS Code roles to OpenAI roles.
   *
   * @param messages - VS Code chat request messages.
   * @returns Array of OpenAI-format messages.
   */
  static translateMessages(
    messages: readonly vscode.LanguageModelChatRequestMessage[],
  ): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    for (const msg of messages) {
      let content = '';
      const toolCalls: OpenAIToolCall[] = [];
      const toolResults: Array<{
        callId: string;
        content: string;
      }> = [];

      for (const part of msg.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          content += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push({
            id: part.callId,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input),
            },
          });
        } else if (part instanceof vscode.LanguageModelToolResultPart) {
          let toolContent = '';
          for (const item of part.content) {
            if (item instanceof vscode.LanguageModelTextPart) {
              toolContent += item.value;
            }
          }
          toolResults.push({
            callId: part.callId,
            content: toolContent || JSON.stringify(part.content),
          });
        }
      }

      // Tool result messages get their own role
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            content: tr.content,
            tool_call_id: tr.callId,
          });
        }
        continue;
      }

      const role =
        msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user';

      const openAIMsg: OpenAIMessage = {
        role,
        content: content || null,
      };

      if (toolCalls.length > 0) {
        openAIMsg.tool_calls = toolCalls;
      }

      result.push(openAIMsg);
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
    if (
      effortLevel !== null &&
      effortLevel !== undefined &&
      ctx.model.supportedReasoningEfforts !== null
    ) {
      const effortMap = ctx.defaults?.reasoningEffortMap ?? null;

      if (effortMap && effortLevel in effortMap) {
        // Merge provider-specific parameters
        const mapEntry = effortMap[effortLevel];
        Object.assign(body, mapEntry);
      } else {
        // Standard reasoning_effort field
        body.reasoning_effort = effortLevel;
      }
    }

    // Tool definitions
    if (ctx.tools && ctx.tools.length > 0) {
      body.tools = ctx.tools;
      body.tool_choice = ctx.toolMode ?? 'auto';
      body.parallel_tool_calls = true;
    }

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
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    reasoningOut?: ReasoningCollector,
    usageOut?: UsageCollector,
  ): Promise<void> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `${response.status} ${response.statusText}` + (errorText ? `: ${errorText}` : ''),
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
        new vscode.LanguageModelDataPart(
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

    if (!content && !reasoningContent && (!toolCalls || toolCalls.length === 0)) {
      throw new Error('No response content');
    }

    // Report reasoning content first (before main content)
    if (reasoningContent) {
      progress.report(
        new vscode.LanguageModelThinkingPart(
          reasoningContent,
        ) as unknown as vscode.LanguageModelResponsePart,
      );
    }

    if (content) {
      progress.report(new vscode.LanguageModelTextPart(content));
    }

    if (toolCalls) {
      for (const tc of toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // TODO: Handle error, log error
          args = {};
        }
        progress.report(new vscode.LanguageModelToolCallPart(tc.id, tc.function.name, args));
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
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
    reasoningOut?: ReasoningCollector,
    usageOut?: UsageCollector,
  ): Promise<void> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `${response.status} ${response.statusText}` + (errorText ? `: ${errorText}` : ''),
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
        progress.report(new vscode.LanguageModelToolCallPart(tc.id, tc.function.name, args));
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
                new vscode.LanguageModelDataPart(
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

          const content = choice.delta?.content;
          if (content) {
            progress.report(new vscode.LanguageModelTextPart(content));
          }

          // Surface reasoning content as thinking parts
          const reasoning = extractReasoning(choice.delta ?? {});
          if (reasoning) {
            progress.report(
              new vscode.LanguageModelThinkingPart(
                reasoning,
              ) as unknown as vscode.LanguageModelResponsePart,
            );
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
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
    usageCollector?: UsageCollector,
  ): Promise<void> {
    const translated = ChatHandler.translateMessages(messages);

    // Backfill reasoning from cache into assistant messages
    this.reasoningCacheService.backfillReasoning(
      translated,
      this.ctx.model.preserveReasoning === 1,
    );

    const body = ChatHandler.buildRequestBody(translated, this.ctx);

    const url = this.ctx.provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';

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
        if (part instanceof vscode.LanguageModelTextPart) {
          responseContent += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.ctx.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (this.ctx.model.streaming === 1) {
        await ChatHandler.handleStreaming(
          response,
          capturingProgress,
          token,
          reasoningCollector,
          usageCollector,
        );
      } else {
        await ChatHandler.handleNonStreaming(
          response,
          capturingProgress,
          reasoningCollector,
          usageCollector,
        );
      }

      // Cache reasoning after successful response
      this.reasoningCacheService.cacheReasoning(
        translated,
        reasoningCollector.fields,
        {
          content: responseContent,
          firstToolCallId: responseToolCalls[0]?.id,
        },
        this.ctx.model.preserveReasoning === 1,
      );
    } catch (e) {
      if (token.isCancellationRequested || (e instanceof Error && e.name === 'AbortError')) {
        cancelled = true;
      } else {
        error = e instanceof Error ? e.message : String(e);
      }
      throw e;
    } finally {
      cancelDisposable.dispose();
      const endTime = new Date();

      if (this.ctx.chatDebugLogger && this.ctx.workspaceFolderUri) {
        try {
          this.ctx.chatDebugLogger.logRequest({
            messages: translated,
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
            workspaceFolderUri: this.ctx.workspaceFolderUri,
          });
        } catch {
          // Fire-and-forget: logging errors must not
          // affect the chat response.
          // TODO: Log error
        }
      }
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
