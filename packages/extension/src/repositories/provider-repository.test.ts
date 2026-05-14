import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { ProviderRepository } from './provider-repository.js';
import type { Database } from '../db/connection.js';
import type { DatabaseSync } from 'node:sqlite';

describe('ProviderRepository', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: ProviderRepository;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new ProviderRepository(db);
  });

  afterEach(() => {
    clearTestDb(raw);
  });

  describe('insert', () => {
    it('inserts and returns provider', () => {
      const provider = repo.insert({
        id: 'p1',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(provider.id).toBe('p1');
      expect(provider.name).toBe('OpenAI');
      expect(provider.baseUrl).toBe('https://api.openai.com');
      expect(provider.removed).toBe(0);
    });
  });

  describe('findActive', () => {
    it('excludes removed providers', () => {
      repo.insert({
        id: 'p1',
        name: 'Active',
        baseUrl: 'https://a.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      repo.insert({
        id: 'p2',
        name: 'Removed',
        baseUrl: 'https://b.com',
        removed: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      const active = repo.findActive();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Active');
    });
  });

  describe('findAll', () => {
    it('includes removed providers', () => {
      repo.insert({
        id: 'p1',
        name: 'A',
        baseUrl: 'https://a.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      repo.insert({
        id: 'p2',
        name: 'B',
        baseUrl: 'https://b.com',
        removed: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(repo.findAll()).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('returns provider when found', () => {
      repo.insert({
        id: 'p1',
        name: 'A',
        baseUrl: 'https://a.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(repo.findById('p1')).toBeDefined();
    });

    it('returns undefined when not found', () => {
      expect(repo.findById('missing')).toBeUndefined();
    });
  });

  describe('existsByName', () => {
    it('returns true for existing name', () => {
      repo.insert({
        id: 'p1',
        name: 'OpenAI',
        baseUrl: 'https://a.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(repo.existsByName('OpenAI')).toBe(true);
    });

    it('returns false for non-existing name', () => {
      expect(repo.existsByName('Nope')).toBe(false);
    });

    it('ignores removed providers', () => {
      repo.insert({
        id: 'p1',
        name: 'Gone',
        baseUrl: 'https://a.com',
        removed: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(repo.existsByName('Gone')).toBe(false);
    });

    it('excludes provider by id', () => {
      repo.insert({
        id: 'p1',
        name: 'OpenAI',
        baseUrl: 'https://a.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(repo.existsByName('OpenAI', 'p1')).toBe(false);
    });
  });

  describe('update', () => {
    it('updates name and baseUrl of an existing provider', () => {
      const past = '2020-01-01T00:00:00.000Z';
      repo.insert({
        id: 'p1',
        name: 'Old',
        baseUrl: 'https://old.com',
        createdAt: past,
        updatedAt: past,
      });

      const updated = repo.update('p1', {
        name: 'New',
        baseUrl: 'https://new.com',
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New');
      expect(updated!.baseUrl).toBe('https://new.com');
      expect(updated!.updatedAt).not.toBe(past);
    });

    it('returns undefined when provider does not exist', () => {
      const result = repo.update('nonexistent', {
        name: 'X',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('softRemove', () => {
    it('marks provider as removed and renames with timestamp', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'p1',
        name: 'ToRemove',
        baseUrl: 'https://remove.com',
        createdAt: now,
        updatedAt: now,
      });

      const result = repo.softRemove('p1');
      expect(result).toBe(true);

      const active = repo.findActive();
      expect(active).toHaveLength(0);

      const all = repo.findAll();
      expect(all).toHaveLength(1);
      expect(all[0].removed).toBe(1);
      expect(all[0].name).toMatch(/^ToRemove \(deleted [A-Z][a-z]{2} \d/);
    });

    it('frees the name for reuse after soft-remove', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'p1',
        name: 'Reusable',
        baseUrl: 'https://a.com',
        createdAt: now,
        updatedAt: now,
      });
      repo.softRemove('p1');

      // Inserting a new provider with the same name should succeed
      const inserted = repo.insert({
        id: 'p2',
        name: 'Reusable',
        baseUrl: 'https://b.com',
        createdAt: now,
        updatedAt: now,
      });
      expect(inserted.name).toBe('Reusable');
    });

    it('returns false when provider does not exist', () => {
      const result = repo.softRemove('nonexistent');
      expect(result).toBe(false);
    });
  });
});
