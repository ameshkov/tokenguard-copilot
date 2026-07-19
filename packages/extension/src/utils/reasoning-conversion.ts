import { LanguageModelThinkingPart } from 'vscode';
import type { ReasoningDetail, ReasoningFields } from './reasoning.js';
import { extractReasoning, extractReasoningFields } from './reasoning.js';

/**
 * Converts extracted reasoning fields into a single
 * annotated thinking-part object.
 *
 * All reasoning fields from the same LLM response are
 * combined into one `LanguageModelThinkingPart`. The
 * `metadata.presentFields` array lists every field that
 * was present, allowing faithful reconstruction by
 * {@link thinkingPartsToReasoning}.
 *
 * When the reasoning carries a cryptographic `signature`
 * (e.g. Anthropic `thinking` blocks routed through
 * OpenRouter), the signed detail's `signature`, `type`,
 * `index`, `format`, and `id` are stored on the
 * thinking-part `metadata` so they can be restored
 * verbatim on the next turn.
 *
 * @param fields - The reasoning fields from an LLM
 *   response.
 * @returns A single `LanguageModelThinkingPart` when
 *   reasoning is present, or `null` otherwise.
 */
export function reasoningToThinkingPart(fields: ReasoningFields): LanguageModelThinkingPart | null {
  const extracted = extractReasoningFields(fields);
  if (!extracted) return null;

  const value = extractReasoning(extracted);
  if (!value) return null;

  const presentFields: string[] = [];

  if (typeof extracted.reasoning_content === 'string') {
    presentFields.push('reasoning_content');
  }
  if (typeof extracted.reasoning === 'string') {
    presentFields.push('reasoning');
  }
  if (Array.isArray(extracted.reasoning_details)) {
    if (extracted.reasoning_details.some(hasDisplayableText)) {
      presentFields.push('reasoning_details');
    }
  }

  const metadata: {
    presentFields: string[];
    signature?: string;
    detailType?: string;
    detailIndex?: number;
    detailFormat?: string;
    detailId?: string;
  } = { presentFields };

  // Carry the reasoning block's identity fields through the
  // thinking part metadata so they can be reconstructed
  // faithfully on the next turn. The `signature`, `type`,
  // `index`, `format`, and `id` of a signed reasoning detail
  // are all required by some providers (notably OpenRouter
  // when forwarding signed Anthropic `thinking` blocks): if
  // any field is dropped the upstream provider rejects the
  // request with "Invalid `signature` in `thinking` block".
  // Attached only when a signature is present, keeping
  // metadata minimal for providers that do not sign their
  // reasoning.
  const signedDetail = Array.isArray(extracted.reasoning_details)
    ? extracted.reasoning_details.find(
        (d) => typeof d.signature === 'string' && d.signature.length > 0,
      )
    : undefined;
  if (signedDetail) {
    metadata.detailType = signedDetail.type;
    if (typeof signedDetail.index === 'number') {
      metadata.detailIndex = signedDetail.index;
    }
    if (typeof signedDetail.format === 'string' && signedDetail.format) {
      metadata.detailFormat = signedDetail.format;
    }
    if (typeof signedDetail.id === 'string' && signedDetail.id) {
      metadata.detailId = signedDetail.id;
    }
    // The `.find()` predicate above guarantees a non-empty
    // string signature, but TS cannot narrow through `.find()`
    // callbacks — narrow explicitly so the metadata signature
    // stays strictly `string | undefined` (some providers emit
    // `signature: null` on later deltas, which we drop here).
    const signature = signedDetail.signature;
    if (typeof signature === 'string' && signature) {
      metadata.signature = signature;
    }
  }

  return new LanguageModelThinkingPart(value, undefined, metadata);
}

/**
 * Returns whether a reasoning detail entry carries
 * displayable text.
 *
 * Mirrors the type recognition in {@link extractReasoning}
 * (kept local to this module to avoid widening the utils
 * public API).
 *
 * @param detail - A single reasoning detail entry.
 * @returns `true` when the entry has visible reasoning text.
 */
function hasDisplayableText(detail: ReasoningDetail): boolean {
  if (detail.type === 'text' || detail.type === 'reasoning.text') {
    return Boolean(detail.text);
  }
  if (detail.type === 'summary' || detail.type === 'reasoning.summary') {
    return Boolean(detail.summary ?? detail.text);
  }
  return false;
}

