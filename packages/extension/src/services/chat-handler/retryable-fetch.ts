/**
 * Executes an HTTP request with retry semantics.
 *
 * On each attempt the module decides whether the outcome is
 * retryable (a thrown network error or a retryable HTTP status
 * such as `429`/5xx), computes a wait delay (honouring a
 * `Retry-After` header when present, otherwise exponential
 * backoff with jitter),
 * enforces `maxRetries` and the total deadline, honours
 * cancellation throughout, and logs each retry. It returns
 * the final `Response` for successes and non-retryable
 * statuses, and re-throws the last error when retries are
 * exhausted.
 *
 * Retry decisions are made at the fetch/response layer,
 * before the response body is read — once a `200` is returned
 * to the caller and body reading begins, this module is no
 * longer involved (the streaming invariant).
 */
import type { RetryPolicy } from './retry-policy.js';
import { computeBackoffDelay } from './backoff-calculator.js';
import { cancellableSleep } from './cancellable-sleep.js';
import { isRetryableError, isRetryableStatus } from './retryable-status-classifier.js';
import { parseRetryAfter } from './retry-after-parser.js';
import { summarizeError } from '../../utils/index.js';
import type { Logger } from '../../logger/index.js';

/** Options for {@link retryableFetch}. */
export interface RetryableFetchOptions {
  /** Request URL. */
  readonly url: string;
  /** Fetch request init (must include an abort `signal`). */
  readonly init: RequestInit;
  /** Retry policy governing attempts, backoff and deadline. */
  readonly policy: RetryPolicy;
  /** Optional logger for retry diagnostics. */
  readonly logger?: Logger;
  /** Per-request correlation ID for log lines. */
  readonly requestId: string;
}

/**
 * Sends a request via `fetch`, retrying on transient network
 * failures according to the supplied policy.
 *
 * @param options - See {@link RetryableFetchOptions}.
 * @returns The successful or final non-retryable `Response`.
 * @throws The last network error when retries are exhausted,
 *   when a retry would exceed the deadline, or on cancellation.
 */
export async function retryableFetch({
  url,
  init,
  policy,
  logger,
  requestId,
}: RetryableFetchOptions): Promise<Response> {
  // A signal is always supplied by the chat handler; fall back
  // to a never-aborting signal so cancellation checks are safe.
  const signal: AbortSignal = init.signal ?? new AbortController().signal;
  const deadline = Date.now() + policy.totalDeadlineMs;

  for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt += 1) {
    // Pre-attempt cancellation.
    if (signal.aborted) {
      throw new Error('Aborted');
    }

    // `response` and `caughtError` are mutually exclusive: when
    // `fetch` resolves `response` is set; when it throws,
    // `caughtError` is set. The non-null assertions below rely on
    // this invariant.
    let response: Response | undefined;
    let caughtError: unknown;
    try {
      response = await fetch(url, init);
    } catch (e) {
      caughtError = e;
    }

    // Cancellation during fetch: propagate without retrying.
    if (caughtError !== undefined && signal.aborted) {
      throw caughtError;
    }

    // Single retryability decision via the classifier. Thrown
    // errors are retryable; transient 5xx statuses (500/502/
    // 503/504) are retryable; all other statuses are not. The
    // successful response body is never read here.
    const retryable =
      caughtError !== undefined
        ? isRetryableError(caughtError)
        : !response!.ok && isRetryableStatus(response!.status);
    const reason =
      caughtError !== undefined
        ? caughtError instanceof Error
          ? caughtError.message
          : String(caughtError)
        : `${response!.status} ${response!.statusText}`;
    // Full diagnostic summary for thrown errors — captures the
    // cause chain and system-error fields (`code`, `syscall`,
    // `hostname`, …) that `.message` alone drops. HTTP status
    // failures carry no error object (the body is intentionally
    // not read here — streaming invariant), so they have no
    // `detail`.
    const detail = caughtError !== undefined ? summarizeError(caughtError) : undefined;

    // Non-retryable outcome: return the response, or surface the error.
    if (!retryable) {
      if (caughtError !== undefined) {
        throw caughtError;
      }
      logger?.debug(
        'Chat completion fetch response',
        `requestId=${requestId}`,
        `status=${response!.status}`,
        `attempt=${attempt}`,
      );
      return response!;
    }

    // Retryable status: the error response body is no longer
    // needed. Cancel it so the underlying socket is returned to
    // the keep-alive pool before the next attempt (or before
    // re-throwing on exhaustion / deadline). Thrown network
    // errors have no Response to release.
    if (response !== undefined) {
      await response.body?.cancel().catch(() => {});
    }

    // Retryable: enforce the attempt budget, then the deadline.
    const lastError = caughtError !== undefined ? caughtError : new Error(reason);
    if (attempt >= policy.maxRetries + 1) {
      logger?.error(
        'Chat completion fetch failed, retries exhausted',
        `requestId=${requestId}`,
        `error=${reason}`,
        ...(detail ? [`detail=${detail}`] : []),
        `attempts=${attempt}`,
      );
      throw lastError;
    }
    // `Retry-After` (when present on a retryable response) takes
    // precedence over the computed exponential backoff for this
    // attempt; otherwise the exponential backoff delay is used.
    // Thrown network errors carry no response and so fall back to
    // backoff. `headers` is optional-chained because test Response
    // mocks may omit it; a real `Response` always exposes `headers`.
    const retryAfterHeader =
      response !== undefined ? response.headers?.get('retry-after') : undefined;
    const delay =
      parseRetryAfter(retryAfterHeader ?? null, policy.retryAfterCapMs) ??
      computeBackoffDelay(attempt, policy.backoffBaseMs, policy.backoffMultiplier);
    if (Date.now() + delay > deadline) {
      logger?.error(
        'Chat completion fetch failed, retry would exceed deadline',
        `requestId=${requestId}`,
        `error=${reason}`,
        ...(detail ? [`detail=${detail}`] : []),
        `delay=${delay}ms`,
      );
      throw lastError;
    }

    logger?.warn(
      'Chat completion fetch failed, retrying',
      `requestId=${requestId}`,
      `error=${reason}`,
      ...(detail ? [`detail=${detail}`] : []),
      `attempt=${attempt}`,
      `delay=${delay}ms`,
    );

    // Cancellation during backoff: the sleep rejects and propagates.
    await cancellableSleep(delay, signal);
  }

  // Unreachable: each iteration returns, throws, or continues.
  throw new Error('retryableFetch: exhausted retries');
}
