import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseRetryAfter } from './retry-after-parser.js';

describe('parseRetryAfter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('delta-seconds form', () => {
    it('converts an integer number of seconds to milliseconds', () => {
      expect(parseRetryAfter('2', 60_000)).toBe(2000);
    });

    it('returns the cap when the value exceeds it', () => {
      expect(parseRetryAfter('120', 60_000)).toBe(60_000);
    });

    it('returns the cap exactly when the value equals it', () => {
      expect(parseRetryAfter('60', 60_000)).toBe(60_000);
    });

    it('treats zero as an immediate retry', () => {
      expect(parseRetryAfter('0', 60_000)).toBe(0);
    });
  });

  describe('HTTP-date form', () => {
    it('computes the remaining milliseconds until the date', () => {
      expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:02 GMT', 60_000)).toBe(2000);
    });

    it('clamps a past date to zero (retry immediately)', () => {
      expect(parseRetryAfter('Thu, 31 Dec 2025 23:59:58 GMT', 60_000)).toBe(0);
    });

    it('caps a future date beyond the cap', () => {
      expect(parseRetryAfter('Thu, 01 Jan 2026 00:02:00 GMT', 60_000)).toBe(60_000);
    });
  });

  describe('absent or unparseable', () => {
    it('returns null when the header is null', () => {
      expect(parseRetryAfter(null, 60_000)).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseRetryAfter('', 60_000)).toBeNull();
    });

    it('returns null for a whitespace-only string', () => {
      expect(parseRetryAfter('   ', 60_000)).toBeNull();
    });

    it('returns null for a malformed value', () => {
      expect(parseRetryAfter('not-a-date', 60_000)).toBeNull();
    });
  });
});
