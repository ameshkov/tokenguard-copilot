import { describe, it, expect, vi } from 'vitest';
import '../../test/chat-handler-test-helpers.js';
import type { LanguageModelResponsePart, Progress } from 'vscode';
import {
  createCapturingProgress,
  handleChatError,
  handleChatSuccess,
  logChatDebugRequest,
} from './handle-helpers.js';
import type { ChatContext, OpenAIMessage } from './chat-types.js';
import { mockModel, mockProvider, mockProgress } from '../../test/chat-handler-test-helpers.js';
import { createMockLogger } from '../../test/mock-logger.js';
import type { RuleApplicationResult } from '../content-rules/index.js';

// ---------------------------------------------------------------------------
// createCapturingProgress
// ---------------------------------------------------------------------------

describe('createCapturingProgress', () => {
  it('captures LanguageModelTextPart content', async () => {
    const vscodeModule = await import('vscode');
    const { progress } = mockProgress();
    const { capturingProgress, state } = createCapturingProgress(
      progress as Progress<LanguageModelResponsePart>,
    );

    const textPart = new vscodeModule.LanguageModelTextPart('Hello');
    capturingProgress.report(textPart);

    expect(state.responseContent).toBe('Hello');
    expect(state.responseToolCalls).toHaveLength(0);
  });

  it('captures LanguageModelToolCallPart content', async () => {
    const vscodeModule = await import('vscode');
    const { parts, progress } = mockProgress();
    const { capturingProgress, state } = createCapturingProgress(
      progress as Progress<LanguageModelResponsePart>,
    );

    const tc = new vscodeModule.LanguageModelToolCallPart('call_1', 'get_weather', {
      city: 'London',
    });
    capturingProgress.report(tc);

    expect(state.responseContent).toBe('');
    expect(state.responseToolCalls).toHaveLength(1);
    expect(state.responseToolCalls[0]).toEqual({
      id: 'call_1',
      name: 'get_weather',
      arguments: '{"city":"London"}',
    });
    // Should still forward to real progress
    expect(parts).toHaveLength(1);
  });
  it('passes through all parts to real progress', async () => {
    const vscodeModule = await import('vscode');
    const { parts, progress } = mockProgress();
    const { capturingProgress } = createCapturingProgress(
      progress as Progress<LanguageModelResponsePart>,
    );

    const textPart = new vscodeModule.LanguageModelTextPart('Hello');
    capturingProgress.report(textPart);

    expect(parts).toHaveLength(1);
    expect(parts[0].value).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// handleChatError
// ---------------------------------------------------------------------------

describe('handleChatError', () => {
  const baseContext: ChatContext = {
    model: mockModel(),
    provider: mockProvider(),
    apiKey: 'sk-test',
  };

  it('cancelled=true for AbortError', () => {
    const ctx = { ...baseContext, logger: createMockLogger() };
    const e = new DOMException('Aborted', 'AbortError');

    const result = handleChatError(e, { isCancellationRequested: false }, 'req-123', ctx);
    expect(result.cancelled).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.augmented).toBeDefined();
  });

  it('cancelled=true for token cancellation', () => {
    const ctx = { ...baseContext, logger: createMockLogger() };

    const result = handleChatError(
      new Error('Stopped'),
      { isCancellationRequested: true },
      'req-123',
      ctx,
    );
    expect(result.cancelled).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.augmented).toBeDefined();
  });

  it('augments Error.message with [req id]', () => {
    const ctx = { ...baseContext, logger: createMockLogger() };
    const e = new Error('Network failure');

    const result = handleChatError(e, { isCancellationRequested: false }, 'req-abc', ctx);
    expect(result.cancelled).toBe(false);
    expect(result.error).toContain('Network failure');
    expect(result.augmented.message).toBe('[req req-abc] Network failure');
  });

  it('adds cause-chain summary for non-Error', () => {
    const ctx = { ...baseContext, logger: createMockLogger() };

    const result = handleChatError(
      'plain string',
      { isCancellationRequested: false },
      'req-def',
      ctx,
    );
    expect(result.cancelled).toBe(false);
    expect(result.error).toContain('plain string');
    expect(result.augmented.message).toBe('[req req-def] plain string');
  });
});

// ---------------------------------------------------------------------------
// handleChatSuccess
// ---------------------------------------------------------------------------

describe('handleChatSuccess', () => {
  const messages: OpenAIMessage[] = [{ role: 'user', content: 'Hello' }];

  it('logs success with duration', () => {
    const logger = createMockLogger();
    const cacheReasoning = vi.fn();

    handleChatSuccess(
      'gpt-4',
      messages,
      null,
      'response text',
      [],
      new Date(),
      'req-1',
      false,
      cacheReasoning,
      logger,
    );

    expect(logger.debug).toHaveBeenCalledWith(
      'Chat completion response',
      'model=gpt-4',
      expect.stringMatching(/^duration=\d+ms$/),
      'response_content_len=13',
      'tool_calls=0',
      'has_reasoning=false',
      'requestId=req-1',
    );
  });

  it('calls cacheReasoning with correct args', () => {
    const cacheReasoning = vi.fn();

    handleChatSuccess(
      'gpt-4',
      messages,
      { reasoning_content: 'think' },
      'response',
      [{ id: 'c1', name: 'fn', arguments: '{}' }],
      new Date(),
      'req-1',
      true,
      cacheReasoning,
    );

    expect(cacheReasoning).toHaveBeenCalledOnce();
    const [msgs, fields, response, preserve] = cacheReasoning.mock.calls[0];
    expect(msgs).toEqual(messages);
    expect(fields).toEqual({ reasoning_content: 'think' });
    expect(response.content).toBe('response');
    expect(response.toolCalls).toEqual([{ id: 'c1', function: { name: 'fn', arguments: '{}' } }]);
    expect(preserve).toBe(true);
  });

  it('swallows cacheReasoning errors', () => {
    const logger = createMockLogger();
    const cacheReasoning = vi.fn().mockImplementation(() => {
      throw new Error('Cache disk full');
    });

    expect(() =>
      handleChatSuccess(
        'gpt-4',
        messages,
        null,
        'ok',
        [],
        new Date(),
        'req-1',
        false,
        cacheReasoning,
        logger,
      ),
    ).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to cache reasoning',
      'model=gpt-4',
      `error=${String(new Error('Cache disk full'))}`,
    );
  });
});

// ---------------------------------------------------------------------------
// logChatDebugRequest
// ---------------------------------------------------------------------------

describe('logChatDebugRequest', () => {
  const baseContext: ChatContext = {
    model: mockModel(),
    provider: mockProvider(),
    apiKey: 'sk-test',
  };

  it('constructs LogRequestInput with filtered modelOptions', () => {
    const logRequest = vi.fn();
    const ctx: ChatContext = {
      ...baseContext,
      chatDebugLogger: { logRequest } as unknown as ChatContext['chatDebugLogger'],
      workspaceFolderUri: 'file:///ws',
      workspaceFolders: ['/ws'],
    };

    logChatDebugRequest(ctx, {
      requestId: 'r1',
      finalMessages: [{ role: 'user', content: 'Hi' }],
      body: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
        stream_options: { include_usage: true },
        tools: [{ type: 'function', function: { name: 'fn' } }],
        tool_choice: 'auto',
        parallel_tool_calls: true,
        temperature: 0.7,
        seed: 42,
      },
      responseContent: 'Hello',
      responseToolCalls: [],
      reasoningCollector: { fields: null },
      startTime: new Date('2025-01-01T00:00:00Z'),
      endTime: new Date('2025-01-01T00:00:01Z'),
      cancelled: false,
      error: undefined,
    });

    expect(logRequest).toHaveBeenCalledOnce();
    const input = logRequest.mock.calls[0][0];
    // Filtered fields should be excluded
    expect(input.modelOptions).toEqual({ temperature: 0.7, seed: 42 });
    expect(input.modelName).toBe('test-provider/gpt-4');
  });

  it('handles missing chatDebugLogger gracefully', () => {
    // Should not throw when chatDebugLogger is undefined
    expect(() =>
      logChatDebugRequest(baseContext, {
        requestId: 'r1',
        finalMessages: [],
        body: {},
        responseContent: '',
        responseToolCalls: [],
        reasoningCollector: { fields: null },
        startTime: new Date(),
        endTime: new Date(),
        cancelled: false,
        error: undefined,
      }),
    ).not.toThrow();
  });

  it('swallows logRequest errors', () => {
    const logger = createMockLogger();
    const logRequest = vi.fn().mockImplementation(() => {
      throw new Error('Logging failed');
    });
    const ctx: ChatContext = {
      ...baseContext,
      logger,
      chatDebugLogger: { logRequest } as unknown as ChatContext['chatDebugLogger'],
      workspaceFolderUri: 'file:///ws',
    };

    expect(() =>
      logChatDebugRequest(ctx, {
        requestId: 'r1',
        finalMessages: [],
        body: {},
        responseContent: '',
        responseToolCalls: [],
        reasoningCollector: { fields: null },
        startTime: new Date(),
        endTime: new Date(),
        cancelled: false,
        error: undefined,
      }),
    ).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith('Failed to write debug log', 'Logging failed');
  });

  it('captures ruleResults in output', () => {
    const logRequest = vi.fn();
    const ctx: ChatContext = {
      ...baseContext,
      chatDebugLogger: { logRequest } as unknown as ChatContext['chatDebugLogger'],
      workspaceFolderUri: 'file:///ws',
    };

    const ruleResults: RuleApplicationResult[] = [
      { ruleId: 'r1', ruleName: 'Test', matched: true, applied: true, errored: false },
    ];

    logChatDebugRequest(ctx, {
      requestId: 'r1',
      finalMessages: [],
      body: {},
      responseContent: '',
      responseToolCalls: [],
      reasoningCollector: { fields: null },
      startTime: new Date(),
      endTime: new Date(),
      cancelled: false,
      error: undefined,
      ruleResults,
    });

    const input = logRequest.mock.calls[0][0];
    expect(input.contentRules).toEqual(ruleResults);
  });
});
