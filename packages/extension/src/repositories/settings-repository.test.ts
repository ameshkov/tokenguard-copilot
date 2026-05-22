import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { SettingsRepository } from './settings-repository.js';
import type { Database } from '../db/connection.js';
import type { DatabaseSync } from 'node:sqlite';

describe('SettingsRepository', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: SettingsRepository;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new SettingsRepository(db);
  });

  afterEach(() => {
    clearTestDb(raw);
    raw.close();
  });

  describe('get', () => {
    it('returns null for non-existent key', () => {
      expect(repo.get('missing.key')).toBeNull();
    });

    it('returns value for existing key', () => {
      repo.set('test.key', 'hello');
      expect(repo.get('test.key')).toBe('hello');
    });
  });

  describe('set', () => {
    it('inserts a new key-value pair', () => {
      repo.set('new.key', 'value1');
      expect(repo.get('new.key')).toBe('value1');
    });

    it('updates an existing key', () => {
      repo.set('my.key', 'old');
      repo.set('my.key', 'new');
      expect(repo.get('my.key')).toBe('new');
    });
  });

  describe('remove', () => {
    it('removes an existing key', () => {
      repo.set('del.key', 'val');
      expect(repo.remove('del.key')).toBe(true);
      expect(repo.get('del.key')).toBeNull();
    });

    it('returns false for non-existent key', () => {
      expect(repo.remove('no.key')).toBe(false);
    });
  });
});
