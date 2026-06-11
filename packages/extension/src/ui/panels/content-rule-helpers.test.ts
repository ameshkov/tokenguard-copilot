import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { toContentRuleInfo, validateContentRuleParams } from './content-rule-helpers.js';
import type { ContentRule } from '../../db/index.js';

// safeParseJsonArray is used by toContentRuleInfo via import.
// We test its integration implicitly through toContentRuleInfo.

function makeRule(overrides: Partial<ContentRule> = {}): ContentRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    enabled: 1,
    matchRole: 'user',
    matchMessageNumber: null,
    matchModelPattern: null,
    matchContentPattern: null,
    matchToolPresent: null,
    matchToolAbsent: null,
    regexPattern: 'foo',
    regexFlags: 'gi',
    substitution: 'bar',
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('toContentRuleInfo', () => {
  it('converts all scalar fields from ContentRule to ContentRuleInfo', () => {
    const rule = makeRule();
    const info = toContentRuleInfo(rule);

    expect(info.id).toBe('rule-1');
    expect(info.name).toBe('Test Rule');
    expect(info.enabled).toBe(true);
    expect(info.matchRole).toBe('user');
    expect(info.matchMessageNumber).toBeNull();
    expect(info.matchModelPattern).toBeNull();
    expect(info.matchContentPattern).toBeNull();
    expect(info.matchToolPresent).toBeNull();
    expect(info.matchToolAbsent).toBeNull();
    expect(info.regexPattern).toBe('foo');
    expect(info.regexFlags).toBe('gi');
    expect(info.substitution).toBe('bar');
    expect(info.sortOrder).toBe(0);
    expect(info.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(info.updatedAt).toBe('2025-01-02T00:00:00.000Z');
  });

  it('converts enabled: 1 to true', () => {
    const info = toContentRuleInfo(makeRule({ enabled: 1 }));
    expect(info.enabled).toBe(true);
  });

  it('converts enabled: 0 to false', () => {
    const info = toContentRuleInfo(makeRule({ enabled: 0 }));
    expect(info.enabled).toBe(false);
  });

  it('defaults matchRole to "all" when null', () => {
    const info = toContentRuleInfo(makeRule({ matchRole: null as unknown as string }));
    expect(info.matchRole).toBe('all');
  });

  it('defaults matchRole to "all" when undefined', () => {
    const info = toContentRuleInfo(makeRule({ matchRole: undefined as unknown as string }));
    expect(info.matchRole).toBe('all');
  });

  it('parses matchToolPresent JSON array', () => {
    const info = toContentRuleInfo(makeRule({ matchToolPresent: '["read_file","search"]' }));
    expect(info.matchToolPresent).toEqual(['read_file', 'search']);
  });

  it('returns null for matchToolPresent when db value is null', () => {
    const info = toContentRuleInfo(makeRule({ matchToolPresent: null }));
    expect(info.matchToolPresent).toBeNull();
  });

  it('parses matchToolAbsent JSON array', () => {
    const info = toContentRuleInfo(makeRule({ matchToolAbsent: '["memory"]' }));
    expect(info.matchToolAbsent).toEqual(['memory']);
  });

  it('returns null for matchToolAbsent when db value is null', () => {
    const info = toContentRuleInfo(makeRule({ matchToolAbsent: null }));
    expect(info.matchToolAbsent).toBeNull();
  });

  it('returns empty array for invalid matchToolPresent JSON', () => {
    const info = toContentRuleInfo(makeRule({ matchToolPresent: 'not-json' }));
    expect(info.matchToolPresent).toEqual([]);
  });

  it('returns empty array for invalid matchToolAbsent JSON', () => {
    const info = toContentRuleInfo(makeRule({ matchToolAbsent: '{invalid}' }));
    expect(info.matchToolAbsent).toEqual([]);
  });
});

describe('validateContentRuleParams', () => {
  const noExisting = vi.fn().mockReturnValue(false);
  const validParams = {
    name: 'My Rule',
    regexPattern: 'test',
    regexFlags: 'gi',
    matchRole: 'user' as const,
    matchMessageNumber: null as number | null,
    matchContentPattern: null as string | null,
  };

  it('returns null for valid parameters', () => {
    const result = validateContentRuleParams(validParams, noExisting);
    expect(result).toBeNull();
  });

  it('returns error when name is empty', () => {
    const result = validateContentRuleParams({ ...validParams, name: '' }, noExisting);
    expect(result).toBe('Name is required.');
  });

  it('returns error when name is whitespace only', () => {
    const result = validateContentRuleParams({ ...validParams, name: '   ' }, noExisting);
    expect(result).toBe('Name is required.');
  });

  it('returns error when name already exists', () => {
    const existing = vi.fn().mockReturnValue(true);
    const result = validateContentRuleParams(validParams, existing);
    expect(result).toBe(`A content rule with the name "${validParams.name}" already exists.`);
    expect(existing).toHaveBeenCalledWith(validParams.name, undefined);
  });

  it('passes excludeId to existingName callback', () => {
    const existing = vi.fn().mockReturnValue(false);
    validateContentRuleParams(validParams, existing, 'exclude-me');
    expect(existing).toHaveBeenCalledWith(validParams.name, 'exclude-me');
  });

  it('returns error for invalid regexPattern', () => {
    const result = validateContentRuleParams({ ...validParams, regexPattern: '[' }, noExisting);
    expect(result).toBe('Invalid regex pattern.');
  });

  it('returns error for invalid regexFlags (non-regex flags)', () => {
    const result = validateContentRuleParams({ ...validParams, regexFlags: 'x' }, noExisting);
    expect(result).toBe('Invalid regex flags. Only g, i, m, s are allowed.');
  });

  it('returns error for regexFlags containing invalid chars', () => {
    const result = validateContentRuleParams({ ...validParams, regexFlags: 'giy' }, noExisting);
    expect(result).toBe('Invalid regex flags. Only g, i, m, s are allowed.');
  });

  it('accepts empty regexFlags', () => {
    const result = validateContentRuleParams({ ...validParams, regexFlags: '' }, noExisting);
    expect(result).toBeNull();
  });

  it('accepts all valid regex flags (g, i, m, s)', () => {
    const result = validateContentRuleParams({ ...validParams, regexFlags: 'gims' }, noExisting);
    expect(result).toBeNull();
  });

  it('returns error for invalid matchRole', () => {
    const result = validateContentRuleParams(
      { ...validParams, matchRole: 'assistant' },
      noExisting,
    );
    expect(result).toBe('Match role must be "system", "user", or "all".');
  });

  it('accepts matchRole "system"', () => {
    const result = validateContentRuleParams({ ...validParams, matchRole: 'system' }, noExisting);
    expect(result).toBeNull();
  });

  it('accepts matchRole "all"', () => {
    const result = validateContentRuleParams({ ...validParams, matchRole: 'all' }, noExisting);
    expect(result).toBeNull();
  });

  it('accepts undefined matchRole', () => {
    const result = validateContentRuleParams({ ...validParams, matchRole: undefined }, noExisting);
    expect(result).toBeNull();
  });

  it('returns error for non-integer matchMessageNumber', () => {
    const result = validateContentRuleParams(
      { ...validParams, matchMessageNumber: 1.5 },
      noExisting,
    );
    expect(result).toBe('Match message number must be a non-negative integer.');
  });

  it('returns error for negative matchMessageNumber', () => {
    const result = validateContentRuleParams(
      { ...validParams, matchMessageNumber: -1 },
      noExisting,
    );
    expect(result).toBe('Match message number must be a non-negative integer.');
  });

  it('accepts matchMessageNumber 0', () => {
    const result = validateContentRuleParams({ ...validParams, matchMessageNumber: 0 }, noExisting);
    expect(result).toBeNull();
  });

  it('accepts positive integer matchMessageNumber', () => {
    const result = validateContentRuleParams({ ...validParams, matchMessageNumber: 5 }, noExisting);
    expect(result).toBeNull();
  });

  it('returns error for invalid matchContentPattern regex', () => {
    const result = validateContentRuleParams(
      {
        ...validParams,
        matchContentPattern: '[invalid',
      },
      noExisting,
    );
    expect(result).toBe('Invalid match content pattern.');
  });

  it('skips matchContentPattern validation when null', () => {
    const result = validateContentRuleParams(
      { ...validParams, matchContentPattern: null },
      noExisting,
    );
    expect(result).toBeNull();
  });

  it('skips matchContentPattern validation when empty string', () => {
    const result = validateContentRuleParams(
      { ...validParams, matchContentPattern: '' },
      noExisting,
    );
    expect(result).toBeNull();
  });

  it('validates matchContentPattern with regexFlags', () => {
    // Valid pattern with valid flags should pass
    const result = validateContentRuleParams(
      {
        ...validParams,
        regexFlags: 'gi',
        matchContentPattern: 'hello',
      },
      noExisting,
    );
    expect(result).toBeNull();
  });

  it('uses regexFlags when validating matchContentPattern', () => {
    // Invalid flags combined with a valid pattern should still pass
    // because the flags are validated separately before pattern check
    const result = validateContentRuleParams(
      {
        ...validParams,
        regexFlags: '',
        matchContentPattern: 'test',
      },
      noExisting,
    );
    expect(result).toBeNull();
  });
});
