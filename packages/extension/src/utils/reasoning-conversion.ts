import { LanguageModelThinkingPart } from 'vscode';
import type { ReasoningFields } from './reasoning.js';
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
    const hasText = extracted.reasoning_details.some(
      (d) => (d.type === 'text' || d.type === 'summary') && d.text,
    );
    if (hasText) {
      presentFields.push('reasoning_details');
    }
  }

  return new LanguageModelThinkingPart(value, undefined, { presentFields });
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
  const reasoning_details: Array<{ type: string; text?: string }> = [];

  for (const part of parts) {
    const value = Array.isArray(part.value) ? part.value.join('') : part.value;
    if (!value || !value.trim()) continue;

    const presentFields =
      part.metadata && 'presentFields' in part.metadata
        ? (part.metadata as Record<string, unknown>).presentFields
        : undefined;
    if (Array.isArray(presentFields) && presentFields.length > 0) {
      for (const field of presentFields) {
        if (field === 'reasoning_content') {
          reasoning_content.push(value);
        } else if (field === 'reasoning') {
          reasoning.push(value);
        } else if (field === 'reasoning_details') {
          reasoning_details.push({ type: 'text', text: value });
        }
      }
    } else {
      reasoning_content.push(value);
      reasoning.push(value);
      reasoning_details.push({ type: 'text', text: value });
    }
  }

  if (reasoning_content.length === 0 && reasoning.length === 0 && reasoning_details.length === 0) {
    return null;
  }

  const result: ReasoningFields = {};
  if (reasoning_content.length > 0) {
    result.reasoning_content = reasoning_content.join('');
  }
  if (reasoning.length > 0) {
    result.reasoning = reasoning.join('');
  }
  if (reasoning_details.length > 0) {
    result.reasoning_details = reasoning_details;
  }
  return result;
}
