import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { ReasoningCacheRepository } from '../../repositories/reasoning-cache-repository.js';
import { ReasoningCacheCleanupService } from './reasoning-cache-cleanup.js';

vi.mock('vscode', () => ({
  Disposable: {
    from: (obj: { dispose: () => void }) => obj,
  },
}));

describe('ReasoningCacheCleanupService', () => {
  const { db, raw } = createTestDb();
  let repo: ReasoningCacheRepository;
  let svc: ReasoningCacheCleanupService;

  beforeEach(() => {
    clearTestDb(raw);
    repo = new ReasoningCacheRepository(db);
    svc = new ReasoningCacheCleanupService(repo);
  });

  it('runCleanup deletes expired entries', () => {
    // Insert an old entry
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    raw.exec(
      `INSERT INTO reasoning_cache (fingerprint, assistant_index, reasoning_content, created_at)
       VALUES ('old_fp', 0, 'old', '${oldDate}')`,
    );

    // Insert a recent entry
    repo.cache('new_fp', 0, { reasoning_content: 'new' });

    svc.runCleanup();

    // Old should be gone
    expect(repo.get('old_fp', 0)).toBeNull();
    // New should remain
    expect(repo.get('new_fp', 0)).not.toBeNull();
    expect(repo.get('new_fp', 0)!.reasoning_content).toBe('new');
  });

  it('runCleanup keeps non-expired entries', () => {
    repo.cache('fp1', 0, { reasoning_content: 'recent' });
    repo.cache('fp2', 1, { reasoning: 'also recent' });

    svc.runCleanup();

    expect(repo.get('fp1', 0)).not.toBeNull();
    expect(repo.get('fp2', 1)).not.toBeNull();
  });

  it('startPeriodicCleanup returns a Disposable', () => {
    const disposable = svc.startPeriodicCleanup();
    expect(disposable).toHaveProperty('dispose');
    expect(typeof disposable.dispose).toBe('function');

    // Should be able to dispose without errors
    disposable.dispose();
  });

  it('startPeriodicCleanup runs immediate cleanup', () => {
    // Insert an old entry
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    raw.exec(
      `INSERT INTO reasoning_cache (fingerprint, assistant_index, reasoning_content, created_at)
       VALUES ('old_fp', 0, 'old', '${oldDate}')`,
    );

    const disposable = svc.startPeriodicCleanup();

    // Old should be cleaned up immediately
    expect(repo.get('old_fp', 0)).toBeNull();

    disposable.dispose();
  });
});
