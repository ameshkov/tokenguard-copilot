import { createHash } from 'node:crypto';
import type { OpenAIContentPartUnion } from '../services/chat-handler/index.js';
import { extractTextContent } from './content.js';

/**
 * Minimal message shape accepted by
 * {@link computeFingerprint}. {@link OpenAIMessage}
 * satisfies this interface structurally.
 */
export interface FingerprintMessage {
  /** Message role. */
  role: string;
  /** Text or structured content. */
  content: string | OpenAIContentPartUnion[] | null;
  /** Tool calls requested by the assistant. */
  tool_calls?: Array<{ id: string }>;
}

/**
 * Minimal tool call shape accepted by
 * {@link computeMessageFingerprint}.
 *
 * Structural subset of `OpenAIToolCall` — avoids a
 * dependency from utils → services.
 */
export interface FingerprintToolCall {
  /** Tool call ID assigned by the model. */
  id: string;
  /** Function call details. */
  function: {
    /** Function name. */
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
  };
}

/**
 * Computes a stable conversation fingerprint for
 * identifying the same conversation across turns.
 *
 * Collects all system and user messages in array order up
 * to (but not including) the first assistant message. The
 * first assistant provides the final key part: all tool
 * call IDs sorted alphabetically and joined with null
 * separators when present, otherwise the text content.
 *
 * When the first assistant message is already in the
 * messages array (Turn 2+), the optional `firstAssistant`
 * parameter is ignored.
 *
 * When the first assistant message is not yet in the array
 * (Turn 1), the `firstAssistant` parameter supplies the
 * missing data.
 *
 * @param messages - Chat request messages.
 * @param firstAssistant - The response content and
 *   optional tool call IDs from the assistant response
 *   (used on Turn 1 when the assistant message is not yet
 *   in the messages array).
 * @returns SHA-256 hex fingerprint, or `null` if no key
 *   part can be determined.
 */
export function computeFingerprint(
  messages: FingerprintMessage[],
  firstAssistant?: {
    content: string;
    toolCallIds?: string[];
  },
): string | null {
  // Collect all system+user messages before the first
  // assistant.
  const prefixParts: string[] = [];
  let firstAssistantMsg: FingerprintMessage | undefined;

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
      const ids = firstAssistantMsg.tool_calls
        .map((tc) => tc.id)
        .filter((id) => id.length > 0)
        .sort();
      if (ids.length > 0) {
        keyPart = ids.join('\0');
      }
    }
    if (keyPart === undefined) {
      keyPart = extractTextContent(firstAssistantMsg.content);
    }
  } else if (firstAssistant?.toolCallIds?.length) {
    // Assistant not in messages yet (Turn 1, tool calls).
    const ids = firstAssistant.toolCallIds.filter((id) => id.length > 0).sort();
    if (ids.length > 0) {
      keyPart = ids.join('\0');
    }
  }
  if (keyPart === undefined && firstAssistant?.content !== undefined) {
    // Assistant not in messages yet (Turn 1, text).
    keyPart = firstAssistant.content;
  }
  if (!keyPart) return null;

  return createHash('sha256')
    .update(prefixParts.join('\0') + '\0' + keyPart)
    .digest('hex');
}

/**
 * JSON replacer that sorts object keys alphabetically
 * at every nesting level, producing deterministic output.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return value;
}

/**
 * Computes a deterministic fingerprint for a single
 * assistant message based on its client-visible fields
 * (`content` and `tool_calls`). Reasoning fields are
 * **excluded** from the computation.
 *
 * Normalization rules:
 * - Empty string `""` and `null` content are treated as
 *   equivalent — both serialize to `null`.
 * - `tool_calls` are sorted by `id`, the
 *   `type: "function"` field is stripped, and all object
 *   keys are sorted alphabetically at every nesting level.
 * - Uses `JSON.stringify` with a key-sorting replacer for
 *   deterministic serialization.
 *
 * @param content - The assistant message content (text,
 *   structured parts, or null).
 * @param toolCalls - The assistant message tool calls, if
 *   any.
 * @returns SHA-256 hex fingerprint, or `null` if both
 *   content and tool calls are empty / absent.
 */
export function computeMessageFingerprint(
  content: string | OpenAIContentPartUnion[] | null,
  toolCalls?: FingerprintToolCall[],
): string | null {
  const text = extractTextContent(content);
  const normalizedContent = text === '' ? null : text;

  let normalizedToolCalls: Array<{
    id: string;
    function: { name: string; arguments: string };
  }> | null = null;

  if (toolCalls?.length) {
    normalizedToolCalls = [...toolCalls]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((tc) => ({
        id: tc.id,
        function: {
          arguments: tc.function.arguments,
          name: tc.function.name,
        },
      }));
  }

  if (normalizedContent === null && !normalizedToolCalls) {
    return null;
  }

  const payload = JSON.stringify(
    { content: normalizedContent, tool_calls: normalizedToolCalls },
    sortedReplacer,
  );

  return createHash('sha256').update(payload).digest('hex');
}
