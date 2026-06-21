import { describe, it, expect, afterEach, vi } from 'vitest';
import { computeBackoffDelay } from './backoff-calculator.js';

describe('computeBackoffDelay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Stubs Math.random and preserves all other Math methods.
   * Math properties are non-enumerable, so neither spread nor
   * Object.assign copies them; we prototype-inherit instead.
   */
  function stubRandom(value: () => number): void {
    vi.stubGlobal(
      'Math',
      Object.create(Math, {
        random: { value, writable: true, configurable: true },
      }),
    );
  }

  it('returns the lower bound (raw/2) when jitter is zero', () => {
    stubRandom(() => 0);
    // attempt 1: raw = 1000 * 2^0 = 1000; half = 500; jitter 0 → 500
    expect(computeBackoffDelay(1, 1000, 2)).toBe(500);
  });

  it('applies equal jitter at the midpoint', () => {
    stubRandom(() => 0.5);
    // attempt 1: raw 1000, half 500 → 500 + 0.5*500 = 750
    expect(computeBackoffDelay(1, 1000, 2)).toBe(750);
  });

  it('grows exponentially across attempts', () => {
    stubRandom(() => 0.5);
    const first = computeBackoffDelay(1, 1000, 2); // 750
    const second = computeBackoffDelay(2, 1000, 2); // raw 2000, half 1000 → 1500
    expect(second).toBe(1500);
    expect(second).toBeGreaterThan(first);
  });

  it('always stays within [raw/2, raw) bounds for attempt 1', () => {
    for (let r = 0; r <= 1; r += 0.01) {
      stubRandom(() => r);
      const delay = computeBackoffDelay(1, 1000, 2);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThan(1000);
    }
  });

  it('varies between runs due to jitter', () => {
    vi.unstubAllGlobals();
    const values = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      values.add(computeBackoffDelay(1, 1000, 2));
    }
    expect(values.size).toBeGreaterThan(1);
  });
});
