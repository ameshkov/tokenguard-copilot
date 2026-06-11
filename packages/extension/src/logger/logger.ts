import { type LogOutputChannel, window } from 'vscode';

/**
 * Thin logging interface matching `LogOutputChannel`'s
 * five severity methods.
 *
 * Services depend on this interface instead of `vscode`
 * directly, enabling easy mocking in unit tests.
 */
export interface Logger {
  /**
   * Logs a trace-level message (most verbose).
   *
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  trace(message: string, ...args: unknown[]): void;

  /**
   * Logs a debug-level message.
   *
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  debug(message: string, ...args: unknown[]): void;

  /**
   * Logs an info-level message.
   *
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  info(message: string, ...args: unknown[]): void;

  /**
   * Logs a warning-level message.
   *
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  warn(message: string, ...args: unknown[]): void;

  /**
   * Logs an error-level message.
   *
   * @param message - The message to log.
   * @param args - Additional arguments to log.
   */
  error(message: string | Error, ...args: unknown[]): void;
}

/** Output channel name used for the extension logger. */
const CHANNEL_NAME = 'TokenGuard Copilot';

/**
 * Creates a {@link Logger} backed by a VS Code
 * `LogOutputChannel`.
 *
 * The returned channel is also a `Disposable` — push it
 * onto `context.subscriptions` so VS Code cleans it up on
 * deactivation.
 *
 * @returns An object with a `logger` (the {@link Logger}
 *   interface) and a `channel` (the underlying
 *   `LogOutputChannel` disposable).
 */
export function createLogger(): {
  logger: Logger;
  channel: LogOutputChannel;
} {
  const channel = window.createOutputChannel(CHANNEL_NAME, { log: true });

  return { logger: channel, channel };
}
