import { describe, it, expect, vi } from 'vitest';
import type * as vscode from 'vscode';
// Import test-helpers first to activate the vi.mock('vscode', ...) before chat-handler imports vscode
import { createSSEStream } from '../../test/chat-handler-test-helpers.js';
import { handleStreaming } from './handle-streaming.js';

describe('handleStreaming (reasoning/thinking)', () => {
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    // First two reports are thinking parts
    expect(reported[0]).toHaveProperty('value', 'Let me think...');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
    expect(reported[1]).toHaveProperty('value', ' step by step.');
    expect((reported[1] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Anthropic thinking...');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning'],
    });
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Let me explain. In summary:');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_details'],
    });
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Public reasoning.');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_details'],
    });
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveProperty('value', 'thinking...');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
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

    await handleStreaming(
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(4);
    expect(reported[0]).toHaveProperty('value', 'Think 1.');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
    expect(reported[1]).toHaveProperty('value', 'Content 1.');
    expect(reported[2]).toHaveProperty('value', 'Think 2.');
    expect((reported[2] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
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

    await handleStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      token as unknown as vscode.CancellationToken,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'I will call a tool.');
    expect(reported[1]).toHaveProperty('callId', 'call_1');
  });
});
