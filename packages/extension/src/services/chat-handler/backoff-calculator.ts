/**
 * Computes an exponential backoff delay with equal jitter.
 *
 * The raw delay is `baseMs * multiplier ^ (attempt - 1)`. Equal
 * jitter is then applied: half of the raw delay is guaranteed,
 * and the other half is randomised, yielding a value in
 * `[raw/2, raw)`. This preserves visible exponential growth
 * while avoiding thundering-herd retries.
 *
 * @param attempt - 1-based retry number (1 for the first retry
 *   after the initial failure).
 * @param baseMs - Base delay in milliseconds.
 * @param multiplier - Exponential growth factor.
 * @returns Delay in milliseconds, in `[raw/2, raw)`.
 */
export function computeBackoffDelay(attempt: number, baseMs: number, multiplier: number): number {
  const raw = baseMs * multiplier ** (attempt - 1);
  const half = raw / 2;
  return Math.floor(half + Math.random() * half);
}
