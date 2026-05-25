import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { ReasoningCacheRepository } from './reasoning-cache-repository.js';

describe('ReasoningCacheRepository', () => {
  const { db, raw } = createTestDb();
  let repo: ReasoningCacheRepository;

  beforeEach(() => {
    clearTestDb(raw);
    repo = new ReasoningCacheRepository(db);
  });

  it('stores and retrieves reasoning fields', () => {
    repo.cache('fp1', 0, {
      reasoning_content: 'thinking...',
      reasoning: 'alt reasoning',
      reasoning_details: [{ type: 'text', text: 'detail' }],
    });

    const fields = repo.get('fp1', 0);
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_content).toBe('thinking...');
    expect(fields!.reasoning).toBe('alt reasoning');
    expect(fields!.reasoning_details).toEqual([{ type: 'text', text: 'detail' }]);
  });

  it('returns null for unknown fingerprint + index', () => {
    const fields = repo.get('nonexistent', 0);
    expect(fields).toBeNull();
  });

  it('returns null for known fingerprint but wrong index', () => {
    repo.cache('fp1', 0, { reasoning_content: 'content' });
    const fields = repo.get('fp1', 1);
    expect(fields).toBeNull();
  });

  it('upserts on duplicate fingerprint + index', () => {
    repo.cache('fp1', 0, { reasoning_content: 'first value' });
    repo.cache('fp1', 0, { reasoning_content: 'updated value' });

    const fields = repo.get('fp1', 0);
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_content).toBe('updated value');
  });

  it('deleteExpired keeps recent entries', () => {
    repo.cache('fp1', 0, { reasoning_content: 'recent' });
    repo.deleteExpired();

    const fields = repo.get('fp1', 0);
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_content).toBe('recent');
  });

  it('deleteAll removes all entries', () => {
    repo.cache('fp1', 0, { reasoning_content: 'c1' });
    repo.cache('fp2', 1, { reasoning: 'c2' });
    repo.deleteAll();

    expect(repo.get('fp1', 0)).toBeNull();
    expect(repo.get('fp2', 1)).toBeNull();
  });

  it('handles all-null fields gracefully', () => {
    repo.cache('fp1', 0, {});
    const fields = repo.get('fp1', 0);
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_content).toBeUndefined();
    expect(fields!.reasoning).toBeUndefined();
    expect(fields!.reasoning_details).toBeUndefined();
  });

  it('JSON round-trips reasoning_details', () => {
    const details = [
      { type: 'text', text: 'part one' },
      { type: 'summary', text: 'part two' },
    ];
    repo.cache('fp1', 0, { reasoning_details: details });

    const fields = repo.get('fp1', 0);
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_details).toEqual(details);
  });

  it('deleteExpired removes truly old entries', () => {
    // Use direct SQL to insert an old entry
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    raw.exec(
      `INSERT INTO reasoning_cache (fingerprint, assistant_index, reasoning_content, created_at)
       VALUES ('old_fp', 0, 'old content', '${oldDate}')`,
    );

    // Also insert a recent entry via the repo
    repo.cache('fp_new', 0, { reasoning_content: 'new content' });

    repo.deleteExpired();

    // Old entry should be gone
    const oldFields = repo.get('old_fp', 0);
    expect(oldFields).toBeNull();

    // New entry should remain
    const newFields = repo.get('fp_new', 0);
    expect(newFields).not.toBeNull();
    expect(newFields!.reasoning_content).toBe('new content');
  });
});
