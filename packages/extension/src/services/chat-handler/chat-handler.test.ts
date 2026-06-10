import { describe, it, expect } from 'vitest';
import type * as vscode from 'vscode';
import { mockMessage, mockModel, mockProvider } from '../../test/chat-handler-test-helpers.js';
import {
  ChatHandler,
  type ChatContext,
  type OpenAIMessage,
  type OpenAITool,
} from './chat-handler.js';

describe('ChatHandler — static methods', () => {
  // -----------------------------------------------------------------------
  // mapRole
  // -----------------------------------------------------------------------

  describe('mapRole', () => {
    it('maps User to user', () => {
      expect(ChatHandler.mapRole(1 as vscode.LanguageModelChatMessageRole)).toBe('user');
    });

    it('maps Assistant to assistant', () => {
      expect(ChatHandler.mapRole(2 as vscode.LanguageModelChatMessageRole)).toBe('assistant');
    });

    it('maps System to system', () => {
      expect(ChatHandler.mapRole(3 as vscode.LanguageModelChatMessageRole)).toBe('system');
    });

    it('defaults unknown roles to user', () => {
      expect(ChatHandler.mapRole(99 as vscode.LanguageModelChatMessageRole)).toBe('user');
    });
  });

  // -----------------------------------------------------------------------
  // translateMessages
  // -----------------------------------------------------------------------

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

    it('translates System role to system', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('You are a helpful assistant');
      const messages = [mockMessage(3, [part as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([{ role: 'system', content: 'You are a helpful assistant' }]);
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

    it('translates user message with only an image', async () => {
      const vscodeModule = await import('vscode');
      const imgData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/png');
      const messages = [mockMessage(1, [imgPart as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      const expectedUrl = `data:image/png;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: expectedUrl } }],
        },
      ]);
    });

    it('translates user message with text then image', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Describe this');
      const imgData = new Uint8Array([0x89, 0x50]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/png');
      const messages = [
        mockMessage(1, [
          textPart as unknown as Record<string, unknown>,
          imgPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      const expectedUrl = `data:image/png;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            { type: 'image_url', image_url: { url: expectedUrl } },
          ],
        },
      ]);
    });

    it('translates user message with image then text', async () => {
      const vscodeModule = await import('vscode');
      const imgData = new Uint8Array([0xff, 0xd8]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/jpeg');
      const textPart = new vscodeModule.LanguageModelTextPart('Look at this');
      const messages = [
        mockMessage(1, [
          imgPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      const expectedUrl = `data:image/jpeg;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: expectedUrl } },
            { type: 'text', text: 'Look at this' },
          ],
        },
      ]);
    });

    it('translates user message with multiple images', async () => {
      const vscodeModule = await import('vscode');
      const img1 = new Uint8Array([0x89, 0x50]);
      const img2 = new Uint8Array([0xff, 0xd8]);
      const imgPart1 = new vscodeModule.LanguageModelDataPart(img1, 'image/png');
      const imgPart2 = new vscodeModule.LanguageModelDataPart(img2, 'image/jpeg');
      const messages = [
        mockMessage(1, [
          imgPart1 as unknown as Record<string, unknown>,
          imgPart2 as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${Buffer.from(img1).toString('base64')}` },
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${Buffer.from(img2).toString('base64')}`,
              },
            },
          ],
        },
      ]);
    });

    it('keeps plain string content when no images are present', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('Hello');
      const messages = [mockMessage(1, [part as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('ignores non-image data parts', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('text');
      const pdfPart = new vscodeModule.LanguageModelDataPart(
        new Uint8Array([0x25, 0x50]),
        'application/pdf',
      );
      const messages = [
        mockMessage(1, [
          textPart as unknown as Record<string, unknown>,
          pdfPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'text' }]);
    });

    it('translates tool result with image data part', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('result');
      const imgData = new Uint8Array([0x89, 0x50]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/png');
      const toolResultPart = new vscodeModule.LanguageModelToolResultPart('call_1', [
        textPart,
        imgPart,
      ]);
      const messages = [mockMessage(1, [toolResultPart as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      const expectedUrl = `data:image/png;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'tool',
          content: JSON.stringify([
            { type: 'text', text: 'result' },
            { type: 'image_url', image_url: { url: expectedUrl } },
          ]),
          tool_call_id: 'call_1',
        },
      ]);
    });

    it('extracts reasoning from thinking parts with presentFields', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Here is my answer.');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart(
        'Internal reasoning...',
        undefined,
        { presentFields: ['reasoning_content'] },
      );
      const messages = [
        mockMessage(2, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'assistant',
          content: 'Here is my answer.',
          reasoning_content: 'Internal reasoning...',
        },
      ]);
    });

    it('extracts multiple presentFields from thinking parts', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Answer');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart(
        'Chain of thought',
        undefined,
        { presentFields: ['reasoning', 'reasoning_details'] },
      );
      const messages = [
        mockMessage(2, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result[0].reasoning).toBe('Chain of thought');
      expect(result[0].reasoning_details).toEqual([{ type: 'text', text: 'Chain of thought' }]);
      expect(result[0].reasoning_content).toBeUndefined();
    });

    it('populates all three fields when no presentFields metadata', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Answer');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart('Backward compat reasoning');
      const messages = [
        mockMessage(2, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result[0].reasoning_content).toBe('Backward compat reasoning');
      expect(result[0].reasoning).toBe('Backward compat reasoning');
      expect(result[0].reasoning_details).toEqual([
        { type: 'text', text: 'Backward compat reasoning' },
      ]);
    });

    it('no thinking parts -> no reasoning fields', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Just text');
      const messages = [mockMessage(2, [textPart as unknown as Record<string, unknown>])];
      const result = ChatHandler.translateMessages(messages);
      expect(result[0].reasoning_content).toBeUndefined();
      expect(result[0].reasoning).toBeUndefined();
      expect(result[0].reasoning_details).toBeUndefined();
    });

    it('mixed text + thinking parts on assistant message', async () => {
      const vscodeModule = await import('vscode');
      const textPart1 = new vscodeModule.LanguageModelTextPart('Part 1. ');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart('Thinking...', undefined, {
        presentFields: ['reasoning_content'],
      });
      const textPart2 = new vscodeModule.LanguageModelTextPart('Part 2.');
      const messages = [
        mockMessage(2, [
          textPart1 as unknown as Record<string, unknown>,
          thinkingPart as unknown as Record<string, unknown>,
          textPart2 as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result[0].content).toBe('Part 1. Part 2.');
      expect(result[0].reasoning_content).toBe('Thinking...');
    });

    it('thinking parts on non-assistant message are ignored', async () => {
      const vscodeModule = await import('vscode');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart('User thinking');
      const textPart = new vscodeModule.LanguageModelTextPart('User message');
      const messages = [
        mockMessage(1, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = ChatHandler.translateMessages(messages);
      expect(result[0].role).toBe('user');
      expect(result[0].reasoning_content).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // buildRequestBody
  // -----------------------------------------------------------------------

  describe('buildRequestBody', () => {
    const baseContext: ChatContext = {
      model: mockModel(),
      provider: mockProvider(),
      apiKey: 'sk-test',
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
        model: mockModel({
          defaultReasoningEffort: 'medium',
          reasoningEffortMap: JSON.stringify({
            low: { reasoning_effort: 'low' },
            medium: { reasoning_effort: 'medium' },
            high: { reasoning_effort: 'high' },
          }),
        }),
        reasoningEffort: 'medium',
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_effort).toBe('medium');
    });

    it('merges reasoningEffortMap entry into body with custom fields', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          defaultReasoningEffort: 'high',
          reasoningEffortMap: JSON.stringify({
            none: { reasoning_effort: null },
            high: {
              reasoning_effort: 'high',
              extra_body: {
                enable_thinking: true,
                preserve_thinking: true,
              },
            },
          }),
        }),
        reasoningEffort: 'high',
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
        model: mockModel({
          defaultReasoningEffort: 'ultra',
          reasoningEffortMap: JSON.stringify({
            low: { reasoning_effort: 'low' },
            high: { reasoning_effort: 'high' },
          }),
        }),
        reasoningEffort: 'ultra',
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

    it('merges string custom field into body', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: 'user', type: 'string', value: 'test-user' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.user).toBe('test-user');
    });

    it('merges number custom field into body', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: 'max_tokens', type: 'number', value: '4096' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.max_tokens).toBe(4096);
    });

    it('merges boolean custom field into body', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([
            {
              property: 'reasoning_split',
              type: 'boolean',
              value: 'true',
            },
          ]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_split).toBe(true);
    });

    it('merges boolean false custom field into body', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([
            {
              property: 'reasoning_split',
              type: 'boolean',
              value: 'false',
            },
          ]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.reasoning_split).toBe(false);
    });

    it('merges JSON custom field into body', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([
            {
              property: 'cache_control',
              type: 'json',
              value: '{"type":"ephemeral"}',
            },
          ]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.cache_control).toEqual({ type: 'ephemeral' });
    });

    it('custom field overrides built-in temperature', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          temperature: 0.7,
          customFields: JSON.stringify([{ property: 'temperature', type: 'number', value: '0.0' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.temperature).toBe(0.0);
    });

    it('custom field overrides reasoning effort map value', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          defaultReasoningEffort: 'high',
          reasoningEffortMap: JSON.stringify({
            high: { thinking: { type: 'enabled', budget_tokens: 8000 } },
          }),
          customFields: JSON.stringify([
            {
              property: 'thinking',
              type: 'json',
              value: '{"type":"disabled"}',
            },
          ]),
        }),
        reasoningEffort: 'high',
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.thinking).toEqual({ type: 'disabled' });
    });

    it('custom field overrides stream_options', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          streaming: 1,
          customFields: JSON.stringify([
            {
              property: 'stream_options',
              type: 'json',
              value: '{"include_usage":false}',
            },
          ]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.stream_options).toEqual({ include_usage: false });
    });

    it('merges multiple custom fields', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([
            { property: 'user', type: 'string', value: 'test' },
            { property: 'seed', type: 'number', value: '42' },
            {
              property: 'logprobs',
              type: 'boolean',
              value: 'true',
            },
          ]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.user).toBe('test');
      expect(body.seed).toBe(42);
      expect(body.logprobs).toBe(true);
    });

    it('ignores null customFields', () => {
      const body = ChatHandler.buildRequestBody(messages, baseContext);
      expect(body.model).toBe('gpt-4');
    });

    it('ignores empty customFields array', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({ customFields: '[]' }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(Object.keys(body)).not.toContain('undefined');
    });

    it('skips custom fields with invalid JSON value gracefully', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([
            {
              property: 'bad_field',
              type: 'json',
              value: '{invalid',
            },
            { property: 'good_field', type: 'string', value: 'ok' },
          ]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.bad_field).toBeUndefined();
      expect(body.good_field).toBe('ok');
    });

    it('skips all fields when customFields string is invalid JSON', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({ customFields: '{not an array' }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.model).toBe('gpt-4');
    });

    it('skips number field with NaN value', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: 'bad_num', type: 'number', value: 'abc' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.bad_num).toBeUndefined();
    });

    it('skips number field with Infinity value', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: 'inf', type: 'number', value: 'Infinity' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.inf).toBeUndefined();
    });

    it('skips number field with empty string value', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: 'empty_num', type: 'number', value: '' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.empty_num).toBeUndefined();
    });

    it('skips boolean field with empty string value', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: 'empty_bool', type: 'boolean', value: '' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.empty_bool).toBeUndefined();
    });

    it('skips json field with empty string value', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: 'empty_json', type: 'json', value: '' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body.empty_json).toBeUndefined();
    });

    it('skips field with empty property name', () => {
      const ctx = {
        ...baseContext,
        model: mockModel({
          customFields: JSON.stringify([{ property: '', type: 'string', value: 'orphan' }]),
        }),
      };
      const body = ChatHandler.buildRequestBody(messages, ctx);
      expect(body['']).toBeUndefined();
    });
  });
});
