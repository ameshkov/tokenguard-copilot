import type { CacheControlConfig, CacheControlTtl } from '@tokenguard/shared';
import type { OpenAIContentPart, OpenAIMessage } from '../chat-handler/index.js';

/** Maps CacheControlTtl enum to wire-format seconds. */
const TTL_SECONDS: Record<CacheControlTtl, number> = {
  '5m': 300,
  '1h': 3600,
};

/**
 * Injects `cache_control` markers into OpenAI-format messages using
 * a forward-from-start + last-non-null-content placement algorithm.
 *
 * The algorithm:
 * 1. **Find** the last message with non-null content — it always
 *    gets a marker.
 * 2. **Mark from the start forward** — iterate from index 0,
 *    skipping null-content messages, until `maxMarkers` is
 *    exhausted or the last-marked message is reached.
 * 3. **Inject** — produce a new array with markers applied.
 */
export class CacheControlService {
  /**
   * Inject cache control markers into messages according to
   * the given configuration.
   *
   * Returns a **new** array — the input is never mutated. If any
   * message already contains a `cache_control` field, the input
   * array is returned unchanged.
   *
   * @param messages - OpenAI-format chat messages.
   * @param config - Cache control configuration.
   * @returns Messages with cache control markers injected.
   */
  static injectMarkers(messages: OpenAIMessage[], config: CacheControlConfig): OpenAIMessage[] {
    if (messages.length === 0) {
      return [];
    }

    // Bail out if any block already has cache_control
    if (CacheControlService.hasExistingCacheControl(messages)) {
      return messages;
    }

    // Place markers at message level
    const markedMessages = CacheControlService.placeMarkers(messages, config);

    if (markedMessages.size === 0) {
      return messages;
    }

    // Immutable injection
    return CacheControlService.inject(messages, markedMessages, config);
  }

  /**
   * Check whether any message already has a `cache_control` field
   * on any content part.
   *
   * @param messages - OpenAI-format messages.
   * @returns `true` if any block has `cache_control`.
   *
   * @internal Exported for tests only; not part of the public
   * module API.
   */
  static hasExistingCacheControl(messages: OpenAIMessage[]): boolean {
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.cache_control) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Decide which messages get cache control markers.
   *
   * Strategy: always mark the last non-null-content message,
   * then mark from the start forward (skipping null-content)
   * until `maxMarkers` is exhausted or the last-marked message
   * is reached.
   *
   * @param messages - OpenAI-format messages.
   * @param config - Cache control configuration.
   * @returns Set of message indices that get markers.
   *
   * @internal Exported for tests only; not part of the public
   * module API.
   */
  static placeMarkers(messages: OpenAIMessage[], config: CacheControlConfig): Set<number> {
    const marked = new Set<number>();

    // Find the last message with non-null content
    let lastIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const { content } = messages[i];
      if (content !== null && content !== undefined) {
        lastIdx = i;
        break;
      }
    }

    if (lastIdx < 0) {
      return marked;
    }

    // Always mark the last non-null-content message
    marked.add(lastIdx);

    // Mark from the start forward
    let cursor = 0;
    while (marked.size < config.maxMarkers && cursor < lastIdx) {
      const { content } = messages[cursor];
      if (content !== null && content !== undefined) {
        marked.add(cursor);
      }
      cursor++;
    }

    return marked;
  }

  /**
   * Produce a new messages array with cache control markers injected
   * at the specified message positions.
   *
   * For string content, converts to a single-element content part
   * array with the marker. For array content, adds the marker to
   * the last content part.
   *
   * @param messages - Original messages.
   * @param markedMessages - Set of message indices to mark.
   * @param config - Cache control configuration.
   * @returns New messages array with markers.
   */
  private static inject(
    messages: OpenAIMessage[],
    markedMessages: Set<number>,
    config: CacheControlConfig,
  ): OpenAIMessage[] {
    const cacheControl: OpenAIContentPart['cache_control'] = {
      type: 'ephemeral',
      ...(config.ttl !== undefined && config.ttl !== null ? { ttl: TTL_SECONDS[config.ttl] } : {}),
    };

    return messages.map((msg, i) => {
      if (!markedMessages.has(i)) {
        return msg;
      }

      if (typeof msg.content === 'string') {
        const newContent: OpenAIContentPart[] = [
          {
            type: 'text',
            text: msg.content,
            cache_control: { ...cacheControl },
          },
        ];
        return { ...msg, content: newContent };
      }

      if (Array.isArray(msg.content) && msg.content.length > 0) {
        const lastPartIdx = msg.content.length - 1;
        const newContent = msg.content.map((part, j) => {
          if (j === lastPartIdx) {
            return { ...part, cache_control: { ...cacheControl } };
          }
          return part;
        });
        return { ...msg, content: newContent };
      }

      return msg;
    });
  }
}
