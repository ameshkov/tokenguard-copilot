import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { SessionMappingRepository } from './session-mapping-repository.js';
import type { Database } from '../db/connection.js';
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

  describe('insertToolCallMapping', () => {
    it('inserts a tool call mapping', () => {
      const row = repo.insertToolCallMapping({
        toolCallId: 'tc-1',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-20T00:00:00Z',
      });
      expect(row.toolCallId).toBe('tc-1');
      expect(row.sessionId).toBe('sess-1');
    });

    it('rejects duplicate tool call IDs', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertToolCallMapping({
        toolCallId: 'tc-dup',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      expect(() =>
        repo.insertToolCallMapping({
          toolCallId: 'tc-dup',
          sessionId: 'sess-2',
          workspaceId: 'ws-1',
          modelName: 'gpt-4o',
          createdAt: now,
        }),
      ).toThrow();
    });
  });

  describe('insertChecksumMapping', () => {
    it('inserts a checksum mapping', () => {
      const row = repo.insertChecksumMapping({
        contentChecksum: 'abc123',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-20T00:00:00Z',
      });
      expect(row.contentChecksum).toBe('abc123');
      expect(row.sessionId).toBe('sess-1');
      expect(row.toolCallId).toBeNull();
    });
  });

  describe('findByToolCallId', () => {
    it('returns mapping for known tool call ID', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertToolCallMapping({
        toolCallId: 'tc-find',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      const result = repo.findByToolCallId('tc-find');
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('sess-1');
    });

    it('returns undefined for unknown tool call ID', () => {
      expect(repo.findByToolCallId('unknown')).toBeUndefined();
    });
  });

  describe('findByContentChecksum', () => {
    it('returns mapping for known checksum', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertChecksumMapping({
        contentChecksum: 'check-1',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      const result = repo.findByContentChecksum('check-1');
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('sess-1');
    });

    it('returns undefined for unknown checksum', () => {
      expect(repo.findByContentChecksum('unknown')).toBeUndefined();
    });
  });

  describe('deleteAll', () => {
    it('removes all mappings', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertToolCallMapping({
        toolCallId: 'tc-all-1',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.insertChecksumMapping({
        contentChecksum: 'check-all',
        sessionId: 'sess-2',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.deleteAll();
      expect(repo.findByToolCallId('tc-all-1')).toBeUndefined();
      expect(repo.findByContentChecksum('check-all')).toBeUndefined();
    });
  });

  describe('getDistinctSessionIds', () => {
    it('returns empty array when no mappings exist', () => {
      const ids = repo.getDistinctSessionIds();
      expect(ids).toEqual([]);
    });

    it('returns all distinct session IDs', () => {
      const now = '2026-05-20T00:00:00Z';
      repo.insertToolCallMapping({
        toolCallId: 'tc-a',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.insertToolCallMapping({
        toolCallId: 'tc-b',
        sessionId: 'sess-1',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: now,
      });
      repo.insertChecksumMapping({
        contentChecksum: 'abc123',
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
      repo.insertToolCallMapping({
        toolCallId: 'tc-bump-1',
        sessionId: 'sess-bump',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });
      repo.insertToolCallMapping({
        toolCallId: 'tc-bump-2',
        sessionId: 'sess-bump',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });

      repo.bumpSession('sess-bump', fresh);

      const row1 = repo.findByToolCallId('tc-bump-1');
      const row2 = repo.findByToolCallId('tc-bump-2');
      expect(row1!.updatedAt).toBe(fresh);
      expect(row2!.updatedAt).toBe(fresh);
    });

    it('does not affect other sessions', () => {
      const old = '2026-05-20T00:00:00Z';
      const fresh = '2026-05-22T12:00:00Z';
      repo.insertToolCallMapping({
        toolCallId: 'tc-other',
        sessionId: 'sess-other',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });
      repo.insertToolCallMapping({
        toolCallId: 'tc-target',
        sessionId: 'sess-target',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: old,
      });

      repo.bumpSession('sess-target', fresh);

      const other = repo.findByToolCallId('tc-other');
      expect(other!.updatedAt).toBe(old);
    });
  });

  describe('deleteExpired', () => {
    it('deletes rows where updatedAt is before cutoff', () => {
      repo.insertToolCallMapping({
        toolCallId: 'tc-old',
        sessionId: 'sess-old',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-20T00:00:00Z',
      });
      repo.insertToolCallMapping({
        toolCallId: 'tc-new',
        sessionId: 'sess-new',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-22T12:00:00Z',
      });

      repo.deleteExpired('2026-05-21T00:00:00Z');

      expect(repo.findByToolCallId('tc-old')).toBeUndefined();
      expect(repo.findByToolCallId('tc-new')).toBeDefined();
    });

    it('deletes nothing when all rows are fresh', () => {
      repo.insertToolCallMapping({
        toolCallId: 'tc-fresh',
        sessionId: 'sess-fresh',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-22T12:00:00Z',
      });

      repo.deleteExpired('2026-05-21T00:00:00Z');

      expect(repo.findByToolCallId('tc-fresh')).toBeDefined();
    });

    it('uses bumped updatedAt instead of createdAt', () => {
      repo.insertToolCallMapping({
        toolCallId: 'tc-bumped',
        sessionId: 'sess-bumped',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
        createdAt: '2026-05-20T00:00:00Z',
      });

      // Bump to recent time
      repo.bumpSession('sess-bumped', '2026-05-22T12:00:00Z');

      // Cutoff would delete based on createdAt, but should
      // use updatedAt which is now recent
      repo.deleteExpired('2026-05-21T00:00:00Z');

      expect(repo.findByToolCallId('tc-bumped')).toBeDefined();
    });
  });
});
