import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatDebugLogger, LogRequestInput } from '../chat-debug-logger/index.js';
import type { ContentRulesService, RuleApplicationResult } from '../content-rules/index.js';
import {
  mockMessage,
  mockModel,
  mockProgress,
  mockToken,
  noopReasoningCacheService,
  spyReasoningCacheService,
  baseChatContext,
} from '../../test/chat-handler-test-helpers.js';
import { ChatHandler, type ChatContext, type OpenAIMessage } from './chat-handler.js';

describe('ChatHandler — content rules', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    // Fake timers + deterministic jitter so any retry path that
    // sleeps with backoff does not block the suite on real waits.
    vi.useFakeTimers();
    vi.stubGlobal(
      'Math',
      Object.create(Math, {
        random: { value: () => 0, writable: true, configurable: true },
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const baseContext = baseChatContext();

  /** Helper to create a mock ContentRulesService. */
  function mockContentRulesService(results: RuleApplicationResult[] = []): ContentRulesService {
    return {
      applyRules: vi.fn().mockReturnValue({
        messages: [],
        ruleResults: results,
      }),
    } as unknown as ContentRulesService;
  }

  it('applies content rules between translate and reasoning backfill', async () => {
    const vscodeModule = await import('vscode');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const contentRules = mockContentRulesService([
      { ruleId: 'r1', ruleName: 'Test Rule', matched: true, applied: true, errored: false },
    ]);
    contentRules.applyRules = vi.fn().mockReturnValue({
      messages: [{ role: 'user', content: 'transformed' }],
      ruleResults: [
        { ruleId: 'r1', ruleName: 'Test Rule', matched: true, applied: true, errored: false },
      ],
    });

    const ctx: ChatContext = {
      ...baseContext,
      contentRules,
      tools: [{ type: 'function', function: { name: 'read_file' } }],
    };

    const textPart = new vscodeModule.LanguageModelTextPart('Hello');
    const messages = [mockMessage(1, [textPart as unknown as Record<string, unknown>])];
    const { progress } = mockProgress();
    const token = mockToken();

    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, progress, token);

    // Verify applyRules was called with translated messages, model ID, and tool names
    expect(contentRules.applyRules).toHaveBeenCalledOnce();
    const applyRulesFn = contentRules.applyRules as ReturnType<typeof vi.fn>;
    const [translatedMsgs, modelId, toolNames] = applyRulesFn.mock.calls[0];
    expect(translatedMsgs[0].role).toBe('user');
    expect(translatedMsgs[0].content).toBe('Hello');
    expect(modelId).toBe('gpt-4');
    expect(toolNames).toEqual(['read_file']);

    // The request body should use transformed messages
    const bodyArg = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(bodyArg.messages).toEqual([{ role: 'user', content: 'transformed' }]);
  });

  it('passes ruleResults to chat debug logger', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const logSpy = vi.fn();
    const chatDebugLogger: ChatDebugLogger = {
      logRequest: logSpy,
    } as unknown as ChatDebugLogger;

    const contentRules = mockContentRulesService();
    const ruleResults: RuleApplicationResult[] = [
      { ruleId: 'r1', ruleName: 'Strip skills', matched: true, applied: true, errored: false },
      { ruleId: 'r2', ruleName: 'Add prefix', matched: false, applied: false, errored: false },
    ];
    contentRules.applyRules = vi.fn().mockReturnValue({
      messages: [{ role: 'user', content: 'Hello' }],
      ruleResults,
    });

    const ctx: ChatContext = {
      ...baseContext,
      contentRules,
      chatDebugLogger,
      workspaceFolderUri: 'file:///test',
      workspaceFolders: ['/test'],
    };

    const messages = [mockMessage(1, [{ value: 'Hello' }])];
    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, mockProgress().progress, mockToken());

    expect(logSpy).toHaveBeenCalledOnce();
    const logInput = logSpy.mock.calls[0][0] as LogRequestInput;
    expect(logInput.contentRules).toEqual(ruleResults);
  });

  it('works without content rules configured (no service)', async () => {
    const vscodeModule = await import('vscode');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const ctx: ChatContext = {
      ...baseContext,
      // contentRules intentionally undefined
    };

    const textPart = new vscodeModule.LanguageModelTextPart('Hello');
    const messages = [mockMessage(1, [textPart as unknown as Record<string, unknown>])];
    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, mockProgress().progress, mockToken());

    const bodyArg = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(bodyArg.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('passes correct tool names to contentRules.applyRules', async () => {
    const vscodeModule = await import('vscode');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const contentRules = mockContentRulesService();
    contentRules.applyRules = vi.fn().mockReturnValue({
      messages: [{ role: 'user', content: 'Hello' }],
      ruleResults: [],
    });

    const ctx: ChatContext = {
      ...baseContext,
      contentRules,
      tools: [
        { type: 'function', function: { name: 'tool_a' } },
        { type: 'function', function: { name: 'tool_b' } },
      ],
    };

    const textPart = new vscodeModule.LanguageModelTextPart('Hello');
    const messages = [mockMessage(1, [textPart as unknown as Record<string, unknown>])];
    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, mockProgress().progress, mockToken());

    const applyRulesFn = contentRules.applyRules as ReturnType<typeof vi.fn>;
    const toolNames = applyRulesFn.mock.calls[0][2] as string[];
    expect(toolNames).toEqual(['tool_a', 'tool_b']);
  });

  it('cacheReasoning receives post-content-rules messages (not pre-rules)', async () => {
    // When content rules modify messages (e.g. add a system prompt),
    // cacheReasoning must use the post-rules messages so the
    // session fingerprint matches what backfillReasoning computes
    // on subsequent turns.

    const vscodeModule = await import('vscode');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const { svc, backfillMock, cacheMock } = spyReasoningCacheService();

    const contentRules = mockContentRulesService();
    // Content rules add a system message, changing the message array
    contentRules.applyRules = vi.fn().mockReturnValue({
      messages: [
        { role: 'system', content: 'You are an AI assistant.' },
        { role: 'user', content: 'Hello' },
      ],
      ruleResults: [],
    });

    const ctx: ChatContext = {
      ...baseContext,
      model: mockModel({ streaming: 0, preserveReasoning: 1 }),
      contentRules,
    };

    const textPart = new vscodeModule.LanguageModelTextPart('Hello');
    const messages = [mockMessage(1, [textPart as unknown as Record<string, unknown>])];
    const handler = new ChatHandler(ctx, svc);
    await handler.handle(messages, mockProgress().progress, mockToken());

    // backfillReasoning receives post-rules messages
    expect(backfillMock).toHaveBeenCalledOnce();
    const backfillMessages = backfillMock.mock.calls[0][0] as OpenAIMessage[];
    expect(backfillMessages).toEqual([
      { role: 'system', content: 'You are an AI assistant.' },
      { role: 'user', content: 'Hello' },
    ]);

    // cacheReasoning receives post-rules messages (same as backfill)
    // This is the fix: previously it received pre-rules messages
    expect(cacheMock).toHaveBeenCalledOnce();
    const cacheMessages = cacheMock.mock.calls[0][0] as OpenAIMessage[];
    expect(cacheMessages).toEqual([
      { role: 'system', content: 'You are an AI assistant.' },
      { role: 'user', content: 'Hello' },
    ]);
  });
});
