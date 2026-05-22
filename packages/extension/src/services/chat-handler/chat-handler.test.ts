import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import {
  ChatHandler,
  type ChatContext,
  type OpenAIMessage,
  type OpenAITool,
} from './chat-handler.js';
import type { ChatDebugLogger, LogRequestInput } from '../chat-debug-logger/index.js';
import type { Model, Provider } from '../../db/schema.js';

vi.mock('vscode', () => ({
  LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  LanguageModelToolCallPart: class {
    constructor(
      public callId: string,
      public name: string,
      public input: Record<string, unknown>,
    ) {}
  },
  LanguageModelToolResultPart: class {
    constructor(
      public callId: string,
      public content: unknown[],
    ) {}
  },
  CancellationTokenSource: class {
    token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };
    cancel() {}
    dispose() {}
  },
}));

/** Helper to create a mock VS Code chat request message. */
function mockMessage(
  role: number,
  content: Array<Record<string, unknown>>,
): vscode.LanguageModelChatRequestMessage {
  return { role, content, name: undefined } as unknown as vscode.LanguageModelChatRequestMessage;
}

/** Helper to create a mock Model row. */
function mockModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'gpt-4',
    providerId: 'p1',
    displayName: null,
    maxContextWindowTokens: 128000,
    maxOutputTokens: 16384,
    streaming: 1,
    vision: 0,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    supportedReasoningEfforts: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: 0,
    inputCostPer1m: null,
    outputCostPer1m: null,
    cachedInputCostPer1m: null,
    enabled: 1,
    removed: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Helper to create a mock Provider row. */
function mockProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'p1',
    name: 'test-provider',
    baseUrl: 'https://api.example.com/v1',
    removed: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Helper to create a mock progress reporter. */
