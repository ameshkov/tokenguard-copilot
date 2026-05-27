import { createHash } from 'node:crypto';
import type { ReasoningCacheRepository } from '../../repositories/reasoning-cache-repository.js';
import { extractTextContent } from '../../utils/content.js';
import { extractReasoning, type ReasoningFields } from '../../utils/reasoning.js';
import type { OpenAIMessage } from '../chat-handler/chat-handler.js';

/**
 * Manages reasoning preservation across multi-turn
 * conversations.
 *
 * Encapsulates all backfill and cache logic so that
 * {@link ChatHandler} only needs to call two methods:
 * {@link backfillReasoning} before a request and
 * {@link cacheReasoning} after a successful response.
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

    const fingerprint = this.computeFingerprint(messages);
    if (!fingerprint) return;

    let assistantIndex = 0;
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;

      const cached = this.repo.get(fingerprint, assistantIndex);
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
      }
      assistantIndex++;
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
   *   compute the conversation fingerprint).
   * @param fields - The reasoning fields extracted from
   *   the response, or `null`.
   * @param response - The assistant response content
   *   and optional first tool call ID (used for Turn 1
   *   fingerprint computation when the assistant
   *   message is not yet in the messages array).
   * @param preserveReasoning - Whether reasoning
   *   preservation is enabled for this model.
   */
  cacheReasoning(
    messages: OpenAIMessage[],
    fields: ReasoningFields | null,
    response: {
      content: string;
      firstToolCallId?: string;
    },
    preserveReasoning: boolean,
  ): void {
    if (!preserveReasoning || !fields) return;

    const fingerprint = this.computeFingerprint(messages, response);
    if (!fingerprint) return;

    let assistantIndex = 0;
    for (const m of messages) {
      if (m.role === 'assistant') assistantIndex++;
    }

    this.repo.cache(fingerprint, assistantIndex, fields);
  }

  /**
   * Computes a stable conversation fingerprint for
   * identifying the same conversation across turns.
   *
   * Collects all system and user messages in array
   * order up to (but not including) the first assistant
   * message. The first assistant provides the final key
   * part: `tool_calls[0].id` when present, otherwise
   * `content`.
   *
   * When the first assistant message is already in the
   * messages array (backfill path — Turn 2+), the
   * optional `firstAssistant` parameter is ignored.
   *
   * When the first assistant message is not yet in the
   * array (cache path — Turn 1), the `firstAssistant`
   * parameter supplies the missing data.
   *
   * @param firstAssistant - The response content and
   *   optional first tool call ID from the assistant
   *   response (used on Turn 1 when the assistant
   *   message is not yet in the messages array).
   * @returns SHA-256 hex fingerprint, or `null` if no
   *   key part can be determined.
   */
  private computeFingerprint(
    messages: OpenAIMessage[],
    firstAssistant?: {
      content: string;
      firstToolCallId?: string;
    },
  ): string | null {
    // Collect all system+user messages before the first
    // assistant.
    const prefixParts: string[] = [];
    let firstAssistantMsg: OpenAIMessage | undefined;

    for (const m of messages) {
      if (m.role === 'assistant') {
        firstAssistantMsg = m;
        break;
      }
      if (m.role === 'system' || m.role === 'user') {
        prefixParts.push(extractTextContent(m.content));
      }
    }

    let keyPart: string | undefined;
    if (firstAssistantMsg) {
      // Assistant is already in messages (Turn 2+).
      if (firstAssistantMsg.tool_calls?.length) {
        keyPart = firstAssistantMsg.tool_calls[0].id;
      } else {
        keyPart = extractTextContent(firstAssistantMsg.content);
      }
    } else if (firstAssistant?.firstToolCallId) {
      // Assistant not in messages yet (Turn 1, tool
      // call).
      keyPart = firstAssistant.firstToolCallId;
    } else if (firstAssistant?.content !== undefined) {
      // Assistant not in messages yet (Turn 1, text).
      keyPart = firstAssistant.content;
    }
    if (!keyPart) return null;

    return createHash('sha256')
      .update(prefixParts.join('\0') + '\0' + keyPart)
      .digest('hex');
  }
}
