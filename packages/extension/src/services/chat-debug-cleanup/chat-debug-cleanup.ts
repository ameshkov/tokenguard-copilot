import { readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Disposable } from 'vscode';
import type { ChatDebugSettingsService } from '../chat-debug-settings/index.js';
import type { SessionMappingRepository } from '../../repositories/index.js';
import type { Logger } from '../../logger/index.js';

/**
 * Deletes expired log session directories and stale
 * database session mappings on a periodic schedule.
 *
 * Database mappings and filesystem directories are managed
 * independently:
 * - Session mappings are deleted when their `updatedAt` is
 *   older than the configured TTL.
 * - Session directories are deleted when their most recent
 *   file's mtime is older than the configured TTL.
 */
export class ChatDebugCleanupService {
  /** 30 minutes in milliseconds. */
  static readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

  /**
   * Creates a new ChatDebugCleanupService.
   *
   * @param logsBasePath - Base directory for log files
   *   (e.g. `globalStorageUri/logs`).
   * @param settingsService - Service for reading the TTL.
   * @param mappingRepo - Repository for session mappings.
   * @param logger - Logger for runtime diagnostics.
   * @param onTreeRefresh - Optional callback invoked after
   *   cleanup or clear operations to refresh the tree view.
   */
  constructor(
    private readonly logsBasePath: string,
    private readonly settingsService: ChatDebugSettingsService,
    private readonly mappingRepo: SessionMappingRepository,
    private readonly logger: Logger,
    private readonly onTreeRefresh?: () => void,
  ) {}

  /**
   * Run a single cleanup pass.
   *
   * Two independent operations:
   * 1. Delete session mappings where `updatedAt` is older
   *    than the TTL.
   * 2. Delete session directories where the newest file mtime
   *    is older than the TTL.
   */
  runCleanup(): void {
    const ttlHours = this.settingsService.getSettings().ttlHours;
    const cutoffMs = Date.now() - ttlHours * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    this.logger.trace('Running chat debug cleanup', `ttl=${ttlHours}h`, `cutoff=${cutoffIso}`);

    // 1. Delete expired DB session mappings.
    this.mappingRepo.deleteExpired(cutoffIso);

    // 2. Delete expired session directories.
    this.deleteExpiredDirectories(cutoffMs);

    this.logger.debug('Chat debug cleanup completed');

    // Refresh tree view after cleanup.
    this.onTreeRefresh?.();
  }

  /**
   * Start periodic cleanup.
   *
   * Runs {@link runCleanup} immediately on call and then
   * every 30 minutes via `setInterval`.
   *
   * @returns A {@link Disposable} that clears the interval
   *   when disposed.
   */
  startPeriodicCleanup(): Disposable {
    this.runCleanup();

    const intervalId = setInterval(() => {
      this.runCleanup();
    }, ChatDebugCleanupService.CLEANUP_INTERVAL_MS);

    return Disposable.from({
      dispose: () => clearInterval(intervalId),
    });
  }

  /**
   * Check if a session directory is expired.
   *
   * A session is expired if the most recent file's mtime
   * in the directory is older than the cutoff.
   *
   * @param sessionPath - Path to the session directory.
   * @param cutoffMs - Cutoff time in milliseconds since
   *   epoch.
   * @returns `true` if the session should be deleted.
   */
  private isSessionExpired(sessionPath: string, cutoffMs: number): boolean {
    let files: string[];
    try {
      files = readdirSync(sessionPath);
    } catch {
      return false; // Can't read dir, treat as not expired.
    }

    if (files.length === 0) {
      // Empty session directory — treat as expired.
      return true;
    }

    let newestMtime = 0;
    for (const file of files) {
      try {
        const stat = statSync(join(sessionPath, file));
        if (stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
        }
      } catch {
        // File may have been removed — ignore.
      }
    }

    // If no files were stat-able, treat as expired.
    return newestMtime > 0 ? newestMtime < cutoffMs : true;
  }

  /**
   * Remove an empty workspace directory.
   *
   * @param workspacePath - Path to the workspace directory.
   */
  private removeEmptyWorkspaceDir(workspacePath: string): void {
    let entries: string[];
    try {
      entries = readdirSync(workspacePath);
    } catch {
      return;
    }
    if (entries.length === 0) {
      try {
        rmSync(workspacePath);
      } catch (error: unknown) {
        this.logger.warn(
          'Failed to remove empty workspace directory',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Delete session directories where the newest file is
   * older than the cutoff.
   *
   * @param cutoffMs - Cutoff time in milliseconds since
   *   epoch.
   */
  private deleteExpiredDirectories(cutoffMs: number): void {
    if (!existsSync(this.logsBasePath)) return;

    // Scan workspace directories.
    let workspaceDirs: string[];
    try {
      workspaceDirs = readdirSync(this.logsBasePath, {
        withFileTypes: true,
      })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return; // logsBasePath unreadable, nothing to do.
    }

    for (const workspaceDir of workspaceDirs) {
      const workspacePath = join(this.logsBasePath, workspaceDir);

      let sessionDirs: string[];
      try {
        sessionDirs = readdirSync(workspacePath, {
          withFileTypes: true,
        })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch {
        continue; // Can't read workspace dir, skip it.
      }

      for (const sessionDirName of sessionDirs) {
        const sessionPath = join(workspacePath, sessionDirName);
        const isExpired = this.isSessionExpired(sessionPath, cutoffMs);

        if (isExpired) {
          try {
            rmSync(sessionPath, { recursive: true });
          } catch (error: unknown) {
            this.logger.warn(
              'Failed to delete expired session directory',
              error instanceof Error ? error.message : String(error),
            );
          }

          // Clean up empty workspace directory.
          try {
            this.removeEmptyWorkspaceDir(workspacePath);
          } catch (error: unknown) {
            this.logger.warn(
              'Failed to clean up workspace directory',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }
    }
  }

  /**
   * Delete all log files and session mappings.
   *
   * Removes all workspace directories under logsBasePath
   * and deletes all session mappings from the database.
   * Invokes the refresh callback after completion.
   */
  clearAll(): void {
    // Delete all log files.
    if (existsSync(this.logsBasePath)) {
      try {
        rmSync(this.logsBasePath, { recursive: true });
      } catch (error: unknown) {
        this.logger.warn(
          'Failed to delete all log files',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // Delete all session mappings.
    this.mappingRepo.deleteAll();

    // Refresh tree view.
    this.onTreeRefresh?.();
  }
}
