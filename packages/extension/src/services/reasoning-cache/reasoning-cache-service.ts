import type { ReasoningCacheRepository } from '../../repositories/index.js';
import {
  computeFingerprint,
  computeMessageFingerprint,
  type FingerprintToolCall,
} from '../../utils/index.js';
import { extractReasoning, type ReasoningFields } from '../../utils/index.js';
import type { OpenAIMessage } from '../chat-handler/index.js';

/** Placeholder reasoning value for cache misses. */
const REASONING_PLACEHOLDER = '.';

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
  constructor(private readonly repo: ReasoningCacheRepository) {}

  /**
   * Backfills reasoning fields into assistant messages
   * before sending a request.
   *
   * For each assistant message in the request history:
   * - If the agent already provided reasoning fields,
   *   the longest value is copied to all three fields
   *   for cross-provider compatibility. If it is very
   *   short (≤ 1 char), it is treated as a placeholder
   *   and the cached value is used instead.
   * - If no agent-supplied reasoning is present, the
   *   cached value is injected.
   * - If neither agent reasoning nor cached reasoning
   *   is available, a placeholder `"."` is injected so
   *   providers that require reasoning fields always
   *   see a value.
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
    if (!preserveReasoning) return;

    const hasAssistant = messages.some((m) => m.role === 'assistant');
    if (!hasAssistant) return;

    const sessionFp = computeFingerprint(messages);
    if (!sessionFp) return;

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;

      const msgFp = computeMessageFingerprint(
        msg.content,
        msg.tool_calls as FingerprintToolCall[] | undefined,
      );

      const cached = msgFp ? this.repo.get(sessionFp, msgFp) : null;

      const hasAgent =
        typeof msg.reasoning_content === 'string' ||
        typeof msg.reasoning === 'string' ||
        Array.isArray(msg.reasoning_details);

      if (hasAgent) {
        const longest = extractReasoning({
          reasoning_content: msg.reasoning_content,
          reasoning: msg.reasoning,
          reasoning_details: msg.reasoning_details,
        });
        if (longest && longest.length <= 1) {
          // Very short value (e.g. ".") — use cached
          if (cached) {
            msg.reasoning_content = cached.reasoning_content;
            msg.reasoning = cached.reasoning;
            msg.reasoning_details = cached.reasoning_details;
          }
        } else if (longest) {
          // Copy longest to all three fields
          msg.reasoning_content = longest;
          msg.reasoning = longest;
          msg.reasoning_details = cached?.reasoning_details ??
            msg.reasoning_details ?? [{ type: 'text', text: longest }];
        }
      } else if (cached) {
        const longest = extractReasoning(cached);
        msg.reasoning_content = cached.reasoning_content ?? longest ?? undefined;
        msg.reasoning = cached.reasoning ?? longest ?? undefined;
        msg.reasoning_details =
          cached.reasoning_details ?? (longest ? [{ type: 'text', text: longest }] : undefined);
      } else {
        // No agent reasoning and no cache hit — inject
        // placeholder so providers that require reasoning
        // fields always see a value.
        msg.reasoning_content = REASONING_PLACEHOLDER;
      }
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
    if (!preserveReasoning || !fields) return;

    const sessionFp = computeFingerprint(messages, {
      content: response.content,
      toolCallIds: response.toolCalls?.map((tc) => tc.id),
    });
    if (!sessionFp) return;

    const msgFp = computeMessageFingerprint(response.content, response.toolCalls);
    if (!msgFp) return;

    this.repo.cache(sessionFp, msgFp, fields);
  }
}
