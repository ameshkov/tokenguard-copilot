import { readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Disposable } from 'vscode';
import type { ChatDebugSettingsService } from '../chat-debug-settings/chat-debug-settings.js';
import type { SessionMappingRepository } from '../../repositories/session-mapping-repository.js';

/**
 * Deletes expired log session directories and orphaned
 * database session mappings on a periodic schedule.
 *
 * Sessions are deleted as a unit based on the most recent
 * file's mtime in the session directory. If the newest file
 * is older than the configured TTL, the entire directory and
 * its DB mappings are removed.
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
   * @param onTreeRefresh - Optional callback invoked after
   *   cleanup or clear operations to refresh the tree view.
   */
  constructor(
    private readonly logsBasePath: string,
    private readonly settingsService: ChatDebugSettingsService,
    private readonly mappingRepo: SessionMappingRepository,
    private readonly onTreeRefresh?: () => void,
  ) {}

  /**
   * Run a single cleanup pass.
   *
   * Scans session directories, deletes expired ones along
   * with their DB mappings, then removes orphaned DB
   * mappings for sessions whose directories no longer exist.
   */
  runCleanup(): void {
    if (!existsSync(this.logsBasePath)) return;

    const ttlHours = this.settingsService.getSettings().ttlHours;
    const cutoffMs = Date.now() - ttlHours * 60 * 60 * 1000;

    const deletedSessionIds: string[] = [];

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
            deletedSessionIds.push(sessionDirName);
          } catch {
            // Failed to delete — skip, will retry on next
            // cleanup cycle.
          }

          // Clean up empty workspace directory.
          try {
            this.removeEmptyWorkspaceDir(workspacePath);
          } catch {
            // Best-effort cleanup.
          }
        }
      }
    }

    // Delete DB mappings for expired sessions.
    if (deletedSessionIds.length > 0) {
      this.mappingRepo.deleteBySessionIds(deletedSessionIds);
    }

    // Clean up orphaned mappings.
    this.cleanOrphanedMappings();

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
      } catch {
        // Best-effort.
      }
    }
  }

  /**
   * Remove DB mappings for sessions whose directories no
   * longer exist on disk.
   */
  private cleanOrphanedMappings(): void {
    const sessionIds = this.mappingRepo.getDistinctSessionIds();
    if (sessionIds.length === 0) return;

    const orphanedIds: string[] = [];

    // Scan workspace dirs once for existence checks.
    let workspaceDirs: string[];
    try {
      workspaceDirs = readdirSync(this.logsBasePath, {
        withFileTypes: true,
      })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return; // Can't scan, skip orphan cleanup.
    }

    for (const sessionId of sessionIds) {
      let found = false;
      for (const workspaceDir of workspaceDirs) {
        const sessionPath = join(this.logsBasePath, workspaceDir, sessionId);
        if (existsSync(sessionPath)) {
          found = true;
          break;
        }
      }
      if (!found) {
        orphanedIds.push(sessionId);
      }
    }

    if (orphanedIds.length > 0) {
      this.mappingRepo.deleteBySessionIds(orphanedIds);
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
      } catch {
        // Best-effort deletion.
      }
    }

    // Delete all session mappings.
    this.mappingRepo.deleteAll();

    // Refresh tree view.
    this.onTreeRefresh?.();
  }
}
