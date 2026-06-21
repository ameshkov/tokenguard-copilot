import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../../test/chat-handler-test-helpers.js';
import { retryableFetch, type RetryableFetchOptions } from './retryable-fetch.js';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry-policy.js';
import { createMockLogger } from '../../test/mock-logger.js';

describe('retryableFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const url = 'https://api.example.com/v1/chat/completions';

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

  function options(overrides: Partial<RetryableFetchOptions> = {}): RetryableFetchOptions {
    return {
      url,
      init: { method: 'POST', signal: new AbortController().signal },
      policy: DEFAULT_RETRY_POLICY,
      logger: createMockLogger(),
      requestId: 'req-1',
      ...overrides,
    };
  }

  it('returns the response when fetch succeeds on the first attempt', async () => {
    const ok = new Response('{}', { status: 200 });
    fetchMock.mockResolvedValue(ok);

    const response = await retryableFetch(options());

    expect(response).toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on a thrown network error then succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const promise = retryableFetch(options());
    await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('logs a warn entry with requestId, error, detail, attempt and delay on each retry', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('read ETIMEDOUT'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const promise = retryableFetch(options({ logger }));
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'Chat completion fetch failed, retrying',
      'requestId=req-1',
      'error=read ETIMEDOUT',
      'detail=message=read ETIMEDOUT',
      'attempt=1',
      expect.stringMatching(/^delay=\d+ms$/),
    );
    // Security: no secrets may appear in any logged argument.
    const allArgs = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
    expect(allArgs).not.toMatch(/Bearer|Authorization|sk-/);
  });

  it('preserves system-error fields (code, syscall, hostname) in the retry detail', async () => {
    // Node wraps low-level network errors with diagnostic
    // fields on `cause`. The retry warn must surface them so
    // the failure is diagnosable from a single log line.
    const dnsCause = Object.assign(new Error('getaddrinfo ENOTFOUND api.example.invalid'), {
      code: 'ENOTFOUND',
      syscall: 'getaddrinfo',
      hostname: 'api.example.invalid',
    });
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: dnsCause }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const promise = retryableFetch(options({ logger }));
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    const warnArgs = ((logger.warn as ReturnType<typeof vi.fn>).mock.calls[0] as string[]).join(
      ' ',
    );
    expect(warnArgs).toContain('error=fetch failed');
    expect(warnArgs).toContain('code=ENOTFOUND');
    expect(warnArgs).toContain('syscall=getaddrinfo');
    expect(warnArgs).toContain('hostname=api.example.invalid');
  });

  it('logs the successful fetch response at debug level', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const response = await retryableFetch(options({ logger }));

    expect(response.status).toBe(200);
    expect(logger.debug).toHaveBeenCalledWith(
      'Chat completion fetch response',
      'requestId=req-1',
      'status=200',
      'attempt=1',
    );
  });

  it('exhausts retries and re-throws the last error', async () => {
    const lastError = new Error('read ETIMEDOUT');
    fetchMock.mockRejectedValue(lastError);

    let caught: unknown;
    retryableFetch(options()).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
    await vi.runAllTimersAsync();

    expect(caught).toBe(lastError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // maxRetries(2) + 1
  });

  it('logs two retry warns (attempt 1 and 2) before exhausting', async () => {
    fetchMock.mockRejectedValue(new Error('read ETIMEDOUT'));
    const logger = createMockLogger();

    let caught: unknown;
    retryableFetch(options({ logger })).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.runAllTimersAsync();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('read ETIMEDOUT');

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      'Chat completion fetch failed, retrying',
      expect.any(String),
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

    // Exhaustion is surfaced at error level with the full detail.
    expect(logger.error).toHaveBeenCalledWith(
      'Chat completion fetch failed, retries exhausted',
      'requestId=req-1',
      'error=read ETIMEDOUT',
      'detail=message=read ETIMEDOUT',
      'attempts=3',
    );
  });

  it('does not retry a cancelled in-flight fetch', async () => {
    const controller = new AbortController();
    const logger = createMockLogger();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new Error('The operation was aborted');
    });

    await expect(
      retryableFetch(options({ logger, init: { method: 'POST', signal: controller.signal } })),
    ).rejects.toThrow('aborted');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not retry when the signal is already aborted before the first attempt', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      retryableFetch(options({ init: { method: 'POST', signal: controller.signal } })),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts a backoff sleep on cancellation without starting the retry', async () => {
    const controller = new AbortController();
    fetchMock.mockRejectedValueOnce(new Error('read ETIMEDOUT'));

    let caught: unknown;
    retryableFetch(options({ init: { method: 'POST', signal: controller.signal } })).catch((e) => {
      caught = e;
    });
    // Let the first attempt fail and the sleep start.
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.runAllTimersAsync();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('Sleep aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1); // retry attempt never started
  });

  it('does not start a retry that would exceed the deadline', async () => {
    const shortDeadline: RetryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      totalDeadlineMs: 1, // any backoff (>=500ms) exceeds it
    };
    fetchMock.mockRejectedValue(new Error('read ETIMEDOUT'));
    const logger = createMockLogger();

    let caught: unknown;
    retryableFetch(options({ policy: shortDeadline, logger })).catch((e) => {
      caught = e;
    });
    // The rejection is thrown synchronously (deadline check without sleep), so
    // settle the microtask queue.
    await vi.runAllTimersAsync();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('read ETIMEDOUT');

    expect(fetchMock).toHaveBeenCalledTimes(1); // retry skipped due to deadline

    // Deadline-exceeded is surfaced at error level.
    expect(logger.error).toHaveBeenCalledWith(
      'Chat completion fetch failed, retry would exceed deadline',
      'requestId=req-1',
      'error=read ETIMEDOUT',
      'detail=message=read ETIMEDOUT',
      expect.stringMatching(/^delay=\d+ms$/),
    );
  });

  it('retries on a 503 response then succeeds on the second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const promise = retryableFetch(options());
    await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('logs the HTTP status code in the retry reason for a 503', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const promise = retryableFetch(options({ logger }));
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'Chat completion fetch failed, retrying',
      'requestId=req-1',
      'error=503 Service Unavailable',
      'attempt=1',
      expect.stringMatching(/^delay=\d+ms$/),
    );
    // Security: no secrets may appear in any logged argument.
    const allArgs = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
    expect(allArgs).not.toMatch(/Bearer|Authorization|sk-/);
  });

  it('cancels the discarded 5xx response body before retrying', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const badGateway = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      body: { cancel },
    } as unknown as Response;
    fetchMock
      .mockResolvedValueOnce(badGateway)
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const promise = retryableFetch(options());
    await vi.advanceTimersByTimeAsync(60_000);
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The discarded 502 body was released before the retry.
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('returns a non-retryable response immediately without cancelling its body', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const unauthorized = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      body: { cancel },
    } as unknown as Response;
    fetchMock.mockResolvedValueOnce(unauthorized);

    const response = await retryableFetch(options());

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The response was returned to the caller; its body is the caller's to read.
    expect(cancel).not.toHaveBeenCalled();
  });

  it('exhausts retries on repeated 503 and re-throws the last status error', async () => {
    fetchMock.mockResolvedValue(
      new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      }),
    );

    let caught: unknown;
    retryableFetch(options()).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
    await vi.runAllTimersAsync();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('503 Service Unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(3); // maxRetries(2) + 1
  });

  it('honours a Retry-After delta-seconds header on a 429', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '2' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const promise = retryableFetch(options());
    await vi.advanceTimersByTimeAsync(2_000); // Retry-After delay
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('logs the Retry-After delay for a 429', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '2' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const promise = retryableFetch(options({ logger }));
    await vi.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'Chat completion fetch failed, retrying',
      'requestId=req-1',
      'error=429 Too Many Requests',
      'attempt=1',
      'delay=2000ms',
    );
    // Security: no secrets may appear in any logged argument.
    const allArgs = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
    expect(allArgs).not.toMatch(/Bearer|Authorization|sk-/);
  });

  it('honours an HTTP-date Retry-After header on a 429', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    fetchMock
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': 'Thu, 01 Jan 2026 00:00:02 GMT' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const promise = retryableFetch(options());
    await vi.advanceTimersByTimeAsync(2_000); // computed remaining seconds
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps a Retry-After value that exceeds the cap', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '120' },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const promise = retryableFetch(options({ logger }));
    await vi.advanceTimersByTimeAsync(60_000); // capped Retry-After (120s → 60s)
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'Chat completion fetch failed, retrying',
      'requestId=req-1',
      'error=429 Too Many Requests',
      'attempt=1',
      'delay=60000ms',
    );
  });

  it('falls back to exponential backoff when a 429 has no Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const promise = retryableFetch(options({ logger }));
    await vi.advanceTimersByTimeAsync(1_000); // backoff (Math.random→0 → 500ms)
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'Chat completion fetch failed, retrying',
      'requestId=req-1',
      'error=429 Too Many Requests',
      'attempt=1',
      'delay=500ms',
    );
  });

  it('does not schedule a Retry-After retry that would exceed the deadline', async () => {
    const shortDeadline: RetryPolicy = { ...DEFAULT_RETRY_POLICY, totalDeadlineMs: 1 };
    fetchMock.mockResolvedValueOnce(
      new Response('Too Many Requests', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '2' },
      }),
    );

    let caught: unknown;
    retryableFetch(options({ policy: shortDeadline })).catch((e) => {
      caught = e;
    });
    await vi.runAllTimersAsync();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('429 Too Many Requests');
    expect(fetchMock).toHaveBeenCalledTimes(1); // retry skipped due to deadline
  });

  it('exhausts retries on repeated 429 and re-throws the last status error', async () => {
    fetchMock.mockResolvedValue(
      new Response('Too Many Requests', {
        status: 429,
        statusText: 'Too Many Requests',
      }),
    );

    let caught: unknown;
    retryableFetch(options()).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
    await vi.runAllTimersAsync();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('429 Too Many Requests');
    expect(fetchMock).toHaveBeenCalledTimes(3); // maxRetries(2) + 1
  });

  it('retries on a 408 response then succeeds on the second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Request Timeout', {
          status: 408,
          statusText: 'Request Timeout',
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const promise = retryableFetch(options());
    await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff when a 408 has no Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Request Timeout', {
          status: 408,
          statusText: 'Request Timeout',
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const logger = createMockLogger();

    const promise = retryableFetch(options({ logger }));
    await vi.advanceTimersByTimeAsync(1_000); // backoff (Math.random→0 → 500ms)
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'Chat completion fetch failed, retrying',
      'requestId=req-1',
      'error=408 Request Timeout',
      'attempt=1',
      'delay=500ms',
    );
  });

  it('exhausts retries on repeated 408 and re-throws the last status error', async () => {
    fetchMock.mockResolvedValue(
      new Response('Request Timeout', {
        status: 408,
        statusText: 'Request Timeout',
      }),
    );

    let caught: unknown;
    retryableFetch(options()).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
    await vi.runAllTimersAsync();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('408 Request Timeout');
    expect(fetchMock).toHaveBeenCalledTimes(3); // maxRetries(2) + 1
  });

  it('retries on a 400 response then succeeds on the second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('Bad Request', {
          status: 400,
          statusText: 'Bad Request',
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const promise = retryableFetch(options());
    await vi.advanceTimersByTimeAsync(60_000); // flush the single backoff sleep
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries on repeated 400 and re-throws the last status error', async () => {
    fetchMock.mockResolvedValue(
      new Response('Bad Request', {
        status: 400,
        statusText: 'Bad Request',
      }),
    );

    let caught: unknown;
    retryableFetch(options()).catch((e) => {
      caught = e;
    });
    await vi.advanceTimersByTimeAsync(60_000); // flush both backoff sleeps
    await vi.runAllTimersAsync();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('400 Bad Request');
    expect(fetchMock).toHaveBeenCalledTimes(3); // maxRetries(2) + 1
  });
});
