import { describe, it, expect } from 'vitest';
import { mockModel, mockProvider } from '../../test/chat-handler-test-helpers.js';
import {
  ChatHandler,
  type ChatContext,
  type OpenAIMessage,
  type OpenAITool,
} from './chat-handler.js';

describe('ChatHandler — static methods', () => {
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
