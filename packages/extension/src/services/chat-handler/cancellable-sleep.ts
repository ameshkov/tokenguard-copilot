/**
 * Sleeps for a delay, resolving on completion or rejecting
 * with a `Sleep aborted` error when the cancellation signal
 * fires. The signal is monitored throughout so cancellation
 * takes effect immediately, even mid-sleep.
 *
 * @param delayMs - Sleep duration in milliseconds.
 * @param signal - Abort signal; aborting it rejects the
 *   promise with `Sleep aborted`.
 * @throws Error `'Sleep aborted'` when the signal is already
 *   aborted or fires during the sleep.
 */
export function cancellableSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    if (signal.aborted) {
      reject(new Error('Sleep aborted'));
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Sleep aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
