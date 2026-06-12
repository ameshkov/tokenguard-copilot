/**
 * Private helper functions extracted from the `handle()`
 * method in `ChatHandler` to reduce its line count.
 *
 * These exist only to decompose the orchestration method
 * into smaller single-responsibility pieces.
 */

import { LanguageModelTextPart, LanguageModelToolCallPart } from 'vscode';
import type { LanguageModelResponsePart, Progress } from 'vscode';
import { extractReasoning, summarizeError } from '../../utils/index.js';
import type { ReasoningFields } from '../../utils/index.js';
import type { ChatContext, ChatUsage, OpenAIMessage, ReasoningCollector } from './chat-types.js';
import type { RuleApplicationResult } from '../content-rules/index.js';
import type { Logger } from '../../logger/index.js';

/**
 * Creates a proxy progress reporter that captures
 * `LanguageModelTextPart` and `LanguageModelToolCallPart`
 * content while forwarding all parts to the real progress.
 *
 * The returned `state` object holds live references to
 * the captured content, updated by the progress reporter.
 *
 * @param progress - The original VS Code progress reporter.
 * @returns A capturing proxy progress and a mutable state
 *   object with response content and tool calls.
 */
export function createCapturingProgress(progress: Progress<LanguageModelResponsePart>): {
  capturingProgress: Progress<LanguageModelResponsePart>;
  state: {
    responseContent: string;
    responseToolCalls: Array<{ id: string; name: string; arguments: string }>;
  };
} {
  const state = {
    responseContent: '',
    responseToolCalls: [] as Array<{
      id: string;
      name: string;
      arguments: string;
    }>,
  };

  const capturingProgress: Progress<LanguageModelResponsePart> = {
    report(part: LanguageModelResponsePart) {
      progress.report(part);
      if (part instanceof LanguageModelTextPart) {
        state.responseContent += part.value;
      } else if (part instanceof LanguageModelToolCallPart) {
        state.responseToolCalls.push({
          id: part.callId,
          name: part.name,
          arguments: JSON.stringify(part.input),
        });
      }
    },
  };

  return { capturingProgress, state };
}

/**
 * Distinguishes cancellation from failure and augments
 * error messages with the request ID for correlation.
 *
 * @param e - The caught error from the try block.
 * @param token - Cancellation token.
 * @param requestId - Per-request correlation ID.
 * @param ctx - Chat context for logging.
 * @returns A `{ cancelled, error }` summary. The function
 *   re-throws augmented errors (non-cancellation) and
 *   raw cancellation errors directly.
 */
export function handleChatError(
  e: unknown,
  token: { isCancellationRequested: boolean },
  requestId: string,
  ctx: ChatContext,
): { cancelled: boolean; error: string | undefined; augmented: Error } {
  if (token.isCancellationRequested || (e instanceof Error && e.name === 'AbortError')) {
    ctx.logger?.debug('Chat completion cancelled by user', `requestId=${requestId}`);
    const cancellationError = e instanceof Error ? e : new Error(String(e));
    return { cancelled: true, error: undefined, augmented: cancellationError };
  }

  const message = e instanceof Error ? e.message : String(e);
  const detail = summarizeError(e);
  // Persist the bare message as the canonical error and
  // append the cause-chain summary on a new line so the
  // Chat Debug Markdown "Error" section is diagnosable
  // from a single per-session file.
  const error = detail ? `${message}\n${detail}` : message;
  ctx.logger?.error(
    'Chat completion failed',
    `model=${ctx.model.id}`,
    `requestId=${requestId}`,
    `error=${message}`,
    `detail=${detail}`,
  );

  // Augment the thrown error message so VS Code shows
  // the request ID for correlation.
  if (e instanceof Error) {
    e.message = `[req ${requestId}] ${e.message}`;
    return { cancelled: false, error, augmented: e };
  }
  return { cancelled: false, error, augmented: new Error(`[req ${requestId}] ${String(e)}`) };
}

