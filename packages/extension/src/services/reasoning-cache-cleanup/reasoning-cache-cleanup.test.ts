import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { ReasoningCacheRepository } from '../../repositories/index.js';
import { ReasoningCacheCleanupService } from './reasoning-cache-cleanup.js';
import { createMockLogger } from '../../test/mock-logger.js';

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
    svc = new ReasoningCacheCleanupService(repo, createMockLogger());
  });

  it('runCleanup deletes expired entries', () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    raw.exec(
      `INSERT INTO reasoning_cache (fingerprint, message_fingerprint, reasoning_content, created_at)
       VALUES ('old_fp', 'old_msg', 'old', '${oldDate}')`,
    );

    repo.cache('new_fp', 'new_msg', {
      reasoning_content: 'new',
    });

    svc.runCleanup();

    expect(repo.get('old_fp', 'old_msg')).toBeNull();
    expect(repo.get('new_fp', 'new_msg')).not.toBeNull();
    expect(repo.get('new_fp', 'new_msg')!.reasoning_content).toBe('new');
  });

  it('runCleanup keeps non-expired entries', () => {
    repo.cache('fp1', 'msg_a', {
      reasoning_content: 'recent',
    });
    repo.cache('fp2', 'msg_b', { reasoning: 'also recent' });

    svc.runCleanup();

    expect(repo.get('fp1', 'msg_a')).not.toBeNull();
    expect(repo.get('fp2', 'msg_b')).not.toBeNull();
  });

  it('startPeriodicCleanup returns a Disposable', () => {
    const disposable = svc.startPeriodicCleanup();
    expect(disposable).toHaveProperty('dispose');
    expect(typeof disposable.dispose).toBe('function');

    disposable.dispose();
  });

  it('startPeriodicCleanup runs immediate cleanup', () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    raw.exec(
      `INSERT INTO reasoning_cache (fingerprint, message_fingerprint, reasoning_content, created_at)
       VALUES ('old_fp', 'old_msg', 'old', '${oldDate}')`,
    );

    const disposable = svc.startPeriodicCleanup();

    expect(repo.get('old_fp', 'old_msg')).toBeNull();

    disposable.dispose();
  });
});