/**
 * Reconstructs reasoning fields from thinking-part
 * objects.
 *
 * Reads `metadata.presentFields` to determine which
 * LLM response field each part belongs to. When
 * metadata is absent (backward compat), all three
 * fields are populated from the part's value.
 *
 * Consecutive `reasoning_details` deltas are merged into a
 * single reasoning block: their text is concatenated in
 * arrival order, and the `signature`, detail `type`,
 * `index`, `format`, and `id` carried in the thinking-part
 * metadata (when present) are restored so the
 * reconstructed block matches the original server output.
 * Some providers (notably OpenRouter when forwarding
 * signed Anthropic `thinking` blocks) require the
 * `format` and `index` fields to interpret the
 * `signature`; dropping them causes the upstream provider
 * to reject the backfilled message with an
 * "Invalid `signature` in `thinking` block" error.
 *
 * @param parts - Array of `LanguageModelThinkingPart`
 *   instances (typically from VS Code message history).
 * @returns The reconstructed reasoning fields, or
 *   `null` when parts is empty or all values are
 *   empty strings.
 */
export function thinkingPartsToReasoning(
  parts: ReadonlyArray<LanguageModelThinkingPart>,
): ReasoningFields | null {
  if (parts.length === 0) return null;

  const reasoning_content: string[] = [];
  const reasoning: string[] = [];
  const reasoningDetailText: string[] = [];
  let reasoningDetailSignature: string | undefined;
  let reasoningDetailType: string | undefined;
  let reasoningDetailIndex: number | undefined;
  let reasoningDetailFormat: string | undefined;
  let reasoningDetailId: string | undefined;

  for (const part of parts) {
    const value = Array.isArray(part.value) ? part.value.join('') : part.value;
    if (!value || !value.trim()) continue;

    const metadata = part.metadata as Record<string, unknown> | undefined;
    const presentFields = metadata?.presentFields;
    if (metadata && Array.isArray(presentFields) && presentFields.length > 0) {
      for (const field of presentFields) {
        if (field === 'reasoning_content') {
          reasoning_content.push(value);
        } else if (field === 'reasoning') {
          reasoning.push(value);
        } else if (field === 'reasoning_details') {
          // Accumulate streaming deltas for the same
          // reasoning block into one entry rather than
          // emitting one split entry per delta.
          reasoningDetailText.push(value);
          if (typeof metadata.signature === 'string' && metadata.signature) {
            reasoningDetailSignature = metadata.signature;
          }
          if (
            !reasoningDetailType &&
            typeof metadata.detailType === 'string' &&
            metadata.detailType
          ) {
            reasoningDetailType = metadata.detailType;
          }
          if (reasoningDetailIndex === undefined && typeof metadata.detailIndex === 'number') {
            reasoningDetailIndex = metadata.detailIndex;
          }
          if (
            !reasoningDetailFormat &&
            typeof metadata.detailFormat === 'string' &&
            metadata.detailFormat
          ) {
            reasoningDetailFormat = metadata.detailFormat;
          }
          if (!reasoningDetailId && typeof metadata.detailId === 'string' && metadata.detailId) {
            reasoningDetailId = metadata.detailId;
          }
        }
      }
    } else {
      reasoning_content.push(value);
      reasoning.push(value);
      reasoningDetailText.push(value);
    }
  }

  if (
    reasoning_content.length === 0 &&
    reasoning.length === 0 &&
    reasoningDetailText.length === 0
  ) {
    return null;
  }

  const result: ReasoningFields = {};
  if (reasoning_content.length > 0) {
    result.reasoning_content = reasoning_content.join('');
  }
  if (reasoning.length > 0) {
    result.reasoning = reasoning.join('');
  }
  if (reasoningDetailText.length > 0) {
    const detail: ReasoningDetail = {
      type: reasoningDetailType ?? 'text',
      text: reasoningDetailText.join(''),
    };
    if (reasoningDetailSignature) {
      detail.signature = reasoningDetailSignature;
    }
    // Round-trip the reasoning block identity fields carried
    // through the thinking-part metadata. Some providers reject
    // preserved reasoning blocks when these fields are missing
    // (e.g. OpenRouter requires `format` to interpret the
    // `signature` for Anthropic `thinking` blocks).
    if (reasoningDetailIndex !== undefined) {
      detail.index = reasoningDetailIndex;
    }
    if (reasoningDetailFormat) {
      detail.format = reasoningDetailFormat;
    }
    if (reasoningDetailId) {
      detail.id = reasoningDetailId;
    }
    result.reasoning_details = [detail];
  }
  return result;
}
