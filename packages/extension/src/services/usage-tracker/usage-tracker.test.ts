import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { UsageRecordRepository, ModelRepository } from '../../repositories/index.js';
import { UsageTracker, computeCost } from './usage-tracker.js';
import { createMockLogger } from '../../test/mock-logger.js';
import { providers } from '../../db/index.js';
import type { Database } from '../../db/index.js';
import type { DatabaseSync } from 'node:sqlite';
import type { Model } from '../../db/index.js';

vi.mock('vscode', () => ({
  EventEmitter: class {
    private handlers: Array<() => void> = [];
    event = (handler: () => void) => {
      this.handlers.push(handler);
      return { dispose: () => {} };
    };
    fire() {
      for (const h of this.handlers) h();
    }
    dispose() {}
  },
}));

describe('computeCost', () => {
  it('computes cost using cached input cost when available', () => {
    const cost = computeCost(
      { promptTokens: 1000, completionTokens: 500, cachedTokens: 200, reasoningTokens: 0 },
      10, // inputCostPer1m: $10 / 1M
      8, // cachedInputCostPer1m: $8 / 1M
      30, // outputCostPer1m: $30 / 1M
    );
    // (1000 - 200) * 10 / 1M + 200 * 8 / 1M + 500 * 30 / 1M
    // = 800 * 10 / 1M + 200 * 8 / 1M + 500 * 30 / 1M
    // = 0.008 + 0.0016 + 0.015 = 0.0246
    expect(cost).toBeCloseTo(0.0246, 6);
  });

  it('falls back to input cost when cached input cost is null', () => {
    const cost = computeCost(
      { promptTokens: 1000, completionTokens: 500, cachedTokens: 200, reasoningTokens: 0 },
      10, // inputCostPer1m
      null, // no cached input cost
      30, // outputCostPer1m
    );
    // (1000 - 200) * 10 / 1M + 200 * 10 / 1M + 500 * 30 / 1M
    // = 800 * 10 / 1M + 200 * 10 / 1M + 500 * 30 / 1M
    // = 0.008 + 0.002 + 0.015 = 0.025
    expect(cost).toBeCloseTo(0.025, 6);
  });

  it('returns 0 when no cost values are set', () => {
    const cost = computeCost(
      { promptTokens: 1000, completionTokens: 500, cachedTokens: 0, reasoningTokens: 0 },
      null,
      null,
      null,
    );
    expect(cost).toBe(0);
  });

  it('handles zero tokens', () => {
    const cost = computeCost(
      { promptTokens: 0, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0 },
      10,
      8,
      30,
    );
    expect(cost).toBe(0);
  });

  it('handles cached tokens equal to prompt tokens', () => {
    const cost = computeCost(
      { promptTokens: 500, completionTokens: 100, cachedTokens: 500, reasoningTokens: 0 },
      10,
      5,
      30,
    );
    // (500 - 500) * 10 / 1M + 500 * 5 / 1M + 100 * 30 / 1M
    // = 0 + 0.0025 + 0.003 = 0.0055
    expect(cost).toBeCloseTo(0.0055, 6);
  });
});

