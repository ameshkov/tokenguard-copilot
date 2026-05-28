import { vi } from 'vitest';
import type { Logger } from '../logger/index.js';

/**
 * Creates a mock {@link Logger} with all methods as
 * `vi.fn()` no-ops.
 *
 * Use in unit tests to suppress log output and optionally
 * assert that specific log calls were made.
 *
 * @returns A mock Logger instance.
 */
export function createMockLogger(): Logger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
