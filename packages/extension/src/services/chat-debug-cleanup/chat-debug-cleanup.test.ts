import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { SessionMappingRepository } from '../../repositories/session-mapping-repository.js';
import { ChatDebugSettingsService } from '../chat-debug-settings/chat-debug-settings.js';
import { SettingsRepository } from '../../repositories/settings-repository.js';
import { ChatDebugCleanupService } from './chat-debug-cleanup.js';
import type { Database } from '../../db/connection.js';
import type { DatabaseSync } from 'node:sqlite';

// Mock vscode for the Disposable class used by
// startPeriodicCleanup. This unit test runs outside the
// extension host.
vi.mock('vscode', () => {
  class MockDisposable {
    private fns: Array<{ dispose: () => void }> = [];
    static from(fn: { dispose: () => void }): MockDisposable {
      const d = new MockDisposable();
      d.fns = [fn];
      return d;
    }
    dispose(): void {
      for (const fn of this.fns) {
        fn.dispose();
      }
      this.fns = [];
    }
  }
  return { Disposable: MockDisposable };
});

describe('ChatDebugCleanupService', () => {
  let db: Database;
  let raw: DatabaseSync;
  let logsBasePath: string;
  let settingsService: ChatDebugSettingsService;
  let mappingRepo: SessionMappingRepository;
  let service: ChatDebugCleanupService;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    const settingsRepo = new SettingsRepository(db);
    settingsService = new ChatDebugSettingsService(settingsRepo);
    mappingRepo = new SessionMappingRepository(db);
    logsBasePath = mkdtempSync(join(tmpdir(), 'chat-debug-cleanup-test-'));
    service = new ChatDebugCleanupService(logsBasePath, settingsService, mappingRepo);
  });

  afterEach(() => {
    clearTestDb(raw);
    raw.close();
    try {
      rmSync(logsBasePath, { recursive: true });
    } catch {
      // Ignore cleanup failures.
    }
  });

  /**
   * Helper: creates a session directory with a log file set
   * to a specific age relative to now.
   *
   * @returns The session directory path.
   */
  function createSessionDir(workspaceId: string, sessionId: string, fileAgeHours: number): string {
    const dir = join(logsBasePath, workspaceId, sessionId);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, '20260520-100000-000-test.md');
    writeFileSync(filePath, '# Test log');
    // Set mtime to the specified age in the past.
    const mtimeSec = (Date.now() - fileAgeHours * 60 * 60 * 1000) / 1000;
    utimesSync(filePath, mtimeSec, mtimeSec);
    return dir;
  }

  /**
   * Helper: creates a session mapping in the DB.
   */
  function createMapping(sessionId: string, workspaceId: string): void {
    mappingRepo.insertToolCallMapping({
      toolCallId: `tc-${sessionId}`,
      sessionId,
      workspaceId,
      modelName: 'gpt-4o',
      createdAt: new Date().toISOString(),
    });
  }

  describe('runCleanup', () => {
    it('deletes sessions older than TTL', () => {
      settingsService.updateSettings({ ttlHours: 2 });
      const dir = createSessionDir('ws-1', 'old-session', 3);
      createMapping('old-session', 'ws-1');

      expect(() => statSync(dir)).not.toThrow();

      service.runCleanup();

      expect(() => statSync(dir)).toThrow(/ENOENT/);
      expect(mappingRepo.getDistinctSessionIds()).toEqual([]);
    });

    it('preserves sessions with files newer than TTL', () => {
      settingsService.updateSettings({ ttlHours: 2 });
      const dir = createSessionDir('ws-1', 'recent-session', 1);
      createMapping('recent-session', 'ws-1');

      service.runCleanup();

      expect(() => statSync(dir)).not.toThrow();
      expect(mappingRepo.getDistinctSessionIds()).toEqual(['recent-session']);
    });

    it('preserves session when one file is newer than TTL but others are older', () => {
      settingsService.updateSettings({ ttlHours: 2 });
      const dir = join(logsBasePath, 'ws-1', 'mixed-session');
      mkdirSync(dir, { recursive: true });

      // Old file (3 hours ago).
      const oldPath = join(dir, 'old.md');
      writeFileSync(oldPath, '# Old');
      const oldMtime = (Date.now() - 3 * 60 * 60 * 1000) / 1000;
      utimesSync(oldPath, oldMtime, oldMtime);

      // New file (1 hour ago).
      const newPath = join(dir, 'new.md');
      writeFileSync(newPath, '# New');
      const newMtime = (Date.now() - 1 * 60 * 60 * 1000) / 1000;
      utimesSync(newPath, newMtime, newMtime);

      createMapping('mixed-session', 'ws-1');

      service.runCleanup();

      expect(() => statSync(dir)).not.toThrow();
      expect(mappingRepo.getDistinctSessionIds()).toEqual(['mixed-session']);
    });

    it('removes orphaned DB mappings when session directory is missing', () => {
      settingsService.updateSettings({ ttlHours: 2 });
      createMapping('orphan-session', 'ws-1');
      // Directory intentionally not created.

      expect(mappingRepo.getDistinctSessionIds()).toContain('orphan-session');

      service.runCleanup();

      expect(mappingRepo.getDistinctSessionIds()).toEqual([]);
    });

    it('is a no-op when logsBasePath does not exist', () => {
      settingsService.updateSettings({ ttlHours: 2 });
      rmSync(logsBasePath, { recursive: true });

      expect(() => service.runCleanup()).not.toThrow();
    });

    it('is a no-op when no log directories exist', () => {
      settingsService.updateSettings({ ttlHours: 2 });
      // logsBasePath exists but is empty.

      expect(() => service.runCleanup()).not.toThrow();
    });

    it('deletes mappings for expired sessions from multiple workspaces', () => {
      settingsService.updateSettings({ ttlHours: 1 });
      createSessionDir('ws-1', 'expired-1', 2);
      createSessionDir('ws-2', 'expired-2', 3);
      createMapping('expired-1', 'ws-1');
      createMapping('expired-2', 'ws-2');

      service.runCleanup();

      const dir1 = join(logsBasePath, 'ws-1', 'expired-1');
      const dir2 = join(logsBasePath, 'ws-2', 'expired-2');
      expect(() => statSync(dir1)).toThrow(/ENOENT/);
      expect(() => statSync(dir2)).toThrow(/ENOENT/);
      expect(mappingRepo.getDistinctSessionIds()).toEqual([]);
    });
  });

  describe('startPeriodicCleanup', () => {
    it('returns a Disposable with a dispose method', () => {
      const disposable = service.startPeriodicCleanup();
      expect(disposable).toBeDefined();
      expect(typeof disposable.dispose).toBe('function');
    });

    it('calls runCleanup immediately on start', () => {
      settingsService.updateSettings({ ttlHours: 2 });
      createSessionDir('ws-1', 'old-on-start', 3);
      createMapping('old-on-start', 'ws-1');

      const dir = join(logsBasePath, 'ws-1', 'old-on-start');
      expect(() => statSync(dir)).not.toThrow();

      const disposable = service.startPeriodicCleanup();
      disposable.dispose();

      expect(() => statSync(dir)).toThrow(/ENOENT/);
      expect(mappingRepo.getDistinctSessionIds()).toEqual([]);
    });

    it('calling dispose stops the interval', () => {
      vi.useFakeTimers();

      const disposable = service.startPeriodicCleanup();
      disposable.dispose();

      // Advance past several intervals — nothing should
      // happen after disposal.
      expect(() =>
        vi.advanceTimersByTime(ChatDebugCleanupService.CLEANUP_INTERVAL_MS),
      ).not.toThrow();

      vi.useRealTimers();
    });

    it('runs cleanup periodically on interval', () => {
      vi.useFakeTimers();

      settingsService.updateSettings({ ttlHours: 1 });
      const dir = createSessionDir('ws-1', 'periodic-sess', 0.1); // fresh now.

      const disposable = service.startPeriodicCleanup();

      // Age the file to 2 hours old after initial cleanup
      // has run.
      const filePath = join(dir, '20260520-100000-000-test.md');
      utimesSync(
        filePath,
        (Date.now() - 2 * 60 * 60 * 1000) / 1000,
        (Date.now() - 2 * 60 * 60 * 1000) / 1000,
      );

      createMapping('periodic-sess', 'ws-1');

      // Advance to trigger the next interval run.
      vi.advanceTimersByTime(ChatDebugCleanupService.CLEANUP_INTERVAL_MS);

      expect(() => statSync(dir)).toThrow(/ENOENT/);
      expect(mappingRepo.getDistinctSessionIds()).toEqual([]);

      disposable.dispose();
      vi.useRealTimers();
    });
  });

  describe('clearAll', () => {
    it('deletes all log files and session mappings', () => {
      const ws1Session1 = createSessionDir('ws-1', 'session-1', 1);
      const ws1Session2 = createSessionDir('ws-1', 'session-2', 2);
      const ws2Session1 = createSessionDir('ws-2', 'session-3', 1);

      createMapping('session-1', 'ws-1');
      createMapping('session-2', 'ws-1');
      createMapping('session-3', 'ws-2');

      expect(() => statSync(ws1Session1)).not.toThrow();
      expect(mappingRepo.getDistinctSessionIds()).toHaveLength(3);

      service.clearAll();

      expect(() => statSync(ws1Session1)).toThrow();
      expect(() => statSync(ws1Session2)).toThrow();
      expect(() => statSync(ws2Session1)).toThrow();
      expect(mappingRepo.getDistinctSessionIds()).toHaveLength(0);
    });

    it('handles empty logs directory', () => {
      expect(() => service.clearAll()).not.toThrow();
      expect(mappingRepo.getDistinctSessionIds()).toHaveLength(0);
    });

    it('invokes refresh callback after clear', () => {
      const refreshSpy = vi.fn();
      const svc = new ChatDebugCleanupService(
        logsBasePath,
        settingsService,
        mappingRepo,
        refreshSpy,
      );

      svc.clearAll();

      expect(refreshSpy).toHaveBeenCalledOnce();
    });

    it('does not throw when refresh callback is not provided', () => {
      expect(() => service.clearAll()).not.toThrow();
    });
  });

  describe('runCleanup refresh', () => {
    it('invokes refresh callback when sessions are cleaned', () => {
      const refreshSpy = vi.fn();
      const svc = new ChatDebugCleanupService(
        logsBasePath,
        settingsService,
        mappingRepo,
        refreshSpy,
      );

      settingsService.updateSettings({ ttlHours: 1 });
      createSessionDir('ws-1', 'old-sess', 2);
      createMapping('old-sess', 'ws-1');

      svc.runCleanup();

      expect(refreshSpy).toHaveBeenCalledOnce();
    });

    it('invokes refresh callback even when no sessions expired', () => {
      const refreshSpy = vi.fn();
      const svc = new ChatDebugCleanupService(
        logsBasePath,
        settingsService,
        mappingRepo,
        refreshSpy,
      );

      settingsService.updateSettings({ ttlHours: 24 });
      svc.runCleanup();

      expect(refreshSpy).toHaveBeenCalledOnce();
    });
  });
});