describe('UsageTracker', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: UsageRecordRepository;
  let modelRepo: ModelRepository;
  let tracker: UsageTracker;

  /** Helper to insert a model row for cost lookups. */
  function seedModel(overrides: Partial<Model> = {}): Model {
    const model: Model = {
      id: 'm1',
      providerId: 'p1',
      displayName: null,
      maxContextWindowTokens: 128000,
      maxOutputTokens: 16384,
      streaming: 1,
      vision: 0,
      temperature: null,
      topP: null,
      frequencyPenalty: null,
      presencePenalty: null,
      defaultReasoningEffort: null,
      reasoningEffortMap: null,
      preserveReasoning: 0,
      inputCostPer1m: 10,
      outputCostPer1m: 30,
      cachedInputCostPer1m: 5,
      cacheControl: null,
      customFields: null,
      enabled: 1,
      removed: 0,
      createdAt: '2026-05-25T00:00:00Z',
      updatedAt: '2026-05-25T00:00:00Z',
      ...overrides,
    };
    modelRepo.insert(model);
    return model;
  }

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    // Seed providers so model inserts don't fail FK constraints
    db.insert(providers)
      .values([
        {
          id: 'p1',
          name: 'Provider 1',
          baseUrl: 'https://api.example.com/v1',
          createdAt: '2026-05-25T00:00:00Z',
          updatedAt: '2026-05-25T00:00:00Z',
        },
        {
          id: 'p2',
          name: 'Provider 2',
          baseUrl: 'https://api.example.com/v1',
          createdAt: '2026-05-25T00:00:00Z',
          updatedAt: '2026-05-25T00:00:00Z',
        },
      ])
      .run();
    repo = new UsageRecordRepository(db);
    modelRepo = new ModelRepository(db);
    tracker = new UsageTracker(repo, modelRepo, createMockLogger());
  });

  afterEach(() => {
    clearTestDb(raw);
  });

  describe('recordUsage', () => {
    it('records a successful usage with tokens and cost', () => {
      seedModel({ inputCostPer1m: 10, outputCostPer1m: 30, cachedInputCostPer1m: 5 });

      tracker.recordUsage('p1', 'm1', {
        promptTokens: 1000,
        completionTokens: 500,
        cachedTokens: 200,
        reasoningTokens: 50,
        success: true,
      });

      const stats = tracker.getStats({});
      expect(stats).toHaveLength(1);
      expect(stats[0].promptTokens).toBe(1000);
      expect(stats[0].completionTokens).toBe(500);
      expect(stats[0].cachedTokens).toBe(200);
      expect(stats[0].reasoningTokens).toBe(50);
      expect(stats[0].requestCount).toBe(1);
      expect(stats[0].errorCount).toBe(0);
      expect(stats[0].estimatedCost).toBeGreaterThan(0);
    });

    it('increments error count on failure', () => {
      seedModel();

      tracker.recordUsage('p1', 'm1', {
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: false,
      });

      const stats = tracker.getStats({});
      expect(stats[0].errorCount).toBe(1);
      expect(stats[0].requestCount).toBe(0);
      expect(stats[0].promptTokens).toBe(0);
    });

    it('increments request count without tokens when usage is empty', () => {
      seedModel();

      tracker.recordUsage('p1', 'm1', {
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });

      const stats = tracker.getStats({});
      expect(stats[0].requestCount).toBe(1);
      expect(stats[0].promptTokens).toBe(0);
    });

    it('aggregates multiple calls to same model on same day', () => {
      seedModel({ inputCostPer1m: 10, outputCostPer1m: 30 });

      tracker.recordUsage('p1', 'm1', {
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });
      tracker.recordUsage('p1', 'm1', {
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });

      const stats = tracker.getStats({});
      expect(stats).toHaveLength(1);
      expect(stats[0].promptTokens).toBe(300);
      expect(stats[0].completionTokens).toBe(150);
      expect(stats[0].requestCount).toBe(2);
    });

    it('emits onStatsChanged event', () => {
      seedModel();
      const listener = vi.fn();
      tracker.onStatsChanged(listener);

      tracker.recordUsage('p1', 'm1', {
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('recordError', () => {
    it('records a failed request without needing to specify token counts', () => {
      seedModel();

      tracker.recordError('p1', 'm1');

      const stats = tracker.getStats({});
      expect(stats[0].errorCount).toBe(1);
      expect(stats[0].requestCount).toBe(0);
      expect(stats[0].promptTokens).toBe(0);
    });

    it('emits onStatsChanged event', () => {
      seedModel();
      const listener = vi.fn();
      tracker.onStatsChanged(listener);

      tracker.recordError('p1', 'm1');

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      seedModel({ id: 'm1', inputCostPer1m: 10, outputCostPer1m: 30 });
      seedModel({ id: 'm2', inputCostPer1m: 10, outputCostPer1m: 30 });
      tracker.recordUsage('p1', 'm1', {
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });
      tracker.recordUsage('p1', 'm2', {
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });
    });

    it('returns all records when no filters', () => {
      const stats = tracker.getStats({});
      expect(stats).toHaveLength(2);
    });

    it('filters by providerId', () => {
      const stats = tracker.getStats({ providerId: 'p1' });
      expect(stats).toHaveLength(2);
    });

    it('filters by modelId', () => {
      const stats = tracker.getStats({ providerId: 'p1', modelId: 'm1' });
      expect(stats).toHaveLength(1);
      expect(stats[0].modelId).toBe('m1');
    });

    it('filters by date range', () => {
      const today = new Date().toISOString().slice(0, 10);
      const stats = tracker.getStats({ dateFrom: today, dateTo: today });
      expect(stats).toHaveLength(2);
    });

    it('returns empty array when no matching records', () => {
      const stats = tracker.getStats({ providerId: 'nonexistent' });
      expect(stats).toHaveLength(0);
    });
  });

  describe('resetStats', () => {
    beforeEach(() => {
      seedModel({ id: 'm1', inputCostPer1m: 10, outputCostPer1m: 30 });
      seedModel({ id: 'm2', inputCostPer1m: 10, outputCostPer1m: 30 });
      tracker.recordUsage('p1', 'm1', {
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });
      tracker.recordUsage('p1', 'm2', {
        promptTokens: 200,
        completionTokens: 100,
        cachedTokens: 0,
        reasoningTokens: 0,
        success: true,
      });
    });

    it('resets all stats with no scope', () => {
      tracker.resetStats();
      expect(tracker.getStats({})).toHaveLength(0);
    });

    it('resets per provider', () => {
      tracker.resetStats({ scope: 'provider', providerId: 'p1' });
      const stats = tracker.getStats({});
      expect(stats).toHaveLength(0);
    });

    it('resets per model', () => {
      tracker.resetStats({ scope: 'model', providerId: 'p1', modelId: 'm1' });
      const stats = tracker.getStats({});
      expect(stats).toHaveLength(1);
      expect(stats[0].modelId).toBe('m2');
    });

    it('emits onStatsChanged after reset', () => {
      const listener = vi.fn();
      tracker.onStatsChanged(listener);

      tracker.resetStats();
      expect(listener).toHaveBeenCalledOnce();
    });
  });
});