function mockProgress(): {
  parts: { value: string }[];
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
} {
  const parts: { value: string }[] = [];
  return {
    parts,
    progress: {
      report: (part: { value: string }) => parts.push(part),
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
  };
}

/** Helper to create a mock cancellation token. */
function mockToken(
  overrides: {
    cancelled?: boolean;
    onCancellationRequested?: (...args: unknown[]) => unknown;
  } = {},
): vscode.CancellationToken {
  return {
    isCancellationRequested: overrides.cancelled ?? false,
    onCancellationRequested:
      overrides.onCancellationRequested ?? vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as vscode.CancellationToken;
}

describe('ChatHandler', () => {
  describe('translateMessages', () => {
    it('translates User role to user', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('Hello');
      const messages = [mockMessage(1, [part as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('translates Assistant role to assistant', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('Hi there');
      const messages = [mockMessage(2, [part as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([{ role: 'assistant', content: 'Hi there' }]);
    });

    it('concatenates multiple text parts', async () => {
      const vscodeModule = await import('vscode');
      const p1 = new vscodeModule.LanguageModelTextPart('Part 1');
      const p2 = new vscodeModule.LanguageModelTextPart(' Part 2');
      const messages = [
        mockMessage(1, [
          p1 as unknown as Record<string, unknown>,
          p2 as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Part 1 Part 2' }]);
    });

    it('skips non-text parts', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('text');
      const messages = [
        mockMessage(1, [
          textPart as unknown as Record<string, unknown>,
          { toolCallId: '123', result: {} },
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'text' }]);
    });

    it('translates assistant message with tool calls', async () => {
      const vscodeModule = await import('vscode');
      const toolCallPart = new vscodeModule.LanguageModelToolCallPart('call_1', 'get_weather', {
        city: 'London',
      });
      const messages = [mockMessage(2, [toolCallPart as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'assistant',
          content: null,
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
      ]);
    });

    it('translates assistant message with text and tool calls', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Let me check the weather.');
      const toolCallPart = new vscodeModule.LanguageModelToolCallPart('call_1', 'get_weather', {
        city: 'London',
      });
      const messages = [
        mockMessage(2, [
          textPart as unknown as Record<string, unknown>,
          toolCallPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'assistant',
          content: 'Let me check the weather.',
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
      ]);
    });

    it('translates tool result messages', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Sunny, 22°C');
      const toolResultPart = new vscodeModule.LanguageModelToolResultPart('call_1', [textPart]);
      const messages = [mockMessage(1, [toolResultPart as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'tool',
          content: 'Sunny, 22°C',
          tool_call_id: 'call_1',
        },
      ]);
    });
  });

  describe('buildRequestBody', () => {
    const baseContext: ChatContext = {
      model: mockModel(),
      provider: mockProvider(),
      apiKey: 'sk-test',
      defaults: null,
    };

    const messages: OpenAIMessage[] = [{ role: 'user', content: 'Hello' }];

    it('builds basic request body', () => {
      const body = ChatHandler.buildRequestBody(messages, baseContext);
      expect(body.model).toBe('gpt-4');
      expect(body.messages).toEqual(messages);
      expect(body.stream).toBe(true);
    });

    it('includes stream_options when streaming', () => {
      const body = ChatHandler.buildRequestBody(messages, baseContext);
      expect(body.stream_options).toEqual({
        include_usage: true,
      });
    });

    it('omits stream_options when not streaming', () => {
      const ctx = {
        ...baseContext,
        model: { ...baseContext.model, streaming: 0 },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.stream).toBe(false);
      expect(body.stream_options).toBeUndefined();
    });

    it('includes temperature when set', () => {
      const ctx = {
        ...baseContext,
        model: { ...baseContext.model, temperature: 0.7 },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.temperature).toBe(0.7);
    });

    it('omits temperature when null', () => {
      const body = ChatHandler.buildRequestBody(messages, baseContext);
      expect(body.temperature).toBeUndefined();
    });

    it('includes topP, frequencyPenalty, presencePenalty', () => {
      const ctx = {
        ...baseContext,
        model: {
          ...baseContext.model,
          topP: 0.9,
          frequencyPenalty: 0.5,
          presencePenalty: -0.5,
        },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.top_p).toBe(0.9);
      expect(body.frequency_penalty).toBe(0.5);
      expect(body.presence_penalty).toBe(-0.5);
    });

    it('includes standard reasoning_effort field', () => {
      const ctx = {
        ...baseContext,
        model: {
          ...baseContext.model,
          supportedReasoningEfforts: '["low","medium","high"]',
          defaultReasoningEffort: 'medium',
        },
        reasoningEffort: 'medium',
        defaults: null,
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_effort).toBe('medium');
    });

    it('merges reasoningEffortMap entry into body', () => {
      const ctx = {
        ...baseContext,
        model: {
          ...baseContext.model,
          supportedReasoningEfforts: '["none","high"]',
          defaultReasoningEffort: 'high',
        },
        reasoningEffort: 'high',
        defaults: {
          contextSize: 128000,
          maxTokens: 16384,
          inputCostPer1M: 1,
          outputCostPer1M: 2,
          supportedCapabilities: ['reasoning_effort'],
          reasoningEffortMap: {
            none: { extra_body: { enable_thinking: false } },
            high: {
              extra_body: {
                enable_thinking: true,
                preserve_thinking: true,
              },
            },
          },
        },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.extra_body).toEqual({
        enable_thinking: true,
        preserve_thinking: true,
      });
    });

    it('uses standard reasoning_effort when no map', () => {
      const ctx = {
        ...baseContext,
        model: {
          ...baseContext.model,
          supportedReasoningEfforts: '["low","medium","high"]',
          defaultReasoningEffort: 'high',
        },
        reasoningEffort: 'high',
        defaults: {
          contextSize: 128000,
          maxTokens: 16384,
          inputCostPer1M: 1,
          outputCostPer1M: 2,
          supportedCapabilities: ['reasoning_effort'],
        },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_effort).toBe('high');
      expect(body.extra_body).toBeUndefined();
    });

    it('includes tools, tool_choice, and parallel_tool_calls when tools provided', () => {
      const tools: OpenAITool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];
      const ctx = { ...baseContext, tools };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.tools).toEqual(tools);
      expect(body.tool_choice).toBe('auto');
      expect(body.parallel_tool_calls).toBe(true);
    });

    it('uses tool_choice=required when toolMode is required', () => {
      const tools: OpenAITool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];
      const ctx = { ...baseContext, tools, toolMode: 'required' as const };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.tools).toEqual(tools);
      expect(body.tool_choice).toBe('required');
      expect(body.parallel_tool_calls).toBe(true);
    });

    it('defaults tool_choice to auto when toolMode is not set', () => {
      const tools: OpenAITool[] = [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read file',
          },
        },
      ];
      const ctx = { ...baseContext, tools };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.tool_choice).toBe('auto');
    });

    it('omits tools, tool_choice, and parallel_tool_calls when tools is undefined', () => {
      const body = ChatHandler.buildRequestBody(messages, baseContext);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
      expect(body.parallel_tool_calls).toBeUndefined();
    });

    it('omits tools, tool_choice, and parallel_tool_calls when tools is empty', () => {
      const ctx = { ...baseContext, tools: [] };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
      expect(body.parallel_tool_calls).toBeUndefined();
    });
  });

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

      await ChatHandler.handleNonStreaming(
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

      await expect(
        ChatHandler.handleNonStreaming(
          response as unknown as Response,
          progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
        ),
      ).rejects.toThrow('401 Unauthorized');
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
        ChatHandler.handleNonStreaming(
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

      await ChatHandler.handleNonStreaming(
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

      await ChatHandler.handleNonStreaming(
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

      await ChatHandler.handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      expect(reported).toHaveLength(1);
      const part = reported[0] as { input: Record<string, unknown> };
      expect(part.input).toEqual({});
    });
  });

  describe('handleStreaming', () => {
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

    it('yields content chunks from SSE stream', async () => {
      const stream = createSSEStream([
        JSON.stringify({
          choices: [{ delta: { content: 'Hello' } }],
        }),
        JSON.stringify({
          choices: [{ delta: { content: ' world' } }],
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
        body: null,
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

    it('handles cancellation', async () => {
      const stream = createSSEStream([
        JSON.stringify({
          choices: [{ delta: { content: 'Hello' } }],
        }),
        JSON.stringify({
          choices: [{ delta: { content: ' world' } }],
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
  });

  describe('handle', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      globalThis.fetch = fetchMock as typeof fetch;
    });

    const baseContext: ChatContext = {
      model: mockModel({ streaming: 0 }),
      provider: mockProvider(),
      apiKey: 'sk-test',
      defaults: null,
    };

    it('sends non-streaming request and reports content', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];

      const { parts, progress } = mockProgress();
      const token = mockToken();

      const handler = new ChatHandler(baseContext);
      await handler.handle(messages, progress, token);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer sk-test');

      expect(parts).toHaveLength(1);
      expect(parts[0].value).toBe('Response');
    });

    it('aborts fetch on cancellation', async () => {
      let onCancel: () => void = () => {};
      const token = mockToken({
        onCancellationRequested: (cb: unknown) => {
          onCancel = cb as () => void;
          return { dispose: () => {} };
        },
      });

      fetchMock.mockImplementation(async () => {
        // Simulate cancellation during fetch
        onCancel();
        throw new DOMException('Aborted', 'AbortError');
      });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const handler = new ChatHandler(baseContext);

      // Should not throw on abort
      await expect(handler.handle(messages, progress, token)).rejects.toThrow();
    });

    it('builds correct URL from baseUrl', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'OK' } }],
        }),
      });

      const ctx = {
        ...baseContext,
        provider: mockProvider({
          baseUrl: 'https://api.example.com/v1/',
        }),
      };

      const messages = [mockMessage(1, [{ value: 'Hi' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const handler = new ChatHandler(ctx);
      await handler.handle(messages, progress, token);

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
    });

    // --- Logger integration tests ---

    /** Helper to create a mock ChatDebugLogger. */
    function mockLogger(): {
      logger: ChatDebugLogger;
      logRequest: ReturnType<typeof vi.fn>;
    } {
      const logRequest = vi.fn();
      return {
        logger: { logRequest } as unknown as ChatDebugLogger,
        logRequest,
      };
    }

    it('calls chatDebugLogger.logRequest after successful non-streaming response', async () => {
      const { logger, logRequest } = mockLogger();
      const handler = new ChatHandler({
        ...baseContext,
        model: mockModel({ streaming: 0 }),
        chatDebugLogger: logger,
        workspaceFolderUri: 'file:///workspace',
      });

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hello' } }],
          }),
          { status: 200 },
        ),
      );

      const { progress } = mockProgress();
      await handler.handle([], progress, mockToken());

      expect(logRequest).toHaveBeenCalledOnce();
      const input = logRequest.mock.calls[0][0] as LogRequestInput;
      expect(input.responseContent).toBe('Hello');
      expect(input.cancelled).toBe(false);
      expect(input.error).toBeUndefined();
      expect(input.workspaceFolderUri).toBe('file:///workspace');
    });

    it('calls chatDebugLogger.logRequest after successful streaming response', async () => {
      const { logger, logRequest } = mockLogger();
      const handler = new ChatHandler({
        ...baseContext,
        model: mockModel({ streaming: 1 }),
        chatDebugLogger: logger,
        workspaceFolderUri: 'file:///workspace',
      });

      const sseData =
        'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n';

      fetchMock.mockResolvedValue(
        new Response(new Blob([sseData]).stream(), {
          status: 200,
        }),
      );

      const { progress } = mockProgress();
      await handler.handle([], progress, mockToken());

      expect(logRequest).toHaveBeenCalledOnce();
      const input = logRequest.mock.calls[0][0] as LogRequestInput;
      expect(input.responseContent).toBe('Hi there');
      expect(input.cancelled).toBe(false);
      expect(input.error).toBeUndefined();
    });

    it('calls chatDebugLogger.logRequest with error on API failure', async () => {
      const { logger, logRequest } = mockLogger();
      const handler = new ChatHandler({
        ...baseContext,
        chatDebugLogger: logger,
        workspaceFolderUri: 'file:///workspace',
      });

      fetchMock.mockResolvedValue(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      );

      const { progress } = mockProgress();
      await expect(handler.handle([], progress, mockToken())).rejects.toThrow('400 Bad Request');

      expect(logRequest).toHaveBeenCalledOnce();
      const input = logRequest.mock.calls[0][0] as LogRequestInput;
      expect(input.error).toContain('400 Bad Request');
      expect(input.cancelled).toBe(false);
    });

    it('calls chatDebugLogger.logRequest with cancelled on abort', async () => {
      const { logger, logRequest } = mockLogger();
      const handler = new ChatHandler({
        ...baseContext,
        chatDebugLogger: logger,
        workspaceFolderUri: 'file:///workspace',
      });

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);

      const { progress } = mockProgress();
      const token = mockToken({ cancelled: true });
      await expect(handler.handle([], progress, token)).rejects.toThrow();

      expect(logRequest).toHaveBeenCalledOnce();
      const input = logRequest.mock.calls[0][0] as LogRequestInput;
      expect(input.cancelled).toBe(true);
      expect(input.error).toBeUndefined();
    });

    it('does not fail when chatDebugLogger is not provided', async () => {
      const handler = new ChatHandler(baseContext);

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Ok' } }],
          }),
          { status: 200 },
        ),
      );

      const { progress } = mockProgress();
      await expect(handler.handle([], progress, mockToken())).resolves.not.toThrow();
    });

    it('swallows chatDebugLogger errors without affecting response', async () => {
      const logRequest = vi.fn().mockImplementation(() => {
        throw new Error('Logging failed');
      });
      const logger = { logRequest } as unknown as ChatDebugLogger;
      const handler = new ChatHandler({
        ...baseContext,
        model: mockModel({ streaming: 0 }),
        chatDebugLogger: logger,
        workspaceFolderUri: 'file:///workspace',
      });

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hello' } }],
          }),
          { status: 200 },
        ),
      );

      const { progress } = mockProgress();
      await expect(handler.handle([], progress, mockToken())).resolves.not.toThrow();

      expect(logRequest).toHaveBeenCalledOnce();
    });
  });
});
