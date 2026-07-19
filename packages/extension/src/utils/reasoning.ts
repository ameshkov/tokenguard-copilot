/**
 * A single entry in the `reasoning_details` array returned
 * by providers such as OpenRouter for Anthropic models.
 *
 * Known fields are typed explicitly; an index signature
 * preserves any additional provider-specific fields (e.g.
 * `id`) so reasoning blocks can be round-tripped back to
 * the API unmodified.
 */
export interface ReasoningDetail {
  /** Detail type (e.g. `text`, `summary`, `reasoning.text`). */
  type: string;
  /** Text content for `text` / `reasoning.text` details. */
  text?: string;
  /**
   * Cryptographic signature covering the reasoning block.
   * `null` is permitted because some providers
   * (e.g. OpenRouter relaying Anthropic signatures) emit
   * `signature: null` on later stream deltas to signal
   * that the block has already been signed.
   */
  signature?: string | null;
  /** Summary content for `summary` / `reasoning.summary` details. */
  summary?: string;
  /** Encrypted payload for `reasoning.encrypted` details. */
  data?: string;
  /** Sequential index of the reasoning block. */
  index?: number;
  /** Wire format tag (e.g. `anthropic-claude-v1`). */
  format?: string;
  /** Provider-assigned detail identifier. */
  id?: string | null;
  /** Additional provider-specific fields. */
  [key: string]: unknown;
}

/**
 * All three reasoning fields — used as both input
 * (response delta / message) and output (cached
 * fields / backfill payload).
 */
export interface ReasoningFields {
  reasoning_content?: string;
  reasoning?: string;
  reasoning_details?: ReasoningDetail[];
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
 * - `reasoning_details` (array of {@link ReasoningDetail})
 *   — Anthropic (structured via OpenRouter); only entries
 *   with a visible text type (`text`, `summary`,
 *   `reasoning.text`, `reasoning.summary`) are included
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
    const text = source.reasoning_details.map(detailText).join('');
    if (text) candidates.push(text);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.length >= b.length ? a : b));
}

/**
 * Returns the displayable text of a single reasoning
 * detail entry, or an empty string when the entry does
 * not carry visible reasoning text.
 *
 * Recognises both the legacy shape (`type: "text"` /
 * `type: "summary"` with a `text` field) and the
 * OpenRouter shape (`type: "reasoning.text"` with a
 * `text` field, `type: "reasoning.summary"` with a
 * `summary` field).
 *
 * @param detail - A single reasoning detail entry.
 * @returns The visible reasoning text, or `''`.
 */