/**
 * Logs success and caches reasoning after a successful
 * chat completion. Cache errors are swallowed.
 *
 * @param modelId - Model identifier for log messages.
 * @param messages - The processed messages sent to the
 *   API.
 * @param reasoningFields - Collected reasoning fields
 *   from the response.
 * @param responseContent - Accumulated text content.
 * @param responseToolCalls - Accumulated tool calls.
 * @param startTime - When the request started.
 * @param requestId - Per-request correlation ID.
 * @param preserveReasoning - Whether to preserve
 *   reasoning in the cache.
 * @param cacheReasoning - The reasoning cache function
 *   (from ReasoningCacheService).
 * @param logger - Optional logger.
 */
export function handleChatSuccess(
  modelId: string,
  messages: OpenAIMessage[],
  reasoningFields: ReasoningFields | null,
  responseContent: string,
  responseToolCalls: Array<{ id: string; name: string; arguments: string }>,
  startTime: Date,
  requestId: string,
  preserveReasoning: boolean,
  cacheReasoning: (
    msgs: OpenAIMessage[],
    fields: ReasoningFields | null,
    response: {
      content: string;
      toolCalls: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    },
    preserve: boolean,
  ) => void,
  logger?: Logger,
): void {
  const duration = Date.now() - startTime.getTime();
  logger?.debug(
    'Chat completion response',
    `model=${modelId}`,
    `duration=${duration}ms`,
    `response_content_len=${responseContent.length}`,
    `tool_calls=${responseToolCalls.length}`,
    `has_reasoning=${!!reasoningFields}`,
    `requestId=${requestId}`,
  );

  // Cache reasoning after successful response
  try {
    cacheReasoning(
      messages,
      reasoningFields,
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
      preserveReasoning,
    );
  } catch (cacheError) {
    logger?.warn('Failed to cache reasoning', `model=${modelId}`, `error=${String(cacheError)}`);
  }
}

/**
 * Logs the request-response pair to the chat debug logger
 * when configured. This is fire-and-forget — errors are
 * swallowed.
 *
 * @param ctx - Chat context with optional logger and
 *   debug logger.
 * @param input - Log request input data assembled from
 *   the `handle()` method's locals.
 */
export function logChatDebugRequest(
  ctx: ChatContext,
  input: {
    requestId: string;
    finalMessages: OpenAIMessage[];
    body: Record<string, unknown>;
    responseContent: string;
    responseToolCalls: Array<{ id: string; name: string; arguments: string }>;
    reasoningCollector: ReasoningCollector;
    startTime: Date;
    endTime: Date;
    cancelled: boolean;
    error: string | undefined;
    usageCollector?: { usage: ChatUsage | null };
    ruleResults?: RuleApplicationResult[];
  },
): void {
  if (!ctx.chatDebugLogger || !ctx.workspaceFolderUri) return;

  try {
    ctx.chatDebugLogger.logRequest({
      requestId: input.requestId,
      messages: input.finalMessages,
      responseContent: input.responseContent,
      responseToolCalls: input.responseToolCalls,
      responseReasoning: extractReasoning(input.reasoningCollector.fields ?? {}),
      modelName: `${ctx.provider.name}/${ctx.model.id}`,
      modelOptions: Object.fromEntries(
        Object.entries(input.body).filter(
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
      tools: ctx.tools,
      toolMode: ctx.toolMode,
      startTime: input.startTime,
      endTime: input.endTime,
      cancelled: input.cancelled,
      error: input.error,
      usage: input.usageCollector?.usage ?? null,
      workspaceFolderUri: ctx.workspaceFolderUri,
      workspaceFolders: ctx.workspaceFolders ?? [],
      contentRules: input.ruleResults,
    });
  } catch (logError: unknown) {
    // Fire-and-forget: logging errors must not
    // affect the chat response.
    ctx.logger?.warn(
      'Failed to write debug log',
      logError instanceof Error ? logError.message : String(logError),
    );
  }
}
