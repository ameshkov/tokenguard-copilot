/**
 * Processes a single SSE `data:` line from a streaming
 * chat completion response.
 */

import { LanguageModelDataPart, LanguageModelTextPart, LanguageModelToolCallPart } from 'vscode';
import type { LanguageModelResponsePart, Progress } from 'vscode';
import { USAGE_DATA_PART_MIME } from '@tokenguard/shared';
import { extractReasoningFields, reasoningToThinkingPart } from '../../utils/index.js';
import type { ReasoningCollector, UsageCollector, OpenAIToolCall } from './chat-types.js';
import type { Logger } from '../../logger/index.js';
import { extractUsageFromResponse } from './extract-usage.js';

/**
 * Mutable state carried across SSE data-line processing
 * calls within a single streaming response.
 */
export interface StreamingChunkState {
  /**
   * Accumulated tool call deltas indexed by their
   * `index` field from the SSE delta.
   */
  pendingToolCalls: Map<number, OpenAIToolCall>;
}

/**
 * Flushes all pending tool call deltas to the progress
 * reporter and clears the internal buffer.
 *
 * @param state - The streaming chunk state with pending
 *   tool calls.
 * @param progress - VS Code progress reporter.
 */
export function flushToolCalls(
  state: StreamingChunkState,
  progress: Progress<LanguageModelResponsePart>,
): void {
  for (const tc of state.pendingToolCalls.values()) {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      args = {};
    }
    progress.report(new LanguageModelToolCallPart(tc.id, tc.function.name, args));
  }
  state.pendingToolCalls.clear();
}

/**
 * Parsed SSE chunk (subset of the JSON fields we care about).
 */
type SseChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
      reasoning_details?: Array<{ type: string; text?: string }>;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * Reports token usage from an SSE chunk to the progress
 * reporter and captures it for the UsageTracker.
 *
 * @param parsed - The parsed SSE chunk.
 * @param progress - VS Code progress reporter.
 * @param usageOut - Optional usage collector.
 */
function reportUsageChunk(
  parsed: SseChunk,
  progress: Progress<LanguageModelResponsePart>,
  usageOut?: UsageCollector,
): void {
  const u = parsed.usage;
  if (!u) return;

  if (typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number') {
    const usageData = {
      prompt_tokens: u.prompt_tokens,
      completion_tokens: u.completion_tokens,
      total_tokens: u.total_tokens,
      prompt_tokens_details: { cached_tokens: 0 },
    };
    progress.report(
      new LanguageModelDataPart(
        new TextEncoder().encode(JSON.stringify(usageData)),
        USAGE_DATA_PART_MIME,
      ),
    );
  }

  if (usageOut && !usageOut.usage) {
    usageOut.usage = extractUsageFromResponse(parsed as unknown as Record<string, unknown>);
  }
}

/**
 * Accumulates reasoning fields from a delta into the
 * reasoning collector.
 *
 * @param reasoningOut - Mutable reasoning collector.
 * @param delta - The SSE delta object.
 */
function accumulateReasoningFields(
  reasoningOut: ReasoningCollector,
  delta: Record<string, unknown>,
): void {
  const df = extractReasoningFields(delta);
  if (!df) return;
  if (!reasoningOut.fields) reasoningOut.fields = {};
  if (df.reasoning_content)
    reasoningOut.fields.reasoning_content =
      (reasoningOut.fields.reasoning_content ?? '') + df.reasoning_content;
  if (df.reasoning)
    reasoningOut.fields.reasoning = (reasoningOut.fields.reasoning ?? '') + df.reasoning;
  if (df.reasoning_details) {
    if (!reasoningOut.fields.reasoning_details) reasoningOut.fields.reasoning_details = [];
    reasoningOut.fields.reasoning_details.push(...df.reasoning_details);
  }
}

/**
 * Accumulates tool call deltas from one SSE choice into
 * the streaming state.
 *
 * @param state - Mutable streaming state.
 * @param choice - The SSE choice with optional delta data.
 */
function accumulateToolCallDeltas(
  state: StreamingChunkState,
  choice: {
    delta?: {
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  },
): void {
  if (!choice.delta?.tool_calls) return;
  for (const tc of choice.delta.tool_calls) {
    let pending = state.pendingToolCalls.get(tc.index);
    if (!pending && tc.id) {
      pending = {
        id: tc.id,
        type: 'function',
        function: { name: '', arguments: '' },
      };
      state.pendingToolCalls.set(tc.index, pending);
    }
    if (pending) {
      if (tc.function?.name) pending.function.name += tc.function.name;
      if (tc.function?.arguments) pending.function.arguments += tc.function.arguments;
    }
  }
}

/**
 * Processes one `data:` line from an SSE stream.
 *
 * Parses the JSON payload and reports content, reasoning,
 * tool call deltas, and usage information to the progress
 * reporter.
 *
 * @param data - The raw data payload (without `data: ` prefix).
 * @param progress - VS Code progress reporter.
 * @param state - Mutable streaming state (tool call buffer).
 * @param reasoningOut - Optional collector for reasoning fields.
 * @param usageOut - Optional collector for usage data.
 * @param logger - Optional logger for trace diagnostics.
 * @returns `true` if the `[DONE]` sentinel was encountered
 *   (caller should stop reading the stream), `false` otherwise.
 */
export function processStreamingDataLine(
  data: string,
  progress: Progress<LanguageModelResponsePart>,
  state: StreamingChunkState,
  reasoningOut?: ReasoningCollector,
  usageOut?: UsageCollector,
  logger?: Logger,
): boolean {
  if (data === '[DONE]') {
    flushToolCalls(state, progress);
    return true;
  }

  let parsed: SseChunk;
  try {
    parsed = JSON.parse(data) as SseChunk;
  } catch {
    return false;
  }

  // Report usage when present in any chunk
  if (parsed.usage) {
    reportUsageChunk(parsed, progress, usageOut);
  }

  const choice = parsed.choices?.[0];
  if (!choice) return false;

  // Trace every SSE chunk for diagnostics
  logger?.trace(
    'SSE chunk received',
    `has_content=${!!choice?.delta?.content}`,
    `has_reasoning=${!!(
      choice?.delta?.reasoning_content ??
      choice?.delta?.reasoning ??
      choice?.delta?.reasoning_details
    )}`,
    `has_tool_calls=${!!choice?.delta?.tool_calls?.length}`,
    `finish_reason=${choice?.finish_reason ?? 'null'}`,
    `has_usage=${!!parsed.usage}`,
    `content_len=${(choice?.delta?.content ?? '').length}`,
  );

  // Surface reasoning content as thinking parts (before main content),
  // with presentFields metadata so only the fields the server actually
  // sent are reconstructed on the next turn.
  const thinkingPart = reasoningToThinkingPart(choice.delta ?? {});
  if (thinkingPart) {
    progress.report(thinkingPart as unknown as LanguageModelResponsePart);
  }

  const content = choice.delta?.content;
  if (content) {
    progress.report(new LanguageModelTextPart(content));
  }

  // Accumulate reasoning fields from deltas
  if (reasoningOut && choice.delta) {
    accumulateReasoningFields(reasoningOut, choice.delta);
  }

  // Accumulate tool call deltas
  accumulateToolCallDeltas(state, choice);

  // Flush on finish_reason
  if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
    flushToolCalls(state, progress);
  }

  return false;
}
