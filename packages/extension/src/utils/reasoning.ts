/**
 * All three reasoning fields — used as both input
 * (response delta / message) and output (cached
 * fields / backfill payload).
 */
export interface ReasoningFields {
  reasoning_content?: string;
  reasoning?: string;
  reasoning_details?: Array<{ type: string; text?: string }>;
}

/**
 * Extracts the longest reasoning string from a response
 * delta or message object.
 *
 * Checks three provider-dependent fields and returns
 * the longest value found, or `null` if none:
 * - `reasoning_content` (string) — DeepSeek, Kimi, GLM,
 *   Qwen, MiMo
 * - `reasoning` (string) — Anthropic (plaintext)
 * - `reasoning_details` (array of `{ type, text? }`) —
 *   Anthropic (structured); only entries with
 *   `type: "text"` or `type: "summary"` are included
 *
 * @param source - A delta or message object from the
 *   response.
 * @returns The reasoning text, or `null`.
 */
export function extractReasoning(source: ReasoningFields): string | null {
  const candidates: string[] = [];
  if (typeof source.reasoning_content === 'string') {
    candidates.push(source.reasoning_content);
  }
  if (typeof source.reasoning === 'string') {
    candidates.push(source.reasoning);
  }
  if (Array.isArray(source.reasoning_details)) {
    const text = source.reasoning_details
      .filter((d) => d.type === 'text' || d.type === 'summary')
      .map((d) => d.text ?? '')
      .join('');
    if (text) candidates.push(text);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.length >= b.length ? a : b));
}

/**
 * Extracts all three reasoning fields from a response
 * delta or message object.
 *
 * Unlike {@link extractReasoning} (which returns the
 * single longest string), this preserves all three
 * fields separately for caching.
 *
 * @param source - A delta or message object from the
 *   response.
 * @returns A {@link ReasoningFields} object, or `null`
 *   if no reasoning fields are present.
 */
export function extractReasoningFields(source: ReasoningFields): ReasoningFields | null {
  const result: ReasoningFields = {};
  if (typeof source.reasoning_content === 'string') {
    result.reasoning_content = source.reasoning_content;
  }
  if (typeof source.reasoning === 'string') {
    result.reasoning = source.reasoning;
  }
  if (Array.isArray(source.reasoning_details)) {
    result.reasoning_details = source.reasoning_details;
  }
  if (
    result.reasoning_content === undefined &&
    result.reasoning === undefined &&
    result.reasoning_details === undefined
  ) {
    return null;
  }
  return result;
}
