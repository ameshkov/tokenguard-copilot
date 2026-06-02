/**
 * Maximum number of cause-chain levels to follow when summarizing
 * an error. Node's `fetch` wraps low-level network errors (DNS,
 * TCP, TLS) in a top-level `TypeError: fetch failed` whose
 * diagnostic info (e.g. `code: ENOTFOUND`, `hostname`,
 * `syscall`) lives on `cause`. Capping the walk avoids
 * pathological loops if a module intentionally chains an error
 * back to itself.
 */
const MAX_ERROR_CAUSE_DEPTH = 5;

/**
 * System error fields surfaced by Node's `net`/`dns`/`tls`
 * modules when `fetch` (or any other low-level call) fails.
 * These are the most useful pieces of context for diagnosing
 * network problems from a single log line.
 */
interface SystemErrorFields {
  /** POSIX error code, e.g. `ENOTFOUND`, `ECONNREFUSED`. */
  code?: string;
  /** Numeric errno value. */
  errno?: number;
  /** Failed syscall name, e.g. `getaddrinfo`, `connect`. */
  syscall?: string;
  /** Hostname the lookup/connection targeted. */
  hostname?: string;
  /** Destination IP address, when known. */
  address?: string;
  /** Destination port, when known. */
  port?: number;
}

/**
 * Returns a single-line, key=value summary of an error suitable
 * for structured logging. Walks the `cause` chain (Node's
 * standard way of attaching a low-level error to a higher-level
 * wrapper such as `fetch`'s `TypeError`) and appends the most
 * useful system-error fields when present.
 *
 * Security: this MUST NOT include credentials, request bodies,
 * or response bodies. Only error metadata (name, message, code,
 * syscall, hostname, etc.) is included.
 *
 * @param e - The thrown value to summarize.
 * @returns A compact, single-line summary. Never throws.
 */
export function summarizeError(e: unknown): string {
  const parts: string[] = [];
  let current: unknown = e;
  let depth = 0;

  while (current != null && depth < MAX_ERROR_CAUSE_DEPTH) {
    if (current instanceof Error) {
      if (current.name && current.name !== 'Error') {
        parts.push(`name=${current.name}`);
      }
      if (current.message) {
        parts.push(`message=${current.message}`);
      }
      const sys = current as Error & SystemErrorFields;
      if (sys.code) {
        parts.push(`code=${sys.code}`);
      }
      if (sys.syscall) {
        parts.push(`syscall=${sys.syscall}`);
      }
      if (sys.hostname) {
        parts.push(`hostname=${sys.hostname}`);
      }
      if (sys.address) {
        parts.push(`address=${sys.address}`);
      }
      if (typeof sys.port === 'number') {
        parts.push(`port=${sys.port}`);
      }
      current = current.cause;
    } else {
      parts.push(`value=${String(current)}`);
      break;
    }
    depth += 1;
  }

  return parts.length > 0 ? parts.join(' ') : `value=${String(e)}`;
}
