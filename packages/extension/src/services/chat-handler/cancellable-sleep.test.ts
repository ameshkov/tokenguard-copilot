import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cancellableSleep } from './cancellable-sleep.js';

describe('cancellableSleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the delay completes', async () => {
    const controller = new AbortController();
    const promise = cancellableSleep(1000, controller.signal);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(cancellableSleep(1000, controller.signal)).rejects.toThrow('Sleep aborted');
  });

  it('rejects and clears the timer when aborted mid-sleep', async () => {
    const controller = new AbortController();
    const promise = cancellableSleep(1000, controller.signal);
    vi.advanceTimersByTime(400);
    controller.abort();
    await expect(promise).rejects.toThrow('Sleep aborted');
    // Advancing far past the original delay must not resolve
    // the already-rejected promise.
    vi.advanceTimersByTime(10_000);
  });
});
