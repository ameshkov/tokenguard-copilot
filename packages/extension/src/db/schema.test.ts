import { describe, it, expect } from 'vitest';
import { getColumns } from 'drizzle-orm';
import {
  providers,
  models,
  usageRecords,
  settings,
  sessionMappings,
  contentRules,
} from './schema.js';

describe('providers table', () => {
  it('should have the expected columns', () => {
    const columns = getColumns(providers);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('name');
    expect(columns).toHaveProperty('baseUrl');
    expect(columns).toHaveProperty('removed');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });
});

describe('models table', () => {
  it('should have the expected columns', () => {
    const columns = getColumns(models);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('providerId');
    expect(columns).toHaveProperty('displayName');
    expect(columns).toHaveProperty('maxContextWindowTokens');
    expect(columns).toHaveProperty('maxOutputTokens');
    expect(columns).toHaveProperty('streaming');
    expect(columns).toHaveProperty('vision');
    expect(columns).toHaveProperty('temperature');
    expect(columns).toHaveProperty('topP');
    expect(columns).toHaveProperty('frequencyPenalty');
    expect(columns).toHaveProperty('presencePenalty');
    expect(columns).toHaveProperty('defaultReasoningEffort');
    expect(columns).toHaveProperty('preserveReasoning');
    expect(columns).toHaveProperty('inputCostPer1m');
    expect(columns).toHaveProperty('outputCostPer1m');
    expect(columns).toHaveProperty('cachedInputCostPer1m');
    expect(columns).toHaveProperty('cacheControl');
    expect(columns).toHaveProperty('customFields');
    expect(columns).toHaveProperty('enabled');
    expect(columns).toHaveProperty('removed');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });

  it('should default preserveReasoning to 1', () => {
    const col = getColumns(models).preserveReasoning;
    expect(col.default).toBe(1);
  });
});

describe('usageRecords table', () => {
  it('should have the expected columns', () => {
    const columns = getColumns(usageRecords);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('providerId');
    expect(columns).toHaveProperty('modelId');
    expect(columns).toHaveProperty('date');
    expect(columns).toHaveProperty('promptTokens');
    expect(columns).toHaveProperty('completionTokens');
    expect(columns).toHaveProperty('cachedTokens');
    expect(columns).toHaveProperty('reasoningTokens');
    expect(columns).toHaveProperty('requestCount');
    expect(columns).toHaveProperty('errorCount');
    expect(columns).toHaveProperty('promptTokensCost');
    expect(columns).toHaveProperty('completionTokensCost');
    expect(columns).toHaveProperty('cachedTokensCost');
  });
});

describe('settings table', () => {
  it('should have the expected columns', () => {
    const columns = getColumns(settings);
    expect(columns).toHaveProperty('key');
    expect(columns).toHaveProperty('value');
  });
});

describe('sessionMappings table', () => {
  it('should have the expected columns', () => {
    const columns = getColumns(sessionMappings);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('contentFingerprint');
    expect(columns).toHaveProperty('sessionId');
    expect(columns).toHaveProperty('workspaceId');
    expect(columns).toHaveProperty('modelName');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });
});

describe('contentRules table', () => {
  it('should have the expected columns', () => {
    const columns = getColumns(contentRules);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('name');
    expect(columns).toHaveProperty('enabled');
    expect(columns).toHaveProperty('matchRole');
    expect(columns).toHaveProperty('matchMessageNumber');
    expect(columns).toHaveProperty('matchModelPattern');
    expect(columns).toHaveProperty('matchContentPattern');
    expect(columns).toHaveProperty('matchToolPresent');
    expect(columns).toHaveProperty('matchToolAbsent');
    expect(columns).toHaveProperty('regexPattern');
    expect(columns).toHaveProperty('regexFlags');
    expect(columns).toHaveProperty('substitution');
    expect(columns).toHaveProperty('sortOrder');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });
});