function detailText(detail: ReasoningDetail): string {
  if (detail.type === 'text' || detail.type === 'reasoning.text') {
    return detail.text ?? '';
  }
  if (detail.type === 'summary' || detail.type === 'reasoning.summary') {
    return detail.summary ?? detail.text ?? '';
  }
  return '';
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

/**
 * Returns whether two reasoning-detail entries belong to the
 * same reasoning block and should be merged during streaming
 * accumulation.
 *
 * Two entries are the same block when they share the same
 * `type`, their `index` values do not disagree, and their
 * `format` values do not disagree.
 *
 * When `wildcard` is `true`, a missing `index` or `format` on
 * either entry — common on intermediate streaming deltas,
 * where OpenRouter only attaches the `signature` and identity
 * fields to some chunks of a block — acts as a wildcard. This
 * prevents fragments of one block from being split into
 * separate entries, which would leave the earlier fragments
 * without a `signature` (or strand the `signature` on a
 * fragment without `index`/`format`); the upstream provider
 * then rejects the preserved `thinking` block with an
 * `Invalid signature in thinking block` error.
 *
 * When `wildcard` is `false`, both entries must have `index`
 * and `format` present and equal. `mergeReasoningDetails`
 * tries an exact pass first so that, when multiple blocks
 * share a type, a wildcard delta still joins the right block.
 *
 * Distinct blocks are always kept separate as long as their
 * `index` values are both present and differ, or their
 * `format` values are both present and differ.
 *
 * @param a - An accumulated or incoming reasoning detail.
 * @param b - An accumulated or incoming reasoning detail.
 * @param wildcard - When `true`, a missing `index` or
 *   `format` matches any value.
 * @returns `true` when the two entries are the same block.
 */
function sameReasoningBlock(a: ReasoningDetail, b: ReasoningDetail, wildcard: boolean): boolean {
  if ((a.type ?? '') !== (b.type ?? '')) return false;
  if (a.index !== undefined && b.index !== undefined && a.index !== b.index) return false;
  if (a.format !== undefined && b.format !== undefined && a.format !== b.format) return false;
  if (wildcard) return true;
  // Exact pass: require both index and format present on
  // both entries (equality is already guaranteed above).
  return (
    a.index !== undefined &&
    b.index !== undefined &&
    a.format !== undefined &&
    b.format !== undefined
  );
}

/**
 * Returns the first non-empty string signature from the
 * candidates, or `undefined` when none is present.
 *
 * @param candidates - Signature values, with later deltas
 *   taking precedence.
 * @returns The first non-empty signature, or `undefined`.
 */
function firstSignature(candidates: unknown[]): string | undefined {
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Merges two reasoning-detail deltas that belong to the
 * same block into a single entry.
 *
 * Concatenates the textual content fields (`text`,
 * `summary`, `data`) and preserves the most recent
 * non-empty `signature`. Unknown provider-specific fields
 * are carried over from the existing entry.
 *
 * @param existing - The accumulated entry so far.
 * @param incoming - The latest delta for the same block.
 * @returns A merged reasoning detail entry.
 */
function mergeDetail(existing: ReasoningDetail, incoming: ReasoningDetail): ReasoningDetail {
  const merged: ReasoningDetail = { ...existing, ...incoming };
  if (typeof incoming.text === 'string') {
    merged.text = (existing.text ?? '') + incoming.text;
  }
  if (typeof incoming.summary === 'string') {
    merged.summary = (existing.summary ?? '') + incoming.summary;
  }
  if (typeof incoming.data === 'string') {
    merged.data = (existing.data ?? '') + incoming.data;
  }
  const signature = firstSignature([incoming.signature, existing.signature]);
  if (signature !== undefined) {
    merged.signature = signature;
  }
  return merged;
}

/**
 * Merges streamed `reasoning_details` deltas into an
 * accumulated array, combining fragments that belong to
 * the same reasoning block.
 *
 * OpenRouter streams Anthropic reasoning as a sequence of
 * `reasoning_details` deltas: each chunk carries a text
 * fragment, and the final chunk carries the `signature`
 * that covers the whole block. Concatenating the fragments
 * in arrival order reproduces the assembled (non-streaming)
 * form, which is what the provider expects when reasoning is
 * preserved across turns.
 *
 * Deltas are grouped by block identity — the combination of
 * `type`, `index`, and `format` — so a single merged entry
 * is produced per reasoning block, holding the full text and
 * the preserved signature. Matching is wildcard-aware: an
 * incoming delta that omits `index` or `format` (as
 * OpenRouter does on intermediate chunks) still matches an
 * existing block of the same `type`, so fragments are never
 * split into separate entries that would leave the upstream
 * provider unable to verify the `signature`. Items that do
 * not share an identity with any accumulated entry are
 * appended in arrival order, keeping distinct blocks (and
 * distinct detail types) separate.
 *
 * @param existing - The accumulated details so far (may be
 *   `undefined` on the first delta).
 * @param incoming - The reasoning details from the current
 *   streaming delta.
 * @returns A new accumulated array with the incoming deltas
 *   merged in.
 */
export function mergeReasoningDetails(
  existing: ReasoningDetail[] | undefined,
  incoming: ReasoningDetail[],
): ReasoningDetail[] {
  const result: ReasoningDetail[] = existing ? existing.map((detail) => ({ ...detail })) : [];
  for (const item of incoming) {
    // Prefer an exact identity match (type + index + format
    // all present and equal) so that, when multiple blocks
    // share a type, a wildcard delta joins the right one.
    let matchIndex = findMatch(result, item, false);
    // Fall back to wildcard matching (missing index/format
    // act as wildcards) so fragments of one block that omit
    // the identity fields are still merged together.
    if (matchIndex === -1) {
      matchIndex = findMatch(result, item, true);
    }
    if (matchIndex === -1) {
      result.push({ ...item });
    } else {
      result[matchIndex] = mergeDetail(result[matchIndex], item);
    }
  }
  return result;
}

/**
 * Searches the accumulated details (from the end) for an
 * entry that belongs to the same block as `item`.
 *
 * @param details - The accumulated details so far.
 * @param item - The incoming reasoning detail.
 * @param wildcard - Passed through to `sameReasoningBlock`.
 * @returns The index of the matching entry, or `-1`.
 */
function findMatch(details: ReasoningDetail[], item: ReasoningDetail, wildcard: boolean): number {
  for (let index = details.length - 1; index >= 0; index--) {
    if (sameReasoningBlock(details[index], item, wildcard)) {
      return index;
    }
  }
  return -1;
}
