import { describe, it, expect } from 'vitest';
import { buildUserAgent } from './user-agent.js';

describe('buildUserAgent', () => {
  it('builds user-agent string with name and version', () => {
    expect(buildUserAgent('1.2.1')).toBe('TokenGuardCopilot/v1.2.1');
  });

  it('handles pre-release versions', () => {
    expect(buildUserAgent('0.0.0-test')).toBe('TokenGuardCopilot/v0.0.0-test');
  });

  it('falls back to 0.0.0 when version is not provided', () => {
    expect(buildUserAgent()).toBe('TokenGuardCopilot/v0.0.0');
  });

  it('falls back to 0.0.0 when version is empty string', () => {
    expect(buildUserAgent('')).toBe('TokenGuardCopilot/v0.0.0');
  });
});
