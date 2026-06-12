/**
 * Handles a streaming SSE response from the
 * `/chat/completions` endpoint.
 */

import type { LanguageModelResponsePart, Progress, CancellationToken } from 'vscode';
import type { ReasoningCollector, UsageCollector } from './chat-types.js';
import type { Logger } from '../../logger/index.js';
import { validateHttpResponse } from './response-utils.js';
import { processStreamingDataLine, type StreamingChunkState } from './process-streaming-chunk.js';

/**
 * Handles a streaming SSE response from the
 * `/chat/completions` endpoint.
 *
 * Reads the response body as a stream of SSE events,
 * parses each `data:` line, extracts
 * `choices[0].delta.content`, and reports each content
 * chunk via `progress.report()`.
 *
 * @param response - The fetch Response object.
 * @param progress - VS Code progress reporter.
 * @param token - Cancellation token.
 * @param reasoningOut - Optional collector for reasoning
 *   fields.
 * @param usageOut - Optional collector for usage data.
 * @param logger - Optional logger for diagnostics.
 * @throws Error if the response is not OK or the body is
 *   null.
 */
export async function handleStreaming(
  response: Response,
  progress: Progress<LanguageModelResponsePart>,
  token: CancellationToken,
  reasoningOut?: ReasoningCollector,
  usageOut?: UsageCollector,
  logger?: Logger,
): Promise<void> {
  await validateHttpResponse(response, logger);

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = '';
  const state: StreamingChunkState = {
    pendingToolCalls: new Map(),
  };

  try {
    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (token.isCancellationRequested) break;

        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        const isDone = processStreamingDataLine(
          data,
          progress,
          state,
          reasoningOut,
          usageOut,
          logger,
        );
        if (isDone) return;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
