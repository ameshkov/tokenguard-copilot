import { describe, it, expect } from 'vitest';
import { DEFAULT_RETRY_POLICY } from './retry-policy.js';

describe('DEFAULT_RETRY_POLICY', () => {
  it('allows 2 retries beyond the initial request', () => {
    expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(2);
  });

  it('bounds all attempts and sleeps to a 60s deadline', () => {
    expect(DEFAULT_RETRY_POLICY.totalDeadlineMs).toBe(60_000);
  });

  it('uses a 1s backoff base', () => {
    expect(DEFAULT_RETRY_POLICY.backoffBaseMs).toBe(1_000);
  });

  it('uses a 2x exponential multiplier', () => {
    expect(DEFAULT_RETRY_POLICY.backoffMultiplier).toBe(2);
  });

  it('caps Retry-After waits at 60s', () => {
    expect(DEFAULT_RETRY_POLICY.retryAfterCapMs).toBe(60_000);
  });
});
