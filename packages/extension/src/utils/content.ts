import type { OpenAIContentPart } from '../services/chat-handler/index.js';

/**
 * Extracts plain text from an `OpenAIMessage.content` value.
 *
 * - `string` → returned as-is.
 * - `OpenAIContentPart[]` → all `.text` values joined with
 *   empty string.
 * - `null` / `undefined` → returns `''`.
 *
 * @param content - The message content value.
 * @returns Plain text representation.
 */
export function extractTextContent(
  content: string | OpenAIContentPart[] | null | undefined,
): string {
  if (content === null || content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  return content.map((part) => part.text).join('');
}
