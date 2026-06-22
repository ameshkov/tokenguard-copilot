import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockMessage,
  mockModel,
  mockProgress,
  mockToken,
  noopReasoningCacheService,
  baseChatContext,
} from '../../test/chat-handler-test-helpers.js';
import { ChatHandler, type ChatContext } from './chat-handler.js';
import { createMockLogger } from '../../test/mock-logger.js';

describe('ChatHandler — retryable-fetch integration', () => {
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

  const baseContext = baseChatContext();

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
