/**
 * Parses a `Retry-After` response header (delta-seconds or
 * HTTP-date, per RFC 7231 §7.1.3) into a delay in milliseconds,
 * capped at the supplied cap. Returns `null` when the header is
 * absent or cannot be parsed, so the caller can fall back to an
 * exponential backoff delay.
 */

/**
 * Parses a `Retry-After` header into a capped delay in ms.
 *
 * - Delta-seconds form (e.g. `"2"`): seconds × 1000.
 * - HTTP-date form (e.g. `"Thu, 01 Jan 2026 00:00:02 GMT"`):
 *   remaining milliseconds until that date (clamped at `0` for
 *   past dates).
 *
 * The result is capped at `capMs`. Absent (`null`), empty, or
 * unparseable values return `null`.
 *
 * @param header - Raw header value, or `null` when absent.
 * @param capMs - Maximum delay to return (ms).
 * @returns Delay in ms in `[0, capMs]`, or `null` when the header
 *   is absent or unparseable.
 */
export function parseRetryAfter(header: string | null, capMs: number): number | null {
  if (header === null) {
    return null;
  }
  const trimmed = header.trim();
  if (trimmed === '') {
    return null;
  }

  let delayMs: number;
  // Delta-seconds form: a non-negative integer.
  if (/^\d+$/.test(trimmed)) {
    delayMs = Number(trimmed) * 1000;
  } else {
    // HTTP-date form (RFC 7231 §7.1.3). Date.parse returns NaN for
    // anything it cannot interpret as a date (including bare
    // integers, which are handled by the branch above).
    const target = Date.parse(trimmed);
    if (Number.isNaN(target)) {
      return null;
    }
    delayMs = target - Date.now();
  }

  if (delayMs < 0) {
    delayMs = 0;
  }
  return Math.min(delayMs, capMs);
}
