/**
 * Extracts token usage from a parsed chat completion
 * response JSON body.
 */

import type { ChatUsage } from './chat-types.js';

/**
 * Reads `usage.prompt_tokens`,
 * `usage.completion_tokens`,
 * `usage.prompt_tokens_details.cached_tokens`, and
 * `usage.completion_tokens_details.reasoning_tokens`.
 * Missing fields default to 0.
 *
 * @param json - Parsed response JSON.
 * @returns ChatUsage object or null if `usage` is
 *   absent.
 */
export function extractUsageFromResponse(json: Record<string, unknown>): ChatUsage | null {
  const usage = json.usage as Record<string, unknown> | undefined;
  if (!usage) return null;

  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const completionTokens =
    typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;

  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const cachedTokens = typeof details?.cached_tokens === 'number' ? details.cached_tokens : 0;

  const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined;
  const reasoningTokens =
    typeof completionDetails?.reasoning_tokens === 'number'
      ? completionDetails.reasoning_tokens
      : 0;

  return { promptTokens, completionTokens, cachedTokens, reasoningTokens };
}
