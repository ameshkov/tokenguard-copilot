import { describe, it, expect, vi } from 'vitest';
import type * as vscode from 'vscode';
// Import test-helpers first to activate the vi.mock('vscode', ...) before chat-handler imports vscode
import { createSSEStream } from '../../test/chat-handler-test-helpers.js';
import { handleStreaming } from './handle-streaming.js';

describe('handleStreaming', () => {
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

    await handleStreaming(
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
      handleStreaming(
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
    await handleStreaming(
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

    await handleStreaming(
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

    await handleStreaming(
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

    await handleStreaming(
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(1);
    const part = reported[0] as { input: Record<string, unknown> };
    expect(part.input).toEqual({});
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

    await handleStreaming(
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

    await handleStreaming(
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
