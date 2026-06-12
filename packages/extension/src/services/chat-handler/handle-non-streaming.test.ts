import { describe, it, expect, vi } from 'vitest';
import type * as vscode from 'vscode';
import { mockProgress } from '../../test/chat-handler-test-helpers.js';
import { handleNonStreaming } from './handle-non-streaming.js';
import { createMockLogger } from '../../test/mock-logger.js';

describe('handleNonStreaming', () => {
  it('extracts content from response', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: { content: 'Hello world' },
          },
        ],
      }),
    };

    const parts: { value: string }[] = [];
    const progress = {
      report: (part: { value: string }) => parts.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );
    expect(parts).toHaveLength(1);
    expect(parts[0].value).toBe('Hello world');
  });

  it('throws on HTTP error', async () => {
    const response = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    };

    const progress = { report: vi.fn() };
    const logger = createMockLogger();

    await expect(
      handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
        undefined,
        undefined,
        logger,
      ),
    ).rejects.toThrow('401 Unauthorized');

    expect(logger.error).toHaveBeenCalledWith(
      'HTTP 401 Unauthorized response body:',
      'Invalid API key',
    );
  });

  it('truncates long error response body in error message', async () => {
    const longHtml = '<html>' + 'x'.repeat(600) + '</html>';
    const response = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => longHtml,
    };

    const progress = { report: vi.fn() };
    const logger = createMockLogger();

    // The error message should be truncated, not contain the full HTML
    await expect(
      handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
        undefined,
        undefined,
        logger,
      ),
    ).rejects.toThrow(/^502 Bad Gateway: .*\.\.\.$/);

    // Logger should receive the full body
    expect(logger.error).toHaveBeenCalledWith('HTTP 502 Bad Gateway response body:', longHtml);
  });

  it('throws on empty choices', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ choices: [] }),
    };

    const progress = { report: vi.fn() };

    await expect(
      handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      ),
    ).rejects.toThrow('No response content');
  });

  it('reports tool calls from non-streaming response', async () => {
    const vscodeModule = await import('vscode');

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"London"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(1);
    const part = reported[0] as InstanceType<typeof vscodeModule.LanguageModelToolCallPart>;
    expect(part).toBeInstanceOf(vscodeModule.LanguageModelToolCallPart);
    expect(part.callId).toBe('call_1');
    expect(part.name).toBe('get_weather');
    expect(part.input).toEqual({ city: 'London' });
  });

  it('reports content and tool calls together', async () => {
    const vscodeModule = await import('vscode');

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Let me check.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"London"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toBeInstanceOf(vscodeModule.LanguageModelTextPart);
    expect(reported[1]).toBeInstanceOf(vscodeModule.LanguageModelToolCallPart);
  });

  it('handles tool call with invalid JSON arguments (non-streaming)', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: 'invalid',
                  },
                },
              ],
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(1);
    const part = reported[0] as { input: Record<string, unknown> };
    expect(part.input).toEqual({});
  });

  // --- Non-streaming thinking (reasoning) tests ---

  it('reports reasoning_content as LanguageModelThinkingPart before content', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_content: 'Let me think about this.',
              content: 'Here is the answer.',
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Let me think about this.');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
    expect(reported[1]).toHaveProperty('value', 'Here is the answer.');
  });

  it('reports reasoning (plaintext) as thinking part before content', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              reasoning: 'Anthropic plaintext thinking.',
              content: 'Answer text.',
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Anthropic plaintext thinking.');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning'],
    });
    expect(reported[1]).toHaveProperty('value', 'Answer text.');
  });

  it('reports reasoning_details array as thinking part before content', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_details: [
                { type: 'text', text: 'Let me analyze this.' },
                { type: 'summary', text: ' Now I understand.' },
              ],
              content: 'Final answer.',
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Let me analyze this. Now I understand.');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_details'],
    });
    expect(reported[1]).toHaveProperty('value', 'Final answer.');
  });

  it('filters out reasoning_details entries with type thinking (non-streaming)', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_details: [
                { type: 'thinking', text: 'Internal thought.' },
                { type: 'redacted_thinking', text: 'Redacted.' },
                { type: 'text', text: 'Public reasoning.' },
              ],
              content: 'Final answer.',
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(2);
    expect(reported[0]).toHaveProperty('value', 'Public reasoning.');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_details'],
    });
    expect(reported[1]).toHaveProperty('value', 'Final answer.');
  });

  it('reports only reasoning_content when no text content', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_content: 'Thinking only, no text.',
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveProperty('value', 'Thinking only, no text.');
    expect((reported[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
  });

  it('no thinking part when reasoning fields are absent', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Just content, no thinking.',
            },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveProperty('value', 'Just content, no thinking.');
  });

  it('reports usage data when usage is present in response', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: { content: 'Hello' },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
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

  it('does not report usage data when usage is absent', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: { content: 'Hello' },
          },
        ],
      }),
    };

    const reported: unknown[] = [];
    const progress = {
      report: (part: unknown) => reported.push(part),
    };

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    const usageParts = reported.filter(
      (p: unknown) =>
        (p as Record<string, unknown>).constructor?.name === 'LanguageModelDataPart' &&
        (p as Record<string, unknown>).mimeType === 'usage',
    );
    expect(usageParts.length).toBe(0);
  });

  it('skips malformed usage data gracefully', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: { content: 'Hello' },
          },
        ],
        usage: 'not an object',
      }),
    };

    const { parts, progress } = mockProgress();

    await handleNonStreaming(
      response as unknown as Response,
      progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
    );

    const usageParts = parts.filter(
      (p: Record<string, unknown>) =>
        p.constructor?.name === 'LanguageModelDataPart' && p.mimeType === 'usage',
    );
    expect(usageParts.length).toBe(0);
  });
});
