/**
 * Pure functions that classify a fetch outcome as retryable.
 *
 * Thrown network errors are always retryable. For HTTP
 * responses, the transient set (`408`, `400`, `429`, `500`,
 * `502`, `503`, `504`) — timeouts, the stop-gap 400, rate
 * limiting, and briefly-unavailable upstreams — is retryable.
 * Every other status is non-retryable. Adding a status code to
 * `RETRYABLE_STATUSES` makes it retryable.
 */

/**
 * HTTP statuses treated as retryable: `408`, `400`, `429`, and
 * the transient 5xx range.
 *
 * TODO: `400` is classified as retryable as a temporary stop-gap for an
 * intermittent, not-yet-understood provider behaviour. Investigate the root
 * cause and remove `400` from this set once understood.
 */
const RETRYABLE_STATUSES: readonly number[] = [408, 400, 429, 500, 502, 503, 504];

/**
 * Decides whether an HTTP response status is retryable.
 *
 * @param status - HTTP status code.
 * @returns `true` when the status is in the retryable set.
 */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.includes(status);
}

/**
 * Decides whether a thrown error is retryable.
 *
 * Cancellation is screened earlier (via the abort signal), so
 * any error reaching here is treated as a transient network
 * failure.
 *
 * @param error - The thrown error.
 * @returns `true` when the error is a retryable network failure.
 */
export function isRetryableError(error: unknown): boolean {
  return Boolean(error);
}
