import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { SessionMappingRepository } from './session-mapping-repository.js';
import type { Database } from '../db/index.js';
import type { DatabaseSync } from 'node:sqlite';

describe('SessionMappingRepository', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: SessionMappingRepository;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new SessionMappingRepository(db);
  });

  afterEach(() => {
    clearTestDb(raw);
    raw.close();
  });

  describe('insertFingerprintMapping', () => {
    it('inserts a fingerprint mapping', () => {
      const row = repo.insertFingerprintMapping({
        contentFingerprint: 'abc123',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-20T00:00:00Z',
      });
      expect(row.contentFingerprint).toBe('abc123');
      expect(row.sessionId).toBe('sess-1');
    });
  });

  describe('findByContentFingerprint', () => {
    it('returns mapping for known fingerprint', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-1',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      const result = repo.findByContentFingerprint('fp-1');
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('sess-1');
    });

    it('returns undefined for unknown fingerprint', () => {
      expect(repo.findByContentFingerprint('unknown')).toBeUndefined();
    });
  });

  describe('deleteAll', () => {
    it('removes all mappings', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-all-1',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-all-2',
        sessionId: 'sess-2',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.deleteAll();
      expect(repo.findByContentFingerprint('fp-all-1')).toBeUndefined();
      expect(repo.findByContentFingerprint('fp-all-2')).toBeUndefined();
    });
  });

  describe('getDistinctSessionIds', () => {
    it('returns empty array when no mappings exist', () => {
      const ids = repo.getDistinctSessionIds();
      expect(ids).toEqual([]);
    });

    it('returns all distinct session IDs', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-a',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-b',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-c',
        sessionId: 'sess-2',
        workspaceId: 'ws-2',
        modelName: 'gpt-4o',
        createdAt: now,
      });

      const ids = repo.getDistinctSessionIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('sess-1');
      expect(ids).toContain('sess-2');
    });
  });

  describe('bumpSession', () => {
    it('updates updatedAt for all rows of a session', () => {
      const old = '2026-05-20T00:00:00Z';
      const fresh = '2026-05-22T12:00:00Z';
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-bump-1',
        sessionId: 'sess-bump',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-bump-2',
        sessionId: 'sess-bump',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });

      repo.bumpSession('sess-bump', fresh);

      const row1 = repo.findByContentFingerprint('fp-bump-1');
      const row2 = repo.findByContentFingerprint('fp-bump-2');
      expect(row1!.updatedAt).toBe(fresh);
      expect(row2!.updatedAt).toBe(fresh);
    });

    it('does not affect other sessions', () => {
      const old = '2026-05-20T00:00:00Z';
      const fresh = '2026-05-22T12:00:00Z';
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-other',
        sessionId: 'sess-other',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-target',
        sessionId: 'sess-target',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });

      repo.bumpSession('sess-target', fresh);

      const other = repo.findByContentFingerprint('fp-other');
      expect(other!.updatedAt).toBe(old);
    });
  });

  describe('deleteExpired', () => {
    it('deletes rows where updatedAt is before cutoff', () => {
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-old',
        sessionId: 'sess-old',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-20T00:00:00Z',
      });
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-new',
        sessionId: 'sess-new',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-22T12:00:00Z',
      });

      const deleted = repo.deleteExpired('2026-05-21T00:00:00Z');

      expect(deleted).toBe(1);
      expect(repo.findByContentFingerprint('fp-old')).toBeUndefined();
      expect(repo.findByContentFingerprint('fp-new')).toBeDefined();
    });

    it('deletes nothing when all rows are fresh', () => {
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-fresh',
        sessionId: 'sess-fresh',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-22T12:00:00Z',
      });

      const deleted = repo.deleteExpired('2026-05-21T00:00:00Z');

      expect(deleted).toBe(0);
      expect(repo.findByContentFingerprint('fp-fresh')).toBeDefined();
    });

    it('uses bumped updatedAt instead of createdAt', () => {
      repo.insertFingerprintMapping({
        contentFingerprint: 'fp-bumped',
        sessionId: 'sess-bumped',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-20T00:00:00Z',
      });

      // Bump to recent time
      repo.bumpSession('sess-bumped', '2026-05-22T12:00:00Z');

      // Cutoff would delete based on createdAt, but should
      // use updatedAt which is now recent
      const deleted = repo.deleteExpired('2026-05-21T00:00:00Z');

      expect(deleted).toBe(0);
      expect(repo.findByContentFingerprint('fp-bumped')).toBeDefined();
    });
  });
});
