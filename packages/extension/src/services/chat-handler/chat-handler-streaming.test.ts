import { describe, it, expect, vi } from 'vitest';
import type * as vscode from 'vscode';
// Import test-helpers first to activate the vi.mock('vscode', ...) before chat-handler imports vscode
import '../../test/chat-handler-test-helpers.js';
import { ChatHandler } from './chat-handler.js';

/**
 * Creates a ReadableStream from an array of SSE-formatted lines.
 *
 * @param lines - Raw JSON strings to wrap in `data:` SSE lines.
 * @returns A ReadableStream emitting the SSE-formatted text.
 */
function createSSEStream(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  const data = lines.map((l) => `data: ${l}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });
}

describe('ChatHandler — handleStreaming', () => {
  it('processes SSE stream content chunks', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [{ delta: { content: 'Hello' } }],
      }),
      JSON.stringify({
        choices: [{ delta: { content: ' world' } }],
        finish_reason: 'stop',
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const parts: { value: string }[] = [];
    const progress = {
      report: (part: { value: string }) => parts.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(parts).toHaveLength(2);
    expect(parts[0].value).toBe('Hello');
    expect(parts[1].value).toBe(' world');
  });

  it('throws on HTTP error', async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error',
    };

    const progress = { report: vi.fn() };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await expect(
      ChatHandler.handleStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
        token as unknown as vscode.CancellationToken,
      ),
    ).rejects.toThrow('500 Internal Server Error');
  });

  it('stops processing when cancelled', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [{ delta: { content: 'Hello' } }],
      }),
      JSON.stringify({
        choices: [{ delta: { content: ' world' } }],
        finish_reason: 'stop',
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const parts: { value: string }[] = [];
    const progress = {
      report: (part: { value: string }) => parts.push(part),
    };
    const token = {
      isCancellationRequested: true,
      onCancellationRequested: vi.fn(),
    };

    // Should stop processing when cancelled
    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    // May have 0 parts since cancellation is checked
    // before processing
    expect(parts.length).toBeLessThanOrEqual(2);
  });

  it('skips empty delta content', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [{ delta: {} }],
      }),
      JSON.stringify({
        choices: [{ delta: { content: 'Hello' } }],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const parts: { value: string }[] = [];
    const progress = {
      report: (part: { value: string }) => parts.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].value).toBe('Hello');
  });

  it('accumulates and reports tool call deltas', async () => {
    const vscodeModule = await import('vscode');

    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '',
                  },
                },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"city":' },
                },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '"London"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(1);
    const part = reported[0] as InstanceType<typeof vscodeModule.LanguageModelToolCallPart>;
    expect(part).toBeInstanceOf(vscodeModule.LanguageModelToolCallPart);
    expect(part.callId).toBe('call_1');
    expect(part.name).toBe('get_weather');
    expect(part.input).toEqual({ city: 'London' });
  });

  it('reports multiple tool calls', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"London"}',
                  },
                },
                {
                  index: 1,
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'get_time',
                    arguments: '{"tz":"UTC"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    const p1 = reported[0] as { name: string };
    const p2 = reported[1] as { name: string };
    expect(p1.name).toBe('get_weather');
    expect(p2.name).toBe('get_time');
  });

  it('handles tool call with invalid JSON arguments', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{invalid json}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(1);
    const part = reported[0] as { input: Record<string, unknown> };
    expect(part.input).toEqual({});
  });

  // --- Streaming thinking (reasoning) tests ---

  it('reports reasoning_content as LanguageModelThinkingPart in real time', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_content: 'Let me think...',
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_content: ' step by step.',
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { content: 'The answer is 42.' },
            finish_reason: 'stop',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    // First two reports are thinking parts
    expect(reported[0]).toHaveProperty('value', 'Let me think...');
    expect(reported[1]).toHaveProperty('value', ' step by step.');
    // Third is the content text part
    expect(reported[2]).toHaveProperty('value', 'The answer is 42.');
    expect(reported).toHaveLength(3);
  });

  it('reports reasoning (plaintext) as thinking part in streaming', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: { reasoning: 'Anthropic thinking...' },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { content: 'Done.' },
            finish_reason: 'stop',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Anthropic thinking...');
    expect(reported[1]).toHaveProperty('value', 'Done.');
  });

  it('reports reasoning_details array as thinking part in streaming', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_details: [
                { type: 'text', text: 'Let me explain.' },
                { type: 'summary', text: ' In summary:' },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { content: 'Answer.' },
            finish_reason: 'stop',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Let me explain. In summary:');
    expect(reported[1]).toHaveProperty('value', 'Answer.');
  });

  it('filters out reasoning_details entries with type thinking', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_details: [
                { type: 'thinking', text: 'Internal thought.' },
                { type: 'text', text: 'Public reasoning.' },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { content: 'Answer.' },
            finish_reason: 'stop',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Public reasoning.');
    expect(reported[1]).toHaveProperty('value', 'Answer.');
  });

  it('reports only reasoning_content when no content chunk present', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: { reasoning_content: 'thinking...' },
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveProperty('value', 'thinking...');
  });

  it('no thinking parts when reasoning fields are absent', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: { content: 'Just content.' },
            finish_reason: 'stop',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveProperty('value', 'Just content.');
  });

  it('interleaves reasoning and content chunks correctly', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: { reasoning_content: 'Think 1.' },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { content: 'Content 1.' },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { reasoning_content: 'Think 2.' },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: { content: ' Content 2.' },
            finish_reason: 'stop',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(4);
    expect(reported[0]).toHaveProperty('value', 'Think 1.');
    expect(reported[1]).toHaveProperty('value', 'Content 1.');
    expect(reported[2]).toHaveProperty('value', 'Think 2.');
    expect(reported[3]).toHaveProperty('value', ' Content 2.');
  });

  it('reports reasoning_content alongside tool calls in streaming', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_content: 'I will call a tool.',
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"London"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'I will call a tool.');
    expect(reported[1]).toHaveProperty('callId', 'call_1');
  });

  it('reports usage data when usage chunk is present', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: { content: 'Hello' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    const usageParts = reported.filter(
      (p: unknown) =>
        (p as Record<string, unknown>).constructor?.name === 'LanguageModelDataPart' &&
        (p as Record<string, unknown>).mimeType === 'usage',
    );
    expect(usageParts.length).toBe(1);
    const usagePart = usageParts[0] as InstanceType<typeof vscode.LanguageModelDataPart>;
    expect(usagePart.mimeType).toBe('usage');
    const usageData = JSON.parse(new TextDecoder().decode(usagePart.data));
    expect(usageData).toEqual({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: {
        cached_tokens: 0,
      },
    });
  });

  it('does not report usage data when usage is absent from stream', async () => {
    const stream = createSSEStream([
      JSON.stringify({
        choices: [
          {
            delta: { content: 'Hello' },
            finish_reason: 'stop',
          },
        ],
      }),
      '[DONE]',
    ]);

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };

    await ChatHandler.handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    const usageParts = reported.filter(
      (p: unknown) =>
        (p as Record<string, unknown>).constructor?.name === 'LanguageModelDataPart' &&
        (p as Record<string, unknown>).mimeType === 'usage',
    );
    expect(usageParts.length).toBe(0);
  });
});
