import { describe, it, expect } from 'vitest';
import { extractUsageFromResponse } from './extract-usage.js';

describe('extractUsageFromResponse', () => {
  it('returns null when usage is absent', () => {
    expect(extractUsageFromResponse({})).toBeNull();
  });

  it('extracts prompt and completion tokens', () => {
    const result = extractUsageFromResponse({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      cachedTokens: 0,
      reasoningTokens: 0,
    });
  });

  it('extracts cached_tokens from prompt_tokens_details', () => {
    const result = extractUsageFromResponse({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_tokens_details: {
          cached_tokens: 25,
        },
      },
    });
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      cachedTokens: 25,
      reasoningTokens: 0,
    });
  });

  it('extracts reasoning_tokens from completion_tokens_details', () => {
    const result = extractUsageFromResponse({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        completion_tokens_details: {
          reasoning_tokens: 30,
        },
      },
    });
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      cachedTokens: 0,
      reasoningTokens: 30,
    });
  });

  it('defaults missing sub-fields to 0', () => {
    const result = extractUsageFromResponse({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
      },
    });
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      cachedTokens: 0,
      reasoningTokens: 0,
    });
  });
});
