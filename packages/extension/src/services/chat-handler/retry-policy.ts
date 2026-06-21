/**
 * Immutable retry timing parameters consumed by the
 * retryable-fetch module to govern each chat completion
 * request. Fixed by PRD defaults — no configuration
 * surface is exposed.
 */
export interface RetryPolicy {
  /** Maximum retry attempts beyond the initial request. */
  readonly maxRetries: number;
  /** Overall time budget (ms) across all attempts and sleeps. */
  readonly totalDeadlineMs: number;
  /** Base delay (ms) for the first exponential backoff. */
  readonly backoffBaseMs: number;
  /** Exponential growth factor applied between retries. */
  readonly backoffMultiplier: number;
  /** Maximum sleep (ms) applied for a `Retry-After` value. */
  readonly retryAfterCapMs: number;
}

/**
 * Fixed retry defaults (PRD "Retry Policy" entity).
 *
 * `maxRetries` 2, `totalDeadlineMs` 60000,
 * `backoffBaseMs` 1000, `backoffMultiplier` 2,
 * `retryAfterCapMs` 60000.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  totalDeadlineMs: 60_000,
  backoffBaseMs: 1_000,
  backoffMultiplier: 2,
  retryAfterCapMs: 60_000,
};
