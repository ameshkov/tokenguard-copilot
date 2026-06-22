import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatDebugLogger, LogRequestInput } from '../chat-debug-logger/index.js';
import {
  mockMessage,
  mockModel,
  mockProvider,
  mockProgress,
  mockToken,
  noopReasoningCacheService,
  baseChatContext,
} from '../../test/chat-handler-test-helpers.js';
import { ChatHandler, type ChatContext } from './chat-handler.js';
import { createMockLogger } from '../../test/mock-logger.js';

describe('ChatHandler — orchestration', () => {
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

    const baseContext = baseChatContext();

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
  });
});
