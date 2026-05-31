import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../test/db-setup.js';
import { ContentRulesRepository } from './content-rules-repository.js';
import type { Database } from '../db/index.js';
import type { DatabaseSync } from 'node:sqlite';

describe('ContentRulesRepository', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: ContentRulesRepository;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new ContentRulesRepository(db);
  });

  afterEach(() => {
    clearTestDb(raw);
  });

  const makeRule = (overrides?: Record<string, unknown>) => ({
    id: 'rule-1',
    name: 'Test Rule',
    regexPattern: 'hello',
    substitution: 'world',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  describe('insert', () => {
    it('inserts a rule and returns the row with defaults', () => {
      const rule = repo.insert(makeRule());
      expect(rule.id).toBe('rule-1');
      expect(rule.name).toBe('Test Rule');
      expect(rule.enabled).toBe(1);
      expect(rule.regexPattern).toBe('hello');
      expect(rule.substitution).toBe('world');
      expect(rule.sortOrder).toBe(0);
      expect(rule.regexFlags).toBe('');
    });

    it('persists optional matching fields', () => {
      const rule = repo.insert(
        makeRule({
          id: 'rule-2',
          name: 'Filtered Rule',
          matchRole: 'system',
          matchMessageNumber: 0,
          matchModelPattern: 'gpt-*',
          matchContentPattern: 'test',
          matchToolPresent: '["memory","read_file"]',
          matchToolAbsent: '["web_search"]',
          regexFlags: 'gi',
        }),
      );
      expect(rule.matchRole).toBe('system');
      expect(rule.matchMessageNumber).toBe(0);
      expect(rule.matchModelPattern).toBe('gpt-*');
      expect(rule.matchContentPattern).toBe('test');
      expect(rule.matchToolPresent).toBe('["memory","read_file"]');
      expect(rule.matchToolAbsent).toBe('["web_search"]');
      expect(rule.regexFlags).toBe('gi');
    });

    it('throws on duplicate name due to unique constraint', () => {
      repo.insert(makeRule());
      expect(() => repo.insert(makeRule({ id: 'rule-2' }))).toThrow();
    });
  });

  describe('findAll', () => {
    it('returns rules ordered by sortOrder ASC', () => {
      repo.insert(makeRule({ id: 'r1', name: 'C', sortOrder: 2 }));
      repo.insert(makeRule({ id: 'r2', name: 'A', sortOrder: 0 }));
      repo.insert(makeRule({ id: 'r3', name: 'B', sortOrder: 1 }));
      const rules = repo.findAll();
      expect(rules).toHaveLength(3);
      expect(rules[0].name).toBe('A');
      expect(rules[1].name).toBe('B');
      expect(rules[2].name).toBe('C');
    });

    it('returns empty array when no rules exist', () => {
      expect(repo.findAll()).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns rule when found', () => {
      repo.insert(makeRule());
      const rule = repo.findById('rule-1');
      expect(rule).toBeDefined();
      expect(rule!.id).toBe('rule-1');
    });

    it('returns undefined when not found', () => {
      expect(repo.findById('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates mutable fields and returns updated row', () => {
      repo.insert(makeRule());
      const updated = repo.update('rule-1', {
        name: 'Updated Rule',
        regexPattern: 'new',
        substitution: 'replaced',
      });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Rule');
      expect(updated!.regexPattern).toBe('new');
      expect(updated!.substitution).toBe('replaced');
      // updatedAt should be refreshed
      expect(updated!.updatedAt).not.toBe('2026-01-01T00:00:00Z');
    });

    it('returns undefined when rule not found', () => {
      expect(repo.update('nonexistent', { name: 'X' })).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes the rule and returns true', () => {
      repo.insert(makeRule());
      expect(repo.delete('rule-1')).toBe(true);
      expect(repo.findById('rule-1')).toBeUndefined();
    });

    it('returns false when rule not found', () => {
      expect(repo.delete('nonexistent')).toBe(false);
    });
  });

  describe('reorder', () => {
    it('updates sortOrder for all rules in a transaction', () => {
      repo.insert(makeRule({ id: 'r1', name: 'First', sortOrder: 5 }));
      repo.insert(makeRule({ id: 'r2', name: 'Second', sortOrder: 10 }));
      repo.insert(makeRule({ id: 'r3', name: 'Third', sortOrder: 15 }));

      // Reverse the order
      repo.reorder(['r3', 'r2', 'r1']);

      const rules = repo.findAll();
      expect(rules[0].id).toBe('r3');
      expect(rules[0].sortOrder).toBe(0);
      expect(rules[1].id).toBe('r2');
      expect(rules[1].sortOrder).toBe(1);
      expect(rules[2].id).toBe('r1');
      expect(rules[2].sortOrder).toBe(2);
    });

    it('throws when an ID does not exist', () => {
      repo.insert(makeRule({ id: 'r1' }));
      expect(() => repo.reorder(['r1', 'nonexistent'])).toThrow();
    });

    it('handles empty array', () => {
      expect(() => repo.reorder([])).not.toThrow();
    });
  });

  describe('nameExists', () => {
    it('returns true for existing name', () => {
      repo.insert(makeRule());
      expect(repo.nameExists('Test Rule')).toBe(true);
    });

    it('returns false for non-existing name', () => {
      expect(repo.nameExists('No Such Rule')).toBe(false);
    });

    it('excludes given ID from check', () => {
      repo.insert(makeRule({ id: 'r1', name: 'Same Name' }));
      repo.insert(makeRule({ id: 'r2', name: 'Other' }));
      // Excluding r1: no other rule has 'Same Name'
      expect(repo.nameExists('Same Name', 'r1')).toBe(false);
      // Not excluding: 'Same Name' exists
      expect(repo.nameExists('Same Name')).toBe(true);
    });
  });
});
