import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRetryableError, isRetryableStatus } from './retryable-status-classifier.js';

describe('isRetryableError', () => {
  it('classifies a thrown Error as retryable', () => {
    expect(isRetryableError(new Error('read ETIMEDOUT'))).toBe(true);
  });

  it('classifies a TypeError (fetch failed) as retryable', () => {
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
  });
});

describe('isRetryableStatus', () => {
  it.each([400, 408, 429, 500, 502, 503, 504])('classifies HTTP %i as retryable', (status) => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  it.each([200, 401, 403, 404])('classifies HTTP %i as non-retryable', (status) => {
    expect(isRetryableStatus(status)).toBe(false);
  });
});

it('marks the 400 stop-gap with a TODO root-cause comment', () => {
  const source = readFileSync(join(__dirname, 'retryable-status-classifier.ts'), 'utf8');
  // The 400 special case is isolated and easy to remove later.
  expect(source).toMatch(/TODO.*400.*stop-gap|TODO.*400.*root cause/s);
});
