import type {
  CancellationToken,
  LanguageModelChatRequestMessage,
  LanguageModelResponsePart,
  Progress,
} from 'vscode';
import { randomUUID } from 'node:crypto';
import type { ReasoningCacheService } from '../reasoning-cache/index.js';
import { CacheControlService } from '../cache-control/index.js';
import { buildUserAgent } from '../../utils/index.js';
import { translateMessages } from './translate-messages.js';
import { buildRequestBody } from './build-request-body.js';
import { handleNonStreaming } from './handle-non-streaming.js';
import { handleStreaming } from './handle-streaming.js';
import {
  createCapturingProgress,
  handleChatError,
  handleChatSuccess,
  logChatDebugRequest,
} from './handle-helpers.js';
import type { ChatContext, OpenAIMessage, UsageCollector } from './chat-types.js';
import type { RuleApplicationResult } from '../content-rules/index.js';
import type { Logger } from '../../logger/index.js';

export type { ChatContext, OpenAIMessage, UsageCollector } from './chat-types.js';

/**
 * Handles chat completion requests by bridging VS Code Copilot
 * Chat messages to OpenAI-compatible `/v1/chat/completions`
 * requests. Supports both streaming (SSE) and non-streaming
 * modes.
 */
export class ChatHandler {
  readonly ctx: ChatContext;
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
   * @param usageCollector - Optional usage data collector.
   * @throws Error if the request fails or is cancelled.
   */
  async handle(
    messages: readonly LanguageModelChatRequestMessage[],
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken,
    usageCollector?: UsageCollector,
  ): Promise<void> {
    const requestId = randomUUID();
    const { body, finalMessages, processedMessages, ruleResults, url } = this.prepareRequest(
      messages,
      requestId,
    );

    const abortController = new AbortController();
    const cancelDisposable = token.onCancellationRequested(() => abortController.abort());

    const startTime = new Date();
    const { capturingProgress, state } = createCapturingProgress(progress);
    const reasoningCollector = { fields: null };
    let cancelled = false;
    let error: string | undefined;

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
        await handleStreaming(
          response,
          capturingProgress,
          token,
          reasoningCollector,
          usageCollector,
          this.ctx.logger,
        );
      } else {
        await handleNonStreaming(
          response,
          capturingProgress,
          reasoningCollector,
          usageCollector,
          this.ctx.logger,
        );
      }

      handleChatSuccess(
        this.ctx.model.id,
        processedMessages,
        reasoningCollector.fields,
        state.responseContent,
        state.responseToolCalls,
        startTime,
        requestId,
        this.ctx.model.preserveReasoning === 1,
        (msgs, fields, resp, preserve) =>
          this.reasoningCacheService.cacheReasoning(msgs, fields, resp, preserve),
        this.ctx.logger,
      );
    } catch (e) {
      const {
        cancelled: c,
        error: err,
        augmented,
      } = handleChatError(e, token, requestId, this.ctx);
      cancelled = c;
      error = err;
      throw augmented;
    } finally {
      cancelDisposable.dispose();
      const endTime = new Date();
      logChatDebugRequest(this.ctx, {
        requestId,
        finalMessages,
        body,
        responseContent: state.responseContent,
        responseToolCalls: state.responseToolCalls,
        reasoningCollector,
        startTime,
        endTime,
        cancelled,
        error,
        usageCollector,
        ruleResults,
      });
    }
  }

  /**
   * Prepares the request body and final messages from the
   * VS Code chat request messages.
   *
   * Applies content rules, backfills reasoning from cache,
   * injects cache control markers, and builds the request
   * body and URL.
   *
   * @param messages - VS Code chat request messages.
   * @param requestId - Per-request correlation ID (used
   *   for debug logging only).
   * @returns The request body, processed messages, and
   *   related metadata.
   */
  private prepareRequest(
    messages: readonly LanguageModelChatRequestMessage[],
    requestId: string,
  ): {
    body: Record<string, unknown>;
    finalMessages: OpenAIMessage[];
    processedMessages: OpenAIMessage[];
    ruleResults: RuleApplicationResult[] | undefined;
    url: string;
  } {
    const translated = translateMessages(messages);

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

    const body = buildRequestBody(finalMessages, this.ctx);
    const url = this.ctx.provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    this.ctx.logger?.debug(
      'Chat completion request',
      `model=${this.ctx.model.id}`,
      `streaming=${this.ctx.model.streaming === 1}`,
      `requestId=${requestId}`,
    );

    return { body, finalMessages, processedMessages, ruleResults, url };
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
