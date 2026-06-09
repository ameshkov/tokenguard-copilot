import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('ChatHandler — orchestration', () => {
  // -----------------------------------------------------------------------
  // handle
  // -----------------------------------------------------------------------

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

      await expect(handler.handle(messages, progress, token)).rejects.toBe(wrapped);

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

      await expect(handler.handle(messages, progress, token)).rejects.toBe(wrapped);

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
          workspaceFolders: ['/workspace'],
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
  // Retry-once fetch wrapper
  // -----------------------------------------------------------------------

  describe('handle — retry-once fetch wrapper', () => {
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

    it('retries once on transient ETIMEDOUT and succeeds on second attempt', async () => {
      // Simulates undici's keepAliveTimeout handing out a
      // half-dead connection — the first fetch attempt gets
      // an ETIMEDOUT, the second succeeds because the bad
      // connection is removed from the pool.
      const logger = createMockLogger();
      const ctx: ChatContext = { ...baseContext, logger };
      const handler = new ChatHandler(ctx, noopReasoningCacheService());
      const messages = [mockMessage(1, [{ value: 'Hello' }])];
      const { progress } = mockProgress();
      const token = mockToken();

      const timedOutError = Object.assign(new Error('read ETIMEDOUT'), {
        code: 'ETIMEDOUT',
        errno: -60,
        syscall: 'read',
      });

      fetchMock.mockRejectedValueOnce(timedOutError).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Retry succeeded' } }],
        }),
      });

      await handler.handle(messages, progress, token);

      // Should have called fetch twice
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // The error should be logged at warn level for the retry
      expect(logger.warn).toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying once',
        expect.stringMatching(/^requestId=[0-9a-f-]+$/),
        'error=read ETIMEDOUT',
      );

      // The response should be the successful one from the retry
      const parts = (progress.report as ReturnType<typeof vi.fn>).mock?.results;
      if (parts) {
        // Not all progress reporters are spies, so this is best-effort
      }

      // The correct URL and body should be sent
      const [, opts] = fetchMock.mock.calls[1];
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string) as { model: string };
      expect(body.model).toBe('gpt-4');
    });

    it('does not retry on user-cancelled fetch (AbortError)', async () => {
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

      // fetch called only once — no retry on cancellation
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // logger.warn should NOT have been called for retry
      expect(logger.warn).not.toHaveBeenCalledWith(
        'Chat completion fetch failed, retrying once',
        expect.any(String),
        expect.any(String),
      );
    });
  });
});
