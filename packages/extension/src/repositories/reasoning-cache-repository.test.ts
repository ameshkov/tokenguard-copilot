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
    repo.cache('fp1', 'msg_fp1', {
      reasoning_content: 'thinking...',
      reasoning: 'alt reasoning',
      reasoning_details: [{ type: 'text', text: 'detail' }],
    });

    const fields = repo.get('fp1', 'msg_fp1');
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_content).toBe('thinking...');
    expect(fields!.reasoning).toBe('alt reasoning');
    expect(fields!.reasoning_details).toEqual([{ type: 'text', text: 'detail' }]);
  });

  it('returns null for unknown fingerprints', () => {
    const fields = repo.get('nonexistent', 'msg_fp');
    expect(fields).toBeNull();
  });

  it('returns null for known session fp but wrong message fp', () => {
    repo.cache('fp1', 'msg_fp1', {
      reasoning_content: 'content',
    });

    const fields = repo.get('fp1', 'msg_fp_other');
    expect(fields).toBeNull();
  });

  it('upserts on duplicate fingerprint pair', () => {
    repo.cache('fp1', 'msg_fp1', {
      reasoning_content: 'first value',
    });
    repo.cache('fp1', 'msg_fp1', {
      reasoning_content: 'updated value',
    });

    const fields = repo.get('fp1', 'msg_fp1');
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_content).toBe('updated value');
  });

  it('deleteExpired keeps recent entries', () => {
    repo.cache('fp1', 'msg_fp1', {
      reasoning_content: 'recent',
    });
    repo.deleteExpired();

    const fields = repo.get('fp1', 'msg_fp1');
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_content).toBe('recent');
  });

  it('deleteAll removes all entries', () => {
    repo.cache('fp1', 'msg_a', { reasoning_content: 'c1' });
    repo.cache('fp2', 'msg_b', { reasoning: 'c2' });
    repo.deleteAll();

    expect(repo.get('fp1', 'msg_a')).toBeNull();
    expect(repo.get('fp2', 'msg_b')).toBeNull();
  });

  it('handles all-null fields gracefully', () => {
    repo.cache('fp1', 'msg_fp1', {});

    const fields = repo.get('fp1', 'msg_fp1');
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
    repo.cache('fp1', 'msg_fp1', { reasoning_details: details });

    const fields = repo.get('fp1', 'msg_fp1');
    expect(fields).not.toBeNull();
    expect(fields!.reasoning_details).toEqual(details);
  });

  it('deleteExpired removes truly old entries', () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    raw.exec(
      `INSERT INTO reasoning_cache (fingerprint, message_fingerprint, reasoning_content, created_at)
       VALUES ('old_fp', 'old_msg', 'old content', '${oldDate}')`,
    );

    repo.cache('fp_new', 'msg_new', {
      reasoning_content: 'new content',
    });

    repo.deleteExpired();

    const oldFields = repo.get('old_fp', 'old_msg');
    expect(oldFields).toBeNull();

    const newFields = repo.get('fp_new', 'msg_new');
    expect(newFields).not.toBeNull();
    expect(newFields!.reasoning_content).toBe('new content');
  });

  it('same message fp with different session fps are separate', () => {
    repo.cache('session_a', 'msg_fp1', {
      reasoning_content: 'from session A',
    });
    repo.cache('session_b', 'msg_fp1', {
      reasoning_content: 'from session B',
    });

    const fieldsA = repo.get('session_a', 'msg_fp1');
    const fieldsB = repo.get('session_b', 'msg_fp1');
    expect(fieldsA!.reasoning_content).toBe('from session A');
    expect(fieldsB!.reasoning_content).toBe('from session B');
  });
});
