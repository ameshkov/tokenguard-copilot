import { Disposable } from 'vscode';
import type { ReasoningCacheRepository } from '../../repositories/reasoning-cache-repository.js';

/**
 * Periodic cleanup service for the reasoning cache table.
 *
 * Removes cache entries older than 24 hours to prevent
 * unbounded storage growth. Follows the same pattern as
 * {@link ChatDebugCleanupService}.
 *
 * Cleanup runs immediately on activation and every 30
 * minutes thereafter.
 */
export class ReasoningCacheCleanupService {
  /** Interval between cleanup passes in milliseconds. */
  static readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

  constructor(private readonly repo: ReasoningCacheRepository) {}

  /**
   * Executes a single cleanup pass, deleting all cache
   * entries that have expired.
   */
  runCleanup(): void {
    this.repo.deleteExpired();
  }

  /**
   * Starts periodic cleanup.
   *
   * Runs an immediate pass, then schedules subsequent
   * passes at the configured interval.
   *
   * @returns A `Disposable` that stops the periodic timer
   *   when disposed (push onto `context.subscriptions`).
   */
  startPeriodicCleanup(): Disposable {
    this.runCleanup();
    const intervalId = setInterval(
      () => this.runCleanup(),
      ReasoningCacheCleanupService.CLEANUP_INTERVAL_MS,
    );
    return Disposable.from({
      dispose: () => clearInterval(intervalId),
    });
  }
}
