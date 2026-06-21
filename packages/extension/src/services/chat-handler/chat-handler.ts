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
import { retryableFetch } from './retryable-fetch.js';
import { DEFAULT_RETRY_POLICY } from './retry-policy.js';

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
      const response = await retryableFetch({
        url,
        init: {
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
        policy: DEFAULT_RETRY_POLICY,
        logger: this.ctx.logger,
        requestId,
      });

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
}
