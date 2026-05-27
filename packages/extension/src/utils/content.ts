import type { OpenAIContentPartUnion } from '../services/chat-handler/index.js';

/** Metadata describing an image content part for logging purposes. */
export interface ImagePartInfo {
  /** MIME type, e.g. 'image/png' or 'unknown' for external URLs. */
  mimeType: string;
  /** Size in bytes for data-URI images, or 0 for external URLs. */
  sizeBytes: number;
}

/**
 * Extracts image metadata from an `OpenAIMessage.content` value.
 *
 * - `string` → returns `[]` (plain strings have no images).
 * - `OpenAIContentPartUnion[]` → returns info for each `image_url` part.
 * - `null` / `undefined` → returns `[]`.
 *
 * Data-URI images yield a parsed MIME type and decoded byte size.
 * External (non-data-URI) URLs yield `mimeType: 'unknown'` and
 * `sizeBytes: 0`.
 *
 * @param content - The message content value.
 * @returns Array of image part metadata.
 */
export function extractImageParts(
  content: string | OpenAIContentPartUnion[] | null | undefined,
): ImagePartInfo[] {
  if (content === null || content === undefined) {
    return [];
  }

  if (typeof content === 'string') {
    return [];
  }

  const results: ImagePartInfo[] = [];

  for (const part of content) {
    if (part.type !== 'image_url') {
      continue;
    }

    const url = part.image_url.url;

    // Check if this is a data URI
    if (url.startsWith('data:')) {
      // data:<mime>;base64,<data>
      const commaIdx = url.indexOf(',');
      if (commaIdx === -1) {
        continue;
      }
      const header = url.slice(5, commaIdx); // strip 'data:'
      const semiBase64Idx = header.lastIndexOf(';base64');
      const mimeType = semiBase64Idx !== -1 ? header.slice(0, semiBase64Idx) : header;
      const base64Data = url.slice(commaIdx + 1);
      // Decoded byte size from base64 length (with padding adjustment)
      const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
      const sizeBytes = Math.floor((base64Data.length * 3) / 4) - padding;

      results.push({ mimeType, sizeBytes });
    } else {
      // External URL — can't determine mime or size without fetching
      results.push({ mimeType: 'unknown', sizeBytes: 0 });
    }
  }

  return results;
}

/**
 * Extracts plain text from an `OpenAIMessage.content` value.
 *
 * - `string` → returned as-is.
 * - `OpenAIContentPartUnion[]` → all text parts' `.text` values
 *   joined with empty string. Non-text parts are skipped.
 * - `null` / `undefined` → returns `''`.
 *
 * @param content - The message content value.
 * @returns Plain text representation.
 */
export function extractTextContent(
  content: string | OpenAIContentPartUnion[] | null | undefined,
): string {
  if (content === null || content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter(
      (part): part is Extract<OpenAIContentPartUnion, { type: 'text' }> => part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}
