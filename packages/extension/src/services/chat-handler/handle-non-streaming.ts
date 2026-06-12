/**
 * Handles a non-streaming response from the
 * `/chat/completions` endpoint.
 */

import { LanguageModelDataPart, LanguageModelTextPart, LanguageModelToolCallPart } from 'vscode';
import type { LanguageModelResponsePart, Progress } from 'vscode';
import { USAGE_DATA_PART_MIME } from '@tokenguard/shared';
import {
  extractReasoning,
  extractReasoningFields,
  reasoningToThinkingPart,
} from '../../utils/index.js';
import type { ReasoningCollector, UsageCollector } from './chat-types.js';
import type { Logger } from '../../logger/index.js';
import { validateHttpResponse } from './response-utils.js';
import { extractUsageFromResponse } from './extract-usage.js';

/**
 * Reports tool call parts from a non-streaming response
 * to the progress reporter with proper JSON parsing
 * and error handling.
 *
 * @param toolCalls - Raw tool call objects from the
 *   response.
 * @param progress - VS Code progress reporter.
 * @param logger - Optional logger for parse warnings.
 */
function reportToolCalls(
  toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>,
  progress: Progress<LanguageModelResponsePart>,
  logger?: Logger,
): void {
  for (const tc of toolCalls) {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      logger?.warn(
        'Failed to parse tool call arguments in non-streaming response',
        `tool_name=${tc.function.name}`,
        `arguments=${tc.function.arguments}`,
      );
      args = {};
    }
    progress.report(new LanguageModelToolCallPart(tc.id, tc.function.name, args));
  }
}

/**
 * Handles a non-streaming response from the
 * `/chat/completions` endpoint.
 *
 * Extracts `choices[0].message.content` from the JSON
 * response and reports it as a single
 * `LanguageModelTextPart`.
 *
 * @param response - The fetch Response object.
 * @param progress - VS Code progress reporter.
 * @param reasoningOut - Optional collector for reasoning
 *   fields.
 * @param usageOut - Optional collector for token usage
 *   data.
 * @param logger - Optional logger for diagnostics.
 * @throws Error if the response is not OK or has no content.
 */
export async function handleNonStreaming(
  response: Response,
  progress: Progress<LanguageModelResponsePart>,
  reasoningOut?: ReasoningCollector,
  usageOut?: UsageCollector,
  logger?: Logger,
): Promise<void> {
  await validateHttpResponse(response, logger);

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        reasoning_content?: string;
        reasoning?: string;
        reasoning_details?: Array<{
          type: string;
          text?: string;
        }>;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: {
            name: string;
            arguments: string;
          };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };

  // Report token usage if available
  const usage = json.usage;
  if (usage?.prompt_tokens !== undefined && usage?.completion_tokens !== undefined) {
    const usageData = {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      prompt_tokens_details: {
        cached_tokens: 0,
      },
    };
    progress.report(
      new LanguageModelDataPart(
        new TextEncoder().encode(JSON.stringify(usageData)),
        USAGE_DATA_PART_MIME,
      ),
    );
  }

  // Collect usage for the usage tracker
  if (usageOut) {
    usageOut.usage = extractUsageFromResponse(json as unknown as Record<string, unknown>);
  }

  const message = json.choices?.[0]?.message;
  if (reasoningOut) {
    reasoningOut.fields = extractReasoningFields(message ?? {});
  }
  const reasoningContent = extractReasoning(message ?? {});
  const content = message?.content;
  const toolCalls = message?.tool_calls;

  logger?.debug(
    'Non-streaming response received',
    `content_len=${content?.length ?? 0}`,
    `reasoning_len=${reasoningContent?.length ?? 0}`,
    `tool_calls=${toolCalls?.length ?? 0}`,
  );

  if (!content && !reasoningContent && (!toolCalls || toolCalls.length === 0)) {
    throw new Error('No response content');
  }

  // Report reasoning content first (before main content),
  // with presentFields metadata so only the fields the
  // server actually sent are reconstructed on the next turn.
  const thinkingPart = reasoningToThinkingPart(message ?? {});
  if (thinkingPart) {
    progress.report(thinkingPart as unknown as LanguageModelResponsePart);
  }

  if (content) {
    progress.report(new LanguageModelTextPart(content));
  }

  if (toolCalls) {
    reportToolCalls(toolCalls, progress, logger);
  }
}
