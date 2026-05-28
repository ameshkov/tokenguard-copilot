import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { providers } from '../db/schema.js';
import { ModelRepository } from './model-repository.js';
import type { Database } from '../db/connection.js';
import type { DatabaseSync } from 'node:sqlite';

describe('ModelRepository', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: ModelRepository;
  const providerId = 'provider-1';

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    db.insert(providers)
      .values({
        id: providerId,
        name: 'Test Provider',
        baseUrl: 'https://api.test.com/v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    repo = new ModelRepository(db);
  });

  afterEach(() => {
    clearTestDb(raw);
  });

  describe('insert', () => {
    it('inserts a model and returns the row', () => {
      const now = new Date().toISOString();
      const row = repo.insert({
        id: 'gpt-4o',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      expect(row.id).toBe('gpt-4o');
      expect(row.providerId).toBe(providerId);
      expect(row.maxContextWindowTokens).toBe(128000);
      expect(row.streaming).toBe(1);
      expect(row.vision).toBe(0);
    });
  });

  describe('findActive', () => {
    it('returns only non-removed models', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'model-a',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      repo.insert({
        id: 'model-b',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        removed: 1,
        createdAt: now,
        updatedAt: now,
      });
      const active = repo.findActive();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('model-a');
    });

    it('filters by providerId when specified', () => {
      const now = new Date().toISOString();
      const secondProviderId = 'provider-2';
      db.insert(providers)
        .values({
          id: secondProviderId,
          name: 'Second Provider',
          baseUrl: 'https://api.second.com/v1',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      repo.insert({
        id: 'model-a',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      repo.insert({
        id: 'model-b',
        providerId: secondProviderId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      const filtered = repo.findActive(providerId);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].providerId).toBe(providerId);
    });
  });

  describe('findByKey', () => {
    it('returns the model with matching composite key', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      const found = repo.findByKey('gpt-4o', providerId);
      expect(found).toBeDefined();
      expect(found!.id).toBe('gpt-4o');
    });

    it('returns undefined when not found', () => {
      expect(repo.findByKey('nonexistent', providerId)).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns all models including removed', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'model-a',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      repo.insert({
        id: 'model-b',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        removed: 1,
        createdAt: now,
        updatedAt: now,
      });
      const all = repo.findAll();
      expect(all).toHaveLength(2);
    });

    it('filters by providerId when specified', () => {
      const now = new Date().toISOString();
      const secondProviderId = 'provider-2';
      db.insert(providers)
        .values({
          id: secondProviderId,
          name: 'Second Provider',
          baseUrl: 'https://api.second.com/v1',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      repo.insert({
        id: 'model-a',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      repo.insert({
        id: 'model-b',
        providerId: secondProviderId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      const filtered = repo.findAll(providerId);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].providerId).toBe(providerId);
    });
  });

  describe('update', () => {
    it('updates mutable fields', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      const updated = repo.update('gpt-4o', providerId, {
        displayName: 'GPT-4o Custom',
        temperature: 0.7,
      });
      expect(updated).toBeDefined();
      expect(updated!.displayName).toBe('GPT-4o Custom');
      expect(updated!.temperature).toBe(0.7);
    });

    it('returns undefined when model not found', () => {
      const result = repo.update('nonexistent', providerId, {
        displayName: 'X',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('softRemove', () => {
    it('marks model as removed', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      const result = repo.softRemove('gpt-4o', providerId);
      expect(result).toBe(true);
      const active = repo.findActive();
      expect(active).toHaveLength(0);
    });

    it('returns false when model not found', () => {
      expect(repo.softRemove('nonexistent', providerId)).toBe(false);
    });
  });

  describe('existsByKey', () => {
    it('returns true for existing non-removed model', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      expect(repo.existsByKey('gpt-4o', providerId)).toBe(true);
    });

    it('returns false for removed model', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        removed: 1,
        createdAt: now,
        updatedAt: now,
      });
      expect(repo.existsByKey('gpt-4o', providerId)).toBe(false);
    });
  });

  describe('existsByDisplayName', () => {
    it('returns false when no model has the display name', () => {
      expect(repo.existsByDisplayName('Custom Name')).toBe(false);
    });

    it('returns true when an active model has the display name', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        displayName: 'Custom Name',
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      expect(repo.existsByDisplayName('Custom Name')).toBe(true);
    });

    it('returns false when the model with that name is removed', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        displayName: 'Removed Name',
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        removed: 1,
        createdAt: now,
        updatedAt: now,
      });
      expect(repo.existsByDisplayName('Removed Name')).toBe(false);
    });

    it('returns false when excluding the model with that name', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        displayName: 'My Model',
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      expect(repo.existsByDisplayName('My Model', 'gpt-4o', providerId)).toBe(false);
    });

    it('returns true when another model has the same name', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'gpt-4o',
        providerId,
        displayName: 'Shared Name',
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      expect(repo.existsByDisplayName('Shared Name', 'other-model', providerId)).toBe(true);
    });

    it('returns false for null display name', () => {
      expect(repo.existsByDisplayName(null)).toBe(false);
    });
  });

  describe('cacheControl column', () => {
    it('inserts model with cacheControl JSON and parses it back', () => {
      const now = new Date().toISOString();
      const cacheControl = {
        enabled: true,
        maxMarkers: 4,
        ttl: 300,
      };
      const row = repo.insert({
        id: 'qwen-model',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        cacheControl: JSON.stringify(cacheControl),
        createdAt: now,
        updatedAt: now,
      });
      expect(row.cacheControl).toBe(JSON.stringify(cacheControl));
      const parsed = JSON.parse(row.cacheControl!);
      expect(parsed).toEqual(cacheControl);
    });

    it('updates cacheControl and parses it back correctly', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'qwen-model',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      const newConfig = {
        enabled: true,
        maxMarkers: 2,
      };
      const updated = repo.update('qwen-model', providerId, {
        cacheControl: JSON.stringify(newConfig),
      });
      expect(updated).toBeDefined();
      const parsed = JSON.parse(updated!.cacheControl!);
      expect(parsed).toEqual(newConfig);
    });

    it('handles model without cacheControl gracefully', () => {
      const now = new Date().toISOString();
      const row = repo.insert({
        id: 'gpt-model',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      expect(row.cacheControl).toBeNull();

      const found = repo.findByKey('gpt-model', providerId);
      expect(found).toBeDefined();
      expect(found!.cacheControl).toBeNull();

      const active = repo.findActive();
      expect(active).toHaveLength(1);
      expect(active[0].cacheControl).toBeNull();
    });
  });

  describe('customFields column', () => {
    it('inserts model with customFields JSON and parses it back', () => {
      const now = new Date().toISOString();
      const customFields = [{ property: 'reasoning_split', type: 'boolean', value: 'true' }];
      const row = repo.insert({
        id: 'custom-model',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        customFields: JSON.stringify(customFields),
        createdAt: now,
        updatedAt: now,
      });
      expect(row.customFields).toBe(JSON.stringify(customFields));
      const parsed = JSON.parse(row.customFields!);
      expect(parsed).toEqual(customFields);
    });

    it('updates customFields and parses it back correctly', () => {
      const now = new Date().toISOString();
      repo.insert({
        id: 'custom-model',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      const newFields = [{ property: 'foo', type: 'string', value: 'bar' }];
      const updated = repo.update('custom-model', providerId, {
        customFields: JSON.stringify(newFields),
      });
      expect(updated).toBeDefined();
      const parsed = JSON.parse(updated!.customFields!);
      expect(parsed).toEqual(newFields);
    });

    it('handles model without customFields gracefully', () => {
      const now = new Date().toISOString();
      const row = repo.insert({
        id: 'plain-model',
        providerId,
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        createdAt: now,
        updatedAt: now,
      });
      expect(row.customFields).toBeNull();

      const found = repo.findByKey('plain-model', providerId);
      expect(found).toBeDefined();
      expect(found!.customFields).toBeNull();

      const active = repo.findActive();
      expect(active).toHaveLength(1);
      expect(active[0].customFields).toBeNull();
    });
  });
});
