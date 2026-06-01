import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { UsageRecordRepository } from './usage-record-repository.js';
import { ProviderRepository } from './provider-repository.js';
import type { Database } from '../db/index.js';
import type { DatabaseSync } from 'node:sqlite';

describe('UsageRecordRepository', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: UsageRecordRepository;

  /** Helper to insert a provider row so FK constraints pass. */
  function seedProvider(id: string, name: string): void {
    const providerRepo = new ProviderRepository(db);
    providerRepo.insert({
      id,
      name,
      baseUrl: 'https://example.com/v1',
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
    });
  }

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new UsageRecordRepository(db);
    seedProvider('p1', 'provider-1');
    seedProvider('p2', 'provider-2');
  });

  afterEach(() => {
    clearTestDb(raw);
  });

  describe('upsert', () => {
    it('inserts a new daily record', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 20,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0.001,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const rows = repo.findByProvider('p1');
      expect(rows).toHaveLength(1);
      expect(rows[0].promptTokens).toBe(100);
      expect(rows[0].completionTokens).toBe(50);
      expect(rows[0].requestCount).toBe(1);
    });

    it('upserts on duplicate key — increments counters', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0.001,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 30,
        reasoningTokens: 5,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0.002,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const rows = repo.findByProvider('p1');
      expect(rows).toHaveLength(1);
      expect(rows[0].promptTokens).toBe(300);
      expect(rows[0].completionTokens).toBe(150);
      expect(rows[0].cachedTokens).toBe(30);
      expect(rows[0].reasoningTokens).toBe(5);
      expect(rows[0].requestCount).toBe(2);
      expect(
        rows[0].promptTokensCost + rows[0].completionTokensCost + rows[0].cachedTokensCost,
      ).toBeCloseTo(0.003, 5);
    });

    it('upserts on error — increments error count', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 0,
        errorCount: 1,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 0,
        errorCount: 1,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const rows = repo.findByProvider('p1');
      expect(rows[0].requestCount).toBe(0);
      expect(rows[0].errorCount).toBe(2);
    });
  });

  describe('findByProvider', () => {
    it('returns records filtered by provider ID', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p2',
        modelId: 'm2',
        date: '2026-05-25',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const p1 = repo.findByProvider('p1');
      expect(p1).toHaveLength(1);
      expect(p1[0].modelId).toBe('m1');
    });
  });

  describe('findByModel', () => {
    it('returns records filtered by provider + model', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm2',
        date: '2026-05-25',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const m1 = repo.findByModel('p1', 'm1');
      expect(m1).toHaveLength(1);
      expect(m1[0].modelId).toBe('m1');
    });
  });

  describe('findByDateRange', () => {
    it('returns records within date range', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-26',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-27',
        promptTokens: 300,
        completionTokens: 150,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const range = repo.findByDateRange({ dateFrom: '2026-05-25', dateTo: '2026-05-26' });
      expect(range).toHaveLength(2);
    });

    it('returns all records when no filters provided', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm2',
        date: '2026-05-26',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const all = repo.findByDateRange();
      expect(all).toHaveLength(2);
    });

    it('filters by modelId without providerId', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm2',
        date: '2026-05-25',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const result = repo.findByDateRange({ modelId: 'm1' });
      expect(result).toHaveLength(1);
      expect(result[0].modelId).toBe('m1');
      expect(result[0].promptTokens).toBe(100);
    });

    it('filters by modelId combined with date range', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-26',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const result = repo.findByDateRange({
        modelId: 'm1',
        dateFrom: '2026-05-25',
        dateTo: '2026-05-25',
      });
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-05-25');
      expect(result[0].promptTokens).toBe(100);
    });
  });

  describe('deleteByProvider', () => {
    it('deletes all records for a provider', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p2',
        modelId: 'm2',
        date: '2026-05-25',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const deleted = repo.deleteByProvider('p1');
      expect(deleted).toBe(1);
      const remaining = repo.findByDateRange();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].providerId).toBe('p2');
    });
  });

  describe('deleteByModel', () => {
    it('deletes all records for a model', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p1',
        modelId: 'm2',
        date: '2026-05-25',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      const deleted = repo.deleteByModel('p1', 'm1');
      expect(deleted).toBe(1);
      const remaining = repo.findByDateRange();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].modelId).toBe('m2');
    });
  });

  describe('deleteAll', () => {
    it('deletes all usage records', () => {
      repo.upsert({
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-05-25',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });
      repo.upsert({
        providerId: 'p2',
        modelId: 'm2',
        date: '2026-05-26',
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        errorCount: 0,
        promptTokensCost: 0,
        completionTokensCost: 0,
        cachedTokensCost: 0,
      });

      repo.deleteAll();
      const all = repo.findByDateRange();
      expect(all).toHaveLength(0);
    });
  });
});
