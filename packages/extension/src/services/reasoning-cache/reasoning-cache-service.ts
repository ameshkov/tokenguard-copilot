import type { ReasoningCacheRepository } from '../../repositories/index.js';
import {
  computeFingerprint,
  computeMessageFingerprint,
  type FingerprintToolCall,
} from '../../utils/index.js';
import { extractReasoning, type ReasoningFields } from '../../utils/index.js';
import type { OpenAIMessage } from '../chat-handler/index.js';
import type { Logger } from '../../logger/index.js';

/**
 * Manages reasoning preservation across multi-turn
 * conversations.
 *
 * Encapsulates all backfill and cache logic so that
 * {@link ChatHandler} only needs to call two methods:
 * {@link backfillReasoning} before a request and
 * {@link cacheReasoning} after a successful response.
 *
 * Cache entries are keyed by a dual fingerprint:
 * - **Session fingerprint** — stable conversation-level
 *   hash (from {@link computeFingerprint}).
 * - **Message fingerprint** — per-assistant-message hash
 *   derived from the message's `content` and `tool_calls`
 *   (from {@link computeMessageFingerprint}).
 *
 * This dual-key approach is resilient to conversation
 * rollbacks in Copilot Chat: if the user rolls back and
 * the same assistant message reappears at a different
 * index, it still matches.
 */
export class ReasoningCacheService {
  constructor(
    private readonly repo: ReasoningCacheRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Backfills reasoning fields into assistant messages
   * before sending a request.
   *
   * For each assistant message in the request history:
   * - If the message already has reasoning fields
   *   populated (e.g. from thinking parts in
   *   `translateMessages`), it is skipped entirely.
   * - If cached reasoning exists for the message
   *   fingerprint, only the fields present in the cache
   *   entry are set (selective backfill).
   * - If neither source has data, no reasoning fields
   *   are set.
   *
   * No-op when `preserveReasoning` is `false` or no
   * assistant messages exist.
   *
   * @param messages - The outgoing request messages
   *   (mutated in place).
   * @param preserveReasoning - Whether reasoning
   *   preservation is enabled for this model.
   */
  backfillReasoning(messages: OpenAIMessage[], preserveReasoning: boolean): void {
    if (!preserveReasoning) {
      this.logger.trace('Reasoning backfill skipped: preservation disabled');
      return;
    }

    const hasAssistant = messages.some((m) => m.role === 'assistant');
    if (!hasAssistant) {
      this.logger.trace('Reasoning backfill skipped: no assistant messages');
      return;
    }

    const sessionFp = computeFingerprint(messages);
    if (!sessionFp) {
      this.logger.trace('Reasoning backfill skipped: could not compute session fingerprint');
      return;
    }

    let backfillCount = 0;
    let cacheHitCount = 0;

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;

      const msgFp = computeMessageFingerprint(
        msg.content,
        msg.tool_calls as FingerprintToolCall[] | undefined,
      );

      const cached = msgFp ? this.repo.get(sessionFp, msgFp) : null;

      if (cached) cacheHitCount++;

      // Skip messages that already have reasoning fields
      // populated (e.g. from thinking parts in
      // translateMessages).
      const hasAgent =
        typeof msg.reasoning_content === 'string' ||
        typeof msg.reasoning === 'string' ||
        Array.isArray(msg.reasoning_details);

      if (hasAgent) {
        this.logger.trace(
          'Reasoning backfill skipped: message already has reasoning',
          `msg_fp=${msgFp?.slice(0, 8) ?? 'none'}`,
        );
        continue;
      }

      if (cached) {
        // Selective backfill: only set fields present in
        // cache.
        if (cached.reasoning_content != null) {
          msg.reasoning_content = cached.reasoning_content;
        }
        if (cached.reasoning != null) {
          msg.reasoning = cached.reasoning;
        }
        if (cached.reasoning_details != null) {
          msg.reasoning_details = cached.reasoning_details;
        }
        this.logger.trace('Reasoning backfill: injected cached reasoning', `msg_fp=${msgFp}`);
        backfillCount++;
      } else {
        // No thinking parts and no cache — leave reasoning
        // fields unset. The model has never returned
        // reasoning for this message, so there is nothing
        // to inject.
        this.logger.trace('Reasoning backfill: no source available', `msg_fp=${msgFp ?? 'none'}`);
      }
    }

    if (backfillCount > 0 || cacheHitCount > 0) {
      this.logger.debug(
        'Reasoning backfill complete',
        `backfilled=${backfillCount}`,
        `cache_hits=${cacheHitCount}`,
        `total_assistant=${messages.filter((m) => m.role === 'assistant').length}`,
      );
    }
  }

  /**
   * Caches reasoning fields after a successful response.
   *
   * No-op when `preserveReasoning` is `false`, no
   * reasoning fields are available, or no fingerprint
   * can be computed.
   *
   * @param messages - The request messages (used to
   *   compute the session-level fingerprint).
   * @param fields - The reasoning fields extracted from
   *   the response, or `null`.
   * @param response - The assistant response content
   *   and optional tool calls (used for both session
   *   fingerprint computation on Turn 1 and
   *   per-message fingerprint computation).
   * @param preserveReasoning - Whether reasoning
   *   preservation is enabled for this model.
   */
  cacheReasoning(
    messages: OpenAIMessage[],
    fields: ReasoningFields | null,
    response: {
      content: string;
      toolCalls?: FingerprintToolCall[];
    },
    preserveReasoning: boolean,
  ): void {
    if (!preserveReasoning) {
      this.logger.trace('Reasoning cache skipped: preservation disabled');
      return;
    }
    if (!fields) {
      this.logger.trace('Reasoning cache skipped: no reasoning fields in response');
      return;
    }

    const sessionFp = computeFingerprint(messages, {
      content: response.content,
      toolCallIds: response.toolCalls?.map((tc) => tc.id),
    });
    if (!sessionFp) {
      this.logger.trace('Reasoning cache skipped: could not compute session fingerprint');
      return;
    }

    const msgFp = computeMessageFingerprint(response.content, response.toolCalls);
    if (!msgFp) {
      this.logger.trace('Reasoning cache skipped: could not compute message fingerprint');
      return;
    }

    this.repo.cache(sessionFp, msgFp, fields);
    const longest = extractReasoning(fields);
    this.logger.debug(
      'Reasoning cached',
      `session_fp=${sessionFp.slice(0, 8)}...`,
      `msg_fp=${msgFp.slice(0, 8)}...`,
      `reasoning_len=${longest?.length ?? 0}`,
    );
  }
}
