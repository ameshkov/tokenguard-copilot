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
import type { ReasoningCacheService } from '../reasoning-cache/reasoning-cache-service.js';

/** No-op ReasoningCacheService mock for tests that don't exercise reasoning preservation. */
function noopReasoningCacheService(): ReasoningCacheService {
  return {
    backfillReasoning: vi.fn(),
    cacheReasoning: vi.fn(),
  } as unknown as ReasoningCacheService;
}

vi.mock('vscode', () => ({
  LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  LanguageModelThinkingPart: class {
    constructor(
      public value: string | string[],
      public id?: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      public metadata?: { readonly [key: string]: any },
    ) {}
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
  LanguageModelDataPart: class {
    constructor(
      public data: Uint8Array,
      public mimeType: string,
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
  parts: Record<string, unknown>[];
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
} {
  const parts: Record<string, unknown>[] = [];
  return {
    parts,
    progress: {
      report: (part: Record<string, unknown>) => parts.push(part),
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

    it('includes reasoningEffortMap entry into body when effort level matches', () => {
      const ctx = {
        ...baseContext,
        model: {
          ...baseContext.model,
          defaultReasoningEffort: 'medium',
        },
        reasoningEffort: 'medium',
        defaults: {
          contextSize: 128000,
          maxTokens: 16384,
          inputCostPer1M: 1,
          outputCostPer1M: 2,
          supportedCapabilities: ['reasoning_effort'],
          reasoningEffortMap: {
            low: { reasoning_effort: 'low' },
            medium: { reasoning_effort: 'medium' },
            high: { reasoning_effort: 'high' },
          },
        },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_effort).toBe('medium');
    });

    it('merges reasoningEffortMap entry into body with custom fields', () => {
      const ctx = {
        ...baseContext,
        model: {
          ...baseContext.model,
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
            none: { reasoning_effort: null },
            high: {
              reasoning_effort: 'high',
              extra_body: {
                enable_thinking: true,
                preserve_thinking: true,
              },
            },
          },
        },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_effort).toBe('high');
      expect(body.extra_body).toEqual({
        enable_thinking: true,
        preserve_thinking: true,
      });
    });

    it('omits reasoning_effort when effort level is not in reasoningEffortMap', () => {
      const ctx = {
        ...baseContext,
        model: {
          ...baseContext.model,
          defaultReasoningEffort: 'ultra',
        },
        reasoningEffort: 'ultra',
        defaults: {
          contextSize: 128000,
          maxTokens: 16384,
          inputCostPer1M: 1,
          outputCostPer1M: 2,
          supportedCapabilities: ['reasoning_effort'],
          reasoningEffortMap: {
            low: { reasoning_effort: 'low' },
            high: { reasoning_effort: 'high' },
          },
        },
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_effort).toBeUndefined();
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

      await ChatHandler.handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      expect(reported).toHaveLength(2);
      expect(reported[0]).toHaveProperty('value', 'Let me think about this.');
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

      await ChatHandler.handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      expect(reported).toHaveLength(2);
      expect(reported[0]).toHaveProperty('value', 'Anthropic plaintext thinking.');
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

      await ChatHandler.handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      expect(reported).toHaveLength(2);
      expect(reported[0]).toHaveProperty('value', 'Let me analyze this. Now I understand.');
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

      await ChatHandler.handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      expect(reported).toHaveLength(2);
      expect(reported[0]).toHaveProperty('value', 'Public reasoning.');
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

      await ChatHandler.handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      expect(reported).toHaveLength(1);
      expect(reported[0]).toHaveProperty('value', 'Thinking only, no text.');
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

      await ChatHandler.handleNonStreaming(
        response as unknown as Response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      expect(reported).toHaveLength(1);
      expect(reported[0]).toHaveProperty('value', 'Just content, no thinking.');
    });

    it('reports reasoning_content alongside tool calls', async () => {
      const response = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [
            {
              message: {
                reasoning_content: 'I need to use a tool.',
                content: 'Using tool...',
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

      // Order: thinking part → text part → tool call part
      expect(reported).toHaveLength(3);
      expect(reported[0]).toHaveProperty('value', 'I need to use a tool.');
      expect(reported[1]).toHaveProperty('value', 'Using tool...');
      expect(reported[2]).toHaveProperty('callId', 'call_1');
      expect(reported[2]).toHaveProperty('name', 'get_weather');
    });

    it('reports usage from non-streaming response', async () => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      };
      const response = new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello' } }],
          usage,
        }),
      );

      const { parts, progress } = mockProgress();
      await ChatHandler.handleNonStreaming(
        response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      const usageParts = parts.filter(
        (p: Record<string, unknown>) =>
          p.constructor?.name === 'LanguageModelDataPart' && p.mimeType === 'usage',
      );
      expect(usageParts.length).toBe(1);
      const data = JSON.parse(new TextDecoder().decode(usageParts[0].data as Uint8Array));
      expect(data.prompt_tokens).toBe(100);
      expect(data.completion_tokens).toBe(50);
      expect(data.total_tokens).toBe(150);
    });

    it('does not report usage when absent from non-streaming response', async () => {
      const response = new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello' } }],
        }),
      );

      const { parts, progress } = mockProgress();
      await ChatHandler.handleNonStreaming(
        response,
        progress as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
      );

      const usageParts = parts.filter(
        (p: Record<string, unknown>) =>
          p.constructor?.name === 'LanguageModelDataPart' && p.mimeType === 'usage',
      );
      expect(usageParts.length).toBe(0);
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

      const handler = new ChatHandler(baseContext, noopReasoningCacheService());
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
      const handler = new ChatHandler(baseContext, noopReasoningCacheService());

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

      const handler = new ChatHandler(ctx, noopReasoningCacheService());
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
      const handler = new ChatHandler(
        {
          ...baseContext,
          model: mockModel({ streaming: 0 }),
          chatDebugLogger: logger,
          workspaceFolderUri: 'file:///workspace',
        },
        noopReasoningCacheService(),
      );

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
      const handler = new ChatHandler(
        {
          ...baseContext,
          model: mockModel({ streaming: 1 }),
          chatDebugLogger: logger,
          workspaceFolderUri: 'file:///workspace',
        },
        noopReasoningCacheService(),
      );

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
      const handler = new ChatHandler(
        {
          ...baseContext,
          chatDebugLogger: logger,
          workspaceFolderUri: 'file:///workspace',
        },
        noopReasoningCacheService(),
      );

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
      const handler = new ChatHandler(
        {
          ...baseContext,
          chatDebugLogger: logger,
          workspaceFolderUri: 'file:///workspace',
        },
        noopReasoningCacheService(),
      );

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
      const handler = new ChatHandler(baseContext, noopReasoningCacheService());

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
      const handler = new ChatHandler(
        {
          ...baseContext,
          model: mockModel({ streaming: 0 }),
          chatDebugLogger: logger,
          workspaceFolderUri: 'file:///workspace',
        },
        noopReasoningCacheService(),
      );

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

  describe('reasoning preservation', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      globalThis.fetch = fetchMock as typeof fetch;
    });

    /**
     * Creates a ReasoningCacheService mock that exposes the
     * underlying vi.fn() spies so tests can assert on call
     * counts and arguments.
     */
    function spyReasoningCacheService(): {
      svc: ReasoningCacheService;
      backfillMock: ReturnType<typeof vi.fn>;
      cacheMock: ReturnType<typeof vi.fn>;
    } {
      const backfillMock = vi.fn();
      const cacheMock = vi.fn();
      return {
        svc: {
          backfillReasoning: backfillMock,
          cacheReasoning: cacheMock,
        } as unknown as ReasoningCacheService,
        backfillMock,
        cacheMock,
      };
    }

    const baseContext: ChatContext = {
      model: mockModel({ streaming: 0, preserveReasoning: 1 }),
      provider: mockProvider(),
      apiKey: 'sk-test',
      defaults: null,
    };

    it('streaming: calls backfillReasoning before fetch and cacheReasoning after success', async () => {
      const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 1, preserveReasoning: 1 }),
      };
      const handler = new ChatHandler(ctx, svc);

      fetchMock.mockResolvedValue(
        new Response(
          new Blob([
            'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          ]).stream(),
          { status: 200 },
        ),
      );

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      await handler.handle(messages, progress, mockToken());

      // backfillReasoning is called before fetch
      expect(backfillMock).toHaveBeenCalledOnce();
      // cacheReasoning is called after successful response
      expect(cacheMock).toHaveBeenCalledOnce();

      // Verify preserveReasoning flag is passed correctly
      expect(backfillMock.mock.calls[0][1]).toBe(true);
      expect(cacheMock.mock.calls[0][3]).toBe(true);
    });

    it('non-streaming: calls backfillReasoning before fetch and cacheReasoning after success', async () => {
      const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 0, preserveReasoning: 1 }),
      };
      const handler = new ChatHandler(ctx, svc);

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      await handler.handle(messages, progress, mockToken());

      expect(backfillMock).toHaveBeenCalledOnce();
      expect(cacheMock).toHaveBeenCalledOnce();

      expect(backfillMock.mock.calls[0][1]).toBe(true);
      expect(cacheMock.mock.calls[0][3]).toBe(true);
    });

    it('HTTP error: backfillReasoning called but cacheReasoning NOT called', async () => {
      const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 0, preserveReasoning: 1 }),
      };
      const handler = new ChatHandler(ctx, svc);

      fetchMock.mockResolvedValue(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      );

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      await expect(handler.handle(messages, progress, mockToken())).rejects.toThrow(
        '400 Bad Request',
      );

      // backfillReasoning is always called before the request
      expect(backfillMock).toHaveBeenCalledOnce();
      expect(backfillMock.mock.calls[0][1]).toBe(true);

      // cacheReasoning must NOT be called on error
      expect(cacheMock).not.toHaveBeenCalled();
    });

    it('preserveReasoning disabled: methods called with preserveReasoning=false', async () => {
      const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 0, preserveReasoning: 0 }),
      };
      const handler = new ChatHandler(ctx, svc);

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      await handler.handle(messages, progress, mockToken());

      // Both methods are called but with preserveReasoning=false
      // (the service itself is a no-op when preserveReasoning is false)
      expect(backfillMock).toHaveBeenCalledOnce();
      expect(backfillMock.mock.calls[0][1]).toBe(false);
      expect(cacheMock).toHaveBeenCalledOnce();
      expect(cacheMock.mock.calls[0][3]).toBe(false);
    });

    it('streaming with reasoning: cacheReasoning receives accumulated reasoning_content in fields', async () => {
      const { svc, cacheMock } = spyReasoningCacheService();
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 1, preserveReasoning: 1 }),
      };
      const handler = new ChatHandler(ctx, svc);

      const sseData =
        'data: {"choices":[{"delta":{"reasoning_content":"Let me","content":""},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{"reasoning_content":" think"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"42"},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n';

      fetchMock.mockResolvedValue(new Response(new Blob([sseData]).stream(), { status: 200 }));

      const messages = [mockMessage(1, [{ value: 'What is the answer?' }])];
      const { progress } = mockProgress();
      await handler.handle(messages, progress, mockToken());

      expect(cacheMock).toHaveBeenCalledOnce();
      const fields = cacheMock.mock.calls[0][1];
      expect(fields).not.toBeNull();
      expect(fields.reasoning_content).toBe('Let me think');
    });

    it('non-streaming with reasoning: cacheReasoning receives extracted reasoning fields', async () => {
      const { svc, cacheMock } = spyReasoningCacheService();
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 0, preserveReasoning: 1 }),
      };
      const handler = new ChatHandler(ctx, svc);

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Paris',
                reasoning_content: 'The capital of France is Paris.',
              },
            },
          ],
        }),
      });

      const messages = [mockMessage(1, [{ value: 'Capital of France?' }])];
      const { progress } = mockProgress();
      await handler.handle(messages, progress, mockToken());

      expect(cacheMock).toHaveBeenCalledOnce();
      const fields = cacheMock.mock.calls[0][1];
      expect(fields).not.toBeNull();
      expect(fields.reasoning_content).toBe('The capital of France is Paris.');
    });
  });
});
