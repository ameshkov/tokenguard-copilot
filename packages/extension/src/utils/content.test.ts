import { describe, it, expect } from 'vitest';
import type { OpenAIContentPart } from '../services/chat-handler/index.js';
import { extractTextContent } from './content.js';

describe('extractTextContent', () => {
  it('returns empty string for null', () => {
    expect(extractTextContent(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(extractTextContent(undefined)).toBe('');
  });

  it('returns string content as-is', () => {
    expect(extractTextContent('hello world')).toBe('hello world');
  });

  it('joins text from content parts', () => {
    const parts: OpenAIContentPart[] = [
      { type: 'text', text: 'hello ' },
      { type: 'text', text: 'world' },
    ];
    expect(extractTextContent(parts)).toBe('hello world');
  });

  it('returns empty string for empty array', () => {
    expect(extractTextContent([])).toBe('');
  });
});
