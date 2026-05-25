import { describe, it, expect } from 'vitest';
import { extractReasoning, extractReasoningFields } from './reasoning.js';

describe('extractReasoning', () => {
  it('returns longest reasoning string among multiple fields', () => {
    const result = extractReasoning({
      reasoning_content: 'short',
      reasoning: 'the longer reasoning text here',
      reasoning_details: [{ type: 'text', text: 'another' }],
    });
    expect(result).toBe('the longer reasoning text here');
  });

  it('returns reasoning_content when it is the only field', () => {
    const result = extractReasoning({
      reasoning_content: 'DeepSeek thinking...',
    });
    expect(result).toBe('DeepSeek thinking...');
  });

  it('returns reasoning (plaintext) when it is the only field', () => {
    const result = extractReasoning({
      reasoning: 'Anthropic plaintext thinking.',
    });
    expect(result).toBe('Anthropic plaintext thinking.');
  });

  it('returns reasoning_details text for type=text and type=summary', () => {
    const result = extractReasoning({
      reasoning_details: [
        { type: 'text', text: 'Let me analyze this.' },
        { type: 'summary', text: ' Overall conclusion.' },
      ],
    });
    expect(result).toBe('Let me analyze this. Overall conclusion.');
  });

  it('filters out reasoning_details with type=thinking', () => {
    const result = extractReasoning({
      reasoning_details: [
        { type: 'thinking', text: 'Internal.' },
        { type: 'text', text: 'Public reasoning.' },
      ],
    });
    expect(result).toBe('Public reasoning.');
  });

  it('filters out reasoning_details with type=redacted_thinking', () => {
    const result = extractReasoning({
      reasoning_details: [
        { type: 'redacted_thinking', text: 'Redacted.' },
        { type: 'text', text: 'Visible.' },
      ],
    });
    expect(result).toBe('Visible.');
  });

  it('returns null when no reasoning fields are present', () => {
    const result = extractReasoning({});
    expect(result).toBeNull();
  });

  it('returns null when all fields are empty/undefined', () => {
    const result = extractReasoning({
      reasoning_content: undefined,
      reasoning: undefined,
      reasoning_details: undefined,
    });
    expect(result).toBeNull();
  });

  it('returns null when reasoning_details has no matching types', () => {
    const result = extractReasoning({
      reasoning_details: [
        { type: 'thinking', text: 'Hidden.' },
        { type: 'redacted_thinking', text: 'Also hidden.' },
      ],
    });
    expect(result).toBeNull();
  });

  it('picks the longest among multiple fields when all present', () => {
    const result = extractReasoning({
      reasoning_content: 'abc',
      reasoning: 'abcdefghij',
      reasoning_details: [{ type: 'text', text: 'abcde' }],
    });
    expect(result).toBe('abcdefghij');
  });
});

describe('extractReasoningFields', () => {
  it('returns all present fields', () => {
    const result = extractReasoningFields({
      reasoning_content: 'content string',
      reasoning: 'reasoning string',
      reasoning_details: [{ type: 'text', text: 'detail text' }],
    });
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('content string');
    expect(result!.reasoning).toBe('reasoning string');
    expect(result!.reasoning_details).toEqual([{ type: 'text', text: 'detail text' }]);
  });

  it('returns only reasoning_content when it is the only field', () => {
    const result = extractReasoningFields({
      reasoning_content: 'only content',
    });
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('only content');
    expect(result!.reasoning).toBeUndefined();
    expect(result!.reasoning_details).toBeUndefined();
  });

  it('returns null when no fields are present', () => {
    const result = extractReasoningFields({});
    expect(result).toBeNull();
  });

  it('returns null when all fields are undefined', () => {
    const result = extractReasoningFields({
      reasoning_content: undefined,
      reasoning: undefined,
      reasoning_details: undefined,
    });
    expect(result).toBeNull();
  });

  it('preserves reasoning_details array without filtering', () => {
    const details = [
      { type: 'thinking', text: 'Hidden.' },
      { type: 'text', text: 'Visible.' },
    ];
    const result = extractReasoningFields({
      reasoning_details: details,
    });
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toHaveLength(2);
    expect(result!.reasoning_details![0].type).toBe('thinking');
  });

  it('does not include empty string fields that are not present', () => {
    const result = extractReasoningFields({
      reasoning: 'only reasoning',
    });
    expect(result).not.toBeNull();
    expect(result!.reasoning).toBe('only reasoning');
    expect(result!.reasoning_content).toBeUndefined();
  });
});
