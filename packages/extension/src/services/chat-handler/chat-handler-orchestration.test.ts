import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatDebugLogger, LogRequestInput } from '../chat-debug-logger/index.js';
import type { ContentRulesService, RuleApplicationResult } from '../content-rules/index.js';
import {
  mockMessage,
  mockModel,
  mockProvider,
  mockProgress,
  mockToken,
  noopReasoningCacheService,
  spyReasoningCacheService,
} from '../../test/chat-handler-test-helpers.js';
import { ChatHandler, type ChatContext, type OpenAIMessage } from './chat-handler.js';
import { createMockLogger } from '../../test/mock-logger.js';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { ReasoningCacheRepository } from '../../repositories/index.js';
import { ReasoningCacheService } from '../reasoning-cache/index.js';

describe('ChatHandler — orchestration', () => {
  // -----------------------------------------------------------------------
  // handle
  // -----------------------------------------------------------------------

  describe('handle', () => {
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

    const baseContext: ChatContext = {
      model: mockModel({ streaming: 0 }),
      provider: mockProvider(),
      apiKey: 'sk-test',
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

    it('sends User-Agent header when version is set', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const ctx: ChatContext = { ...baseContext, version: '1.2.1' };
      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const handler = new ChatHandler(ctx, noopReasoningCacheService());
      await handler.handle(messages, progress, token);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['User-Agent']).toBe('TokenGuardCopilot/v1.2.1');
    });

    it('omits explicit version but still sets User-Agent header', async () => {
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
      const token = mockToken();

      const handler = new ChatHandler(baseContext, noopReasoningCacheService());
      await handler.handle(messages, progress, token);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['User-Agent']).toBe('TokenGuardCopilot/v0.0.0');
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

    it('logs underlying network error cause from a failed fetch', async () => {
      // Simulate Node's typical wrapping of a low-level DNS error
      // by fetch: a top-level TypeError with message "fetch failed"
      // and the real cause on `cause` with `code`, `syscall`,
      // `hostname`, etc.
      const dnsCause = Object.assign(new Error('getaddrinfo ENOTFOUND api.example.invalid'), {
        code: 'ENOTFOUND',
        errno: -3008,
        syscall: 'getaddrinfo',
        hostname: 'api.example.invalid',
      });
      const wrapped = new TypeError('fetch failed', { cause: dnsCause });

      fetchMock.mockRejectedValue(wrapped);

      const logger = createMockLogger();
      const ctx: ChatContext = {
        ...baseContext,
        logger,
      };

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      let caught: unknown;
      handler.handle(messages, progress, token).catch((e) => {
        caught = e;
      });
      await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
      await vi.runAllTimersAsync();
      expect(caught).toBe(wrapped);

      expect(logger.error).toHaveBeenCalledWith(
        'Chat completion failed',
        `model=${ctx.model.id}`,
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=fetch failed',
        expect.stringMatching(
          /detail=.*message=fetch failed.*code=ENOTFOUND.*syscall=getaddrinfo.*hostname=api\.example\.invalid/,
        ),
      );
    });

    it('writes underlying network error cause to chat debug markdown on fetch failure', async () => {
      // Same DNS failure shape as above, but this time asserts
      // that the cause-chain summary flows through to the
      // ChatDebugLogger payload, so the per-session debug
      // markdown "Error" section is diagnosable on its own.
      const dnsCause = Object.assign(new Error('getaddrinfo ENOTFOUND api.example.invalid'), {
        code: 'ENOTFOUND',
        errno: -3008,
        syscall: 'getaddrinfo',
        hostname: 'api.example.invalid',
      });
      const wrapped = new TypeError('fetch failed', { cause: dnsCause });

      fetchMock.mockRejectedValue(wrapped);

      const { logger: chatDebugLogger, logRequest } = mockLogger();
      const ctx: ChatContext = {
        ...baseContext,
        chatDebugLogger,
        workspaceFolderUri: 'file:///workspace',
        workspaceFolders: ['/workspace'],
      };

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      let caught: unknown;
      handler.handle(messages, progress, token).catch((e) => {
        caught = e;
      });
      await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
      await vi.runAllTimersAsync();
      expect(caught).toBe(wrapped);

      expect(logRequest).toHaveBeenCalledOnce();
      const input = logRequest.mock.calls[0][0] as LogRequestInput;
      expect(input.error).toBeDefined();
      // Canonical message is on the first line; the cause-chain
      // summary is appended on a new line.
      expect(input.error).toContain('fetch failed');
      expect(input.error).toMatch(
        /message=fetch failed[\s\S]*code=ENOTFOUND[\s\S]*syscall=getaddrinfo[\s\S]*hostname=api\.example\.invalid/,
      );
      expect(input.cancelled).toBe(false);
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
          workspaceFolders: ['/workspace'],
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
      expect(input.workspaceFolders).toEqual(['/workspace']);
    });

    it('calls chatDebugLogger.logRequest after successful streaming response', async () => {
      const { logger, logRequest } = mockLogger();
      const handler = new ChatHandler(
        {
          ...baseContext,
          model: mockModel({ streaming: 1 }),
          chatDebugLogger: logger,
          workspaceFolderUri: 'file:///workspace',
          workspaceFolders: ['/workspace'],
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
          workspaceFolders: ['/workspace'],
        },
        noopReasoningCacheService(),
      );

      fetchMock.mockResolvedValue(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      );

      const { progress } = mockProgress();
      await expect(handler.handle([], progress, mockToken())).rejects.toThrow('401 Unauthorized');

      expect(logRequest).toHaveBeenCalledOnce();
      const input = logRequest.mock.calls[0][0] as LogRequestInput;
      expect(input.error).toContain('401 Unauthorized');
      expect(input.cancelled).toBe(false);
    });

    it('calls chatDebugLogger.logRequest with cancelled on abort', async () => {
      const { logger, logRequest } = mockLogger();
      const handler = new ChatHandler(
        {
          ...baseContext,
          chatDebugLogger: logger,
          workspaceFolderUri: 'file:///workspace',
          workspaceFolders: ['/workspace'],
        },
        noopReasoningCacheService(),
      );

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);

      const { progress } = mockProgress();
      const token = mockToken({ cancelled: true });
      let caught: unknown;
      handler.handle([], progress, token).catch((e) => {
        caught = e;
      });
      await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
      await vi.runAllTimersAsync();
      expect(caught).toBeInstanceOf(Error);

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
          workspaceFolders: ['/workspace'],
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

    // --- Content rules tests ---

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

  // -----------------------------------------------------------------------
  // Reasoning preservation
  // -----------------------------------------------------------------------

  describe('reasoning preservation', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      globalThis.fetch = fetchMock as typeof fetch;
    });

    const baseContext: ChatContext = {
      model: mockModel({ streaming: 0, preserveReasoning: 1 }),
      provider: mockProvider(),
      apiKey: 'sk-test',
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
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      );

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      await expect(handler.handle(messages, progress, mockToken())).rejects.toThrow(
        '401 Unauthorized',
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

    it('turn 1 reports thinking part with correct presentFields, turn 2 only sends reasoning_content', async () => {
      // Turn 1: user sends a message, LLM responds with
      // reasoning_content. The handler reports a thinking part
      // with presentFields metadata.
      // Turn 2: the reported parts from turn 1 are passed back
      // as message history. Only reasoning_content must appear
      // in the outgoing request body.

      const vscodeModule = await import('vscode');

      // --- Turn 1 ---
      fetchMock.mockResolvedValueOnce({
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

      const userMsg1 = mockMessage(1, [{ value: 'Capital of France?' }]);
      const { parts: turn1Parts, progress: turn1Progress } = mockProgress();
      const handler1 = new ChatHandler(
        { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
        noopReasoningCacheService(),
      );
      await handler1.handle([userMsg1], turn1Progress, mockToken());

      // Verify the thinking part was reported with metadata that
      // only lists reasoning_content (the only field the server sent).
      expect(turn1Parts.length).toBeGreaterThanOrEqual(2);
      const thinkingPart = turn1Parts[0] as {
        value: string;
        metadata?: { presentFields?: string[] };
      };
      expect(thinkingPart.value).toBe('The capital of France is Paris.');
      expect(thinkingPart.metadata).toEqual({
        presentFields: ['reasoning_content'],
      });
      const textPart1 = turn1Parts[1] as { value: string };
      expect(textPart1.value).toBe('Paris');

      // --- Turn 2 ---
      // Use the exact parts reported by turn 1 as the assistant
      // message history (filtering out any data parts).
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Sure, let me elaborate.' } }],
        }),
      });

      const assistantParts = turn1Parts.filter(
        (p) =>
          p instanceof vscodeModule.LanguageModelThinkingPart ||
          p instanceof vscodeModule.LanguageModelTextPart,
      );
      const assistantMsg = mockMessage(2, assistantParts as unknown as Record<string, unknown>[]);
      const userMsg2 = mockMessage(1, [{ value: 'Tell me more.' }]);

      const { progress: turn2Progress } = mockProgress();
      const handler2 = new ChatHandler(
        { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
        noopReasoningCacheService(),
      );
      await handler2.handle([assistantMsg, userMsg2], turn2Progress, mockToken());

      // Inspect the turn 2 request body — only reasoning_content
      // must be present in the assistant message.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, options] = fetchMock.mock.calls[1];
      const body = JSON.parse(options.body) as { messages: OpenAIMessage[] };
      const assistantBody = body.messages[0];
      expect(assistantBody.role).toBe('assistant');
      expect(assistantBody.reasoning_content).toBe('The capital of France is Paris.');
      expect(assistantBody.reasoning).toBeUndefined();
      expect(assistantBody.reasoning_details).toBeUndefined();
    });

    it('real cache backfills only reasoning_content when thinking parts are absent', async () => {
      // Multi-turn scenario with a real ReasoningCacheService:
      // Turn 1: assistant responds with reasoning_content. The
      // handler caches it via the real repository.
      // Turn 2: VS Code did NOT preserve thinking parts in the
      // message history. The real cache service backfills only
      // the fields that were cached (reasoning_content).

      const { db, raw } = createTestDb();
      try {
        clearTestDb(raw);
        const repo = new ReasoningCacheRepository(db);
        const realSvc = new ReasoningCacheService(repo, createMockLogger());

        // --- Turn 1: response with reasoning_content ---
        fetchMock.mockResolvedValueOnce({
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

        const userMsg1 = mockMessage(1, [{ value: 'Capital of France?' }]);
        const { progress: turn1Progress } = mockProgress();
        const handler1 = new ChatHandler(
          { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
          realSvc,
        );
        await handler1.handle([userMsg1], turn1Progress, mockToken());

        // --- Turn 2: no thinking parts in history ---
        // Simulate VS Code losing thinking parts — only the text
        // part is preserved in the assistant message.
        fetchMock.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            choices: [{ message: { content: 'Sure, let me elaborate.' } }],
          }),
        });

        const vscodeModule = await import('vscode');
        const textPart = new vscodeModule.LanguageModelTextPart('Paris');
        const assistantMsg = mockMessage(2, [textPart as unknown as Record<string, unknown>]);
        const userMsg2 = mockMessage(1, [{ value: 'Tell me more.' }]);

        const { progress: turn2Progress } = mockProgress();
        const handler2 = new ChatHandler(
          { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
          realSvc,
        );
        await handler2.handle([assistantMsg, userMsg2], turn2Progress, mockToken());

        // Inspect the turn 2 request body — the cache backfill
        // should have set only reasoning_content.
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [, options] = fetchMock.mock.calls[1];
        const body = JSON.parse(options.body) as { messages: OpenAIMessage[] };
        const assistantBody = body.messages[0];
        expect(assistantBody.role).toBe('assistant');
        expect(assistantBody.reasoning_content).toBe('The capital of France is Paris.');
        expect(assistantBody.reasoning).toBeUndefined();
        expect(assistantBody.reasoning_details).toBeUndefined();
      } finally {
        raw.close();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Cache control integration
  // -----------------------------------------------------------------------

  describe('handle — cache control integration', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      globalThis.fetch = fetchMock as typeof fetch;
    });

    const baseContext: ChatContext = {
      model: mockModel({ streaming: 0 }),
      provider: mockProvider(),
      apiKey: 'sk-test',
    };

    it('injects cache_control markers when cacheControl.enabled is true', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const vscodeModule = await import('vscode');
      const p1 = new vscodeModule.LanguageModelTextPart('System prompt');
      const p2 = new vscodeModule.LanguageModelTextPart('User message');
      const messages = [
        mockMessage(1, [p1 as unknown as Record<string, unknown>]),
        mockMessage(1, [p2 as unknown as Record<string, unknown>]),
      ];

      const ctx: ChatContext = {
        ...baseContext,
        cacheControl: {
          enabled: true,
          maxMarkers: 4,
        },
      };

      const { progress } = mockProgress();
      const handler = new ChatHandler(ctx, noopReasoningCacheService());
      await handler.handle(messages, progress, mockToken());

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body) as { messages: unknown[] };
      // At least one message should have cache_control markers
      const hasMarker = JSON.stringify(body.messages).includes('cache_control');
      expect(hasMarker).toBe(true);
    });

    it('does not inject markers when cacheControl is undefined', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const vscodeModule = await import('vscode');
      const p1 = new vscodeModule.LanguageModelTextPart('Hello');
      const messages = [mockMessage(1, [p1 as unknown as Record<string, unknown>])];

      const ctx: ChatContext = {
        ...baseContext,
      };

      const { progress } = mockProgress();
      const handler = new ChatHandler(ctx, noopReasoningCacheService());
      await handler.handle(messages, progress, mockToken());

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body) as { messages: unknown[] };
      const hasMarker = JSON.stringify(body.messages).includes('cache_control');
      expect(hasMarker).toBe(false);
    });

    it('does not inject markers when cacheControl.enabled is false', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const vscodeModule = await import('vscode');
      const p1 = new vscodeModule.LanguageModelTextPart('Hello');
      const messages = [mockMessage(1, [p1 as unknown as Record<string, unknown>])];

      const ctx: ChatContext = {
        ...baseContext,
        cacheControl: {
          enabled: false,
          maxMarkers: 4,
        },
      };

      const { progress } = mockProgress();
      const handler = new ChatHandler(ctx, noopReasoningCacheService());
      await handler.handle(messages, progress, mockToken());

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body) as { messages: unknown[] };
      const hasMarker = JSON.stringify(body.messages).includes('cache_control');
      expect(hasMarker).toBe(false);
    });

    it('includes TTL in markers when configured', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      const vscodeModule = await import('vscode');
      const p1 = new vscodeModule.LanguageModelTextPart('System prompt');
      const p2 = new vscodeModule.LanguageModelTextPart('User message');
      const messages = [
        mockMessage(1, [p1 as unknown as Record<string, unknown>]),
        mockMessage(1, [p2 as unknown as Record<string, unknown>]),
      ];

      const ctx: ChatContext = {
        ...baseContext,
        cacheControl: {
          enabled: true,
          maxMarkers: 4,
          ttl: '5m',
        },
      };

      const { progress } = mockProgress();
      const handler = new ChatHandler(ctx, noopReasoningCacheService());
      await handler.handle(messages, progress, mockToken());

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body) as { messages: unknown[] };
      const bodyStr = JSON.stringify(body.messages);
      expect(bodyStr).toContain('"cache_control"');
      expect(bodyStr).toContain('"ttl":300');
    });
  });

  // -----------------------------------------------------------------------
  // Retryable-fetch integration
  // -----------------------------------------------------------------------

  describe('handle — retryable-fetch integration', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      globalThis.fetch = fetchMock as typeof fetch;
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

    const baseContext: ChatContext = {
      model: mockModel({ streaming: 0 }),
      provider: mockProvider(),
      apiKey: 'sk-test',
    };

    it('retries on transient ETIMEDOUT and succeeds on the second attempt', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      const timedOutError = Object.assign(new Error('read ETIMEDOUT'), {
        code: 'ETIMEDOUT',
        errno: -60,
        syscall: 'read',
      });

      fetchMock.mockRejectedValueOnce(timedOutError).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ choices: [{ message: { content: 'Retry succeeded' } }] }),
      });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const promise = handler.handle(messages, progress, token);
      await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
      await promise;

      // fetch called twice (initial + one retry).
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Retry logged at warn with the new message and args.
      expect(logger.warn).toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying',
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=read ETIMEDOUT',
        'detail=message=read ETIMEDOUT code=ETIMEDOUT syscall=read',
        'attempt=1',
        expect.stringMatching(/^delay=\d+ms$/),
      );

      // No secrets in any logged argument.
      const logged = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
      expect(logged).not.toMatch(/Bearer|Authorization|sk-test/);

      // The retry request kept the correct method/body.
      const [, opts] = fetchMock.mock.calls[1];
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string) as { model: string };
      expect(body.model).toBe('gpt-4');
    });

    it('does not retry on a user-cancelled fetch (AbortError)', async () => {
      const logger = createMockLogger();
      const handler = new ChatHandler({ ...baseContext, logger }, noopReasoningCacheService());

      let onCancel: () => void = () => {};
      const token = mockToken({
        onCancellationRequested: (cb: unknown) => {
          onCancel = cb as () => void;
          return { dispose: () => {} };
        },
      });

      fetchMock.mockImplementation(async () => {
        onCancel();
        throw new DOMException('The operation was aborted', 'AbortError');
      });

      const messages = [mockMessage(1, [{ value: 'Go' }])];
      const { progress } = mockProgress();
      await expect(handler.handle(messages, progress, token)).rejects.toThrow();

      // fetch called only once — no retry on cancellation.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // The retry warn must not have fired.
      expect(logger.warn).not.toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });

    it('retries up to maxRetries then surfaces the last error with the request ID', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock.mockRejectedValue(new Error('read ETIMEDOUT'));

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      let caught: unknown;
      handler.handle(messages, progress, token).catch((e) => {
        caught = e;
      });
      await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
      await vi.runAllTimersAsync();

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/\[req .+\] read ETIMEDOUT/);

      // Three attempts total (maxRetries 2 + initial).
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Two retries logged, for attempts 1 and 2.
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenNthCalledWith(
        1,
        'Chat completion fetch failed, retrying',
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=read ETIMEDOUT',
        'detail=message=read ETIMEDOUT',
        'attempt=1',
        expect.any(String),
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        2,
        'Chat completion fetch failed, retrying',
        expect.any(String),
        'error=read ETIMEDOUT',
        'detail=message=read ETIMEDOUT',
        'attempt=2',
        expect.any(String),
      );
    });

    it('retries on a transient 503 (non-streaming) and succeeds on the second attempt', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock
        .mockResolvedValueOnce(
          new Response('Service Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
          }),
        )
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ choices: [{ message: { content: 'Retry succeeded' } }] }),
        });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const promise = handler.handle(messages, progress, token);
      await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
      await promise;

      // fetch called twice (initial 503 + one retry).
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Retry reason includes the status code; no secrets logged.
      expect(logger.warn).toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying',
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=503 Service Unavailable',
        'attempt=1',
        expect.stringMatching(/^delay=\d+ms$/),
      );
      const logged = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
      expect(logged).not.toMatch(/Bearer|Authorization|sk-test/);
    });

    it('retries on a transient 502 (streaming) with no body bytes read yet, then streams', async () => {
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 1 }),
      };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      const sseData =
        'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n';

      // First attempt: 502 (discarded, no body bytes read → retried).
      // Second attempt: 200 with a valid SSE body.
      fetchMock
        .mockResolvedValueOnce(
          new Response('Bad Gateway', {
            status: 502,
            statusText: 'Bad Gateway',
          }),
        )
        .mockResolvedValueOnce(new Response(new Blob([sseData]).stream(), { status: 200 }));

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { parts, progress } = mockProgress();
      const token = mockToken();

      const promise = handler.handle(messages, progress, token);
      await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
      await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(parts.map((p) => p.value).join('')).toBe('Hi there');
    });

    it('surfaces the final 503 with the request id after exhausting retries', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock.mockResolvedValue(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      );

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      let caught: unknown;
      handler.handle(messages, progress, token).catch((e) => {
        caught = e;
      });
      await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
      await vi.runAllTimersAsync();

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/\[req .+\] 503 Service Unavailable/);
      // Three attempts total (maxRetries 2 + initial); two retries logged.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('retries on a transient 429 with Retry-After and succeeds on the second attempt', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock
        .mockResolvedValueOnce(
          new Response('Too Many Requests', {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Retry-After': '2' },
          }),
        )
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ choices: [{ message: { content: 'Retry succeeded' } }] }),
        });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const promise = handler.handle(messages, progress, token);
      await vi.advanceTimersByTimeAsync(2_000); // Retry-After delay
      await promise;

      // fetch called twice (initial 429 + one retry).
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Retry reason includes the status code; delay reflects Retry-After.
      expect(logger.warn).toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying',
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=429 Too Many Requests',
        'attempt=1',
        'delay=2000ms',
      );
      // No secrets in any logged argument.
      const logged = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
      expect(logged).not.toMatch(/Bearer|Authorization|sk-test/);
    });

    it('surfaces the final 429 with the request id after exhausting retries', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock.mockResolvedValue(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      );

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      let caught: unknown;
      handler.handle(messages, progress, token).catch((e) => {
        caught = e;
      });
      await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
      await vi.runAllTimersAsync();

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/\[req .+\] 429 Too Many Requests/);
      // Three attempts total (maxRetries 2 + initial); two retries logged.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('returns a non-retryable 401 immediately without retrying', async () => {
      const ctx: ChatContext = { ...baseContext };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock.mockResolvedValue(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      );

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      await expect(handler.handle(messages, progress, token)).rejects.toThrow('401 Unauthorized');
      // No retry: fetch called once and the response flowed through validateHttpResponse.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry a mid-stream failure after a 200 response started streaming', async () => {
      const ctx: ChatContext = {
        ...baseContext,
        model: mockModel({ streaming: 1 }),
      };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      // A 200 response whose body emits one chunk then errors mid-stream.
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
            ),
          );
          controller.error(new Error('stream dropped'));
        },
      });
      fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200 }));

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      await expect(handler.handle(messages, progress, token)).rejects.toThrow('stream dropped');
      // The 200 was returned to the streaming handler; the mid-stream drop is
      // NOT a retryable outcome, so fetch was called exactly once.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on a transient 408 (non-streaming) and succeeds on the second attempt', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock
        .mockResolvedValueOnce(
          new Response('Request Timeout', {
            status: 408,
            statusText: 'Request Timeout',
          }),
        )
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ choices: [{ message: { content: 'Retry succeeded' } }] }),
        });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const promise = handler.handle(messages, progress, token);
      await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
      await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying',
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=408 Request Timeout',
        'attempt=1',
        expect.stringMatching(/^delay=\d+ms$/),
      );
      const logged = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
      expect(logged).not.toMatch(/Bearer|Authorization|sk-test/);
    });

    it('retries on a transient 400 (non-streaming) and succeeds on the second attempt', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock
        .mockResolvedValueOnce(
          new Response('Bad Request', {
            status: 400,
            statusText: 'Bad Request',
          }),
        )
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ choices: [{ message: { content: 'Retry succeeded' } }] }),
        });

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const promise = handler.handle(messages, progress, token);
      await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
      await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying',
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=400 Bad Request',
        'attempt=1',
        expect.stringMatching(/^delay=\d+ms$/),
      );
      const logged = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
      expect(logged).not.toMatch(/Bearer|Authorization|sk-test/);
    });

    it('surfaces the final 400 with the request id after exhausting retries', async () => {
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());

      fetchMock.mockResolvedValue(
        new Response('Bad Request', {
          status: 400,
          statusText: 'Bad Request',
        }),
      );

      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      let caught: unknown;
      handler.handle(messages, progress, token).catch((e) => {
        caught = e;
      });
      await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
      await vi.runAllTimersAsync();

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/\[req .+\] 400 Bad Request/);
      expect(fetchMock).toHaveBeenCalledTimes(3); // maxRetries(2) + initial
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });
  });
});
