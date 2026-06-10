import { describe, it, expect, vi } from 'vitest';
import { reasoningToThinkingPart, thinkingPartsToReasoning } from './reasoning-conversion.js';
import * as vscode from 'vscode';

vi.mock('vscode', () => ({
  LanguageModelThinkingPart: class {
    constructor(
      public value: string | string[],
      public id?: string,
      public metadata?: { readonly [key: string]: unknown },
    ) {}
  },
}));

describe('reasoningToThinkingPart', () => {
  it('converts single reasoning_content field', () => {
    const part = reasoningToThinkingPart({
      reasoning_content: 'DeepSeek thinking...',
    });
    expect(part).toBeInstanceOf(vscode.LanguageModelThinkingPart);
    expect(part!.value).toBe('DeepSeek thinking...');
    expect(part!.metadata?.presentFields).toEqual(['reasoning_content']);
  });

  it('uses longest field as value with all presentFields', () => {
    const part = reasoningToThinkingPart({
      reasoning: 'plaintext reasoning',
      reasoning_details: [{ type: 'text', text: 'structured detail' }],
    });
    expect(part).toBeInstanceOf(vscode.LanguageModelThinkingPart);
    expect(part!.value).toBe('plaintext reasoning');
    expect(part!.metadata?.presentFields).toEqual(['reasoning', 'reasoning_details']);
  });

  it('includes all presentFields when all three are present', () => {
    const part = reasoningToThinkingPart({
      reasoning_content: 'a',
      reasoning: 'b',
      reasoning_details: [{ type: 'text', text: 'c' }],
    });
    expect(part).not.toBeNull();
    expect(part!.value).toBe('a');
    expect(part!.metadata?.presentFields).toEqual([
      'reasoning_content',
      'reasoning',
      'reasoning_details',
    ]);
  });

  it('returns null when no reasoning fields are present', () => {
    expect(reasoningToThinkingPart({})).toBeNull();
  });
});

describe('thinkingPartsToReasoning', () => {
  it('returns null for empty array', () => {
    expect(thinkingPartsToReasoning([])).toBeNull();
  });

  it('reconstructs reasoning_content from thinking parts', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('DeepSeek thinking...', undefined, {
        presentFields: ['reasoning_content'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('DeepSeek thinking...');
    expect(result!.reasoning).toBeUndefined();
    expect(result!.reasoning_details).toBeUndefined();
  });

  it('populates all fields when metadata is absent', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('raw thinking text'),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('raw thinking text');
    expect(result!.reasoning).toBe('raw thinking text');
    expect(result!.reasoning_details).toEqual([{ type: 'text', text: 'raw thinking text' }]);
  });

  it('round-trips reasoning_content faithfully', () => {
    const original = { reasoning_content: 'DeepSeek chain of thought' };
    const part = reasoningToThinkingPart(original);
    const restored = thinkingPartsToReasoning([part!]);
    expect(restored).not.toBeNull();
    expect(restored!.reasoning_content).toBe('DeepSeek chain of thought');
    expect(restored!.reasoning).toBeUndefined();
    expect(restored!.reasoning_details).toBeUndefined();
  });

  it('round-trips reasoning + reasoning_details faithfully', () => {
    const original = {
      reasoning: 'plaintext',
      reasoning_details: [{ type: 'text', text: 'structured' }],
    };
    const part = reasoningToThinkingPart(original);
    const restored = thinkingPartsToReasoning([part!]);
    expect(restored).not.toBeNull();
    // Value is the longest field ('structured'), populated into both present fields
    expect(restored!.reasoning).toBe('structured');
    expect(restored!.reasoning_details).toEqual([{ type: 'text', text: 'structured' }]);
  });

  it('skips empty-string thinking parts', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new vscode.LanguageModelThinkingPart('actual content', undefined, {
        presentFields: ['reasoning_content'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('actual content');
  });

  it('returns null when all parts are empty strings', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new vscode.LanguageModelThinkingPart('', undefined, {
        presentFields: ['reasoning'],
      }),
    ]);
    expect(result).toBeNull();
  });

  it('returns null when all parts are whitespace-only', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('   ', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new vscode.LanguageModelThinkingPart('  \n  ', undefined, {
        presentFields: ['reasoning'],
      }),
    ]);
    expect(result).toBeNull();
  });

  it('concatenates multiple streaming deltas for same field', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('Hello ', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new vscode.LanguageModelThinkingPart('world', undefined, {
        presentFields: ['reasoning_content'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('Hello world');
  });

  it('handles deltas from different fields independently', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('content delta', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new vscode.LanguageModelThinkingPart('plain delta', undefined, {
        presentFields: ['reasoning'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('content delta');
    expect(result!.reasoning).toBe('plain delta');
    expect(result!.reasoning_details).toBeUndefined();
  });

  it('wraps reasoning_details values as structured array', () => {
    const result = thinkingPartsToReasoning([
      new vscode.LanguageModelThinkingPart('detail text', undefined, {
        presentFields: ['reasoning_details'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toEqual([{ type: 'text', text: 'detail text' }]);
  });
});
