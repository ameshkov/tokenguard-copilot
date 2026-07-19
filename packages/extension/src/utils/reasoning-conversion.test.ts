import { describe, it, expect, vi } from 'vitest';
import { reasoningToThinkingPart, thinkingPartsToReasoning } from './reasoning-conversion.js';
import { LanguageModelThinkingPart } from 'vscode';

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
    expect(part).toBeInstanceOf(LanguageModelThinkingPart);
    expect(part!.value).toBe('DeepSeek thinking...');
    expect(part!.metadata?.presentFields).toEqual(['reasoning_content']);
  });

  it('uses longest field as value with all presentFields', () => {
    const part = reasoningToThinkingPart({
      reasoning: 'plaintext reasoning',
      reasoning_details: [{ type: 'text', text: 'structured detail' }],
    });
    expect(part).toBeInstanceOf(LanguageModelThinkingPart);
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
      new LanguageModelThinkingPart('DeepSeek thinking...', undefined, {
        presentFields: ['reasoning_content'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('DeepSeek thinking...');
    expect(result!.reasoning).toBeUndefined();
    expect(result!.reasoning_details).toBeUndefined();
  });

  it('populates all fields when metadata is absent', () => {
    const result = thinkingPartsToReasoning([new LanguageModelThinkingPart('raw thinking text')]);
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
      new LanguageModelThinkingPart('', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new LanguageModelThinkingPart('actual content', undefined, {
        presentFields: ['reasoning_content'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('actual content');
  });

  it('returns null when all parts are empty strings', () => {
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new LanguageModelThinkingPart('', undefined, {
        presentFields: ['reasoning'],
      }),
    ]);
    expect(result).toBeNull();
  });

  it('returns null when all parts are whitespace-only', () => {
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('   ', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new LanguageModelThinkingPart('  \n  ', undefined, {
        presentFields: ['reasoning'],
      }),
    ]);
    expect(result).toBeNull();
  });

  it('concatenates multiple streaming deltas for same field', () => {
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('Hello ', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new LanguageModelThinkingPart('world', undefined, {
        presentFields: ['reasoning_content'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_content).toBe('Hello world');
  });

  it('handles deltas from different fields independently', () => {
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('content delta', undefined, {
        presentFields: ['reasoning_content'],
      }),
      new LanguageModelThinkingPart('plain delta', undefined, {
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
      new LanguageModelThinkingPart('detail text', undefined, {
        presentFields: ['reasoning_details'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toEqual([{ type: 'text', text: 'detail text' }]);
  });

  it('merges multiple reasoning_details deltas into a single block', () => {
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('The', undefined, {
        presentFields: ['reasoning_details'],
      }),
      new LanguageModelThinkingPart(' kubilot server.', undefined, {
        presentFields: ['reasoning_details'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toEqual([{ type: 'text', text: 'The kubilot server.' }]);
  });

  it('reconstructs the signature and detail type from metadata', () => {
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('The', undefined, {
        presentFields: ['reasoning_details'],
      }),
      new LanguageModelThinkingPart(' kubilot server.', undefined, {
        presentFields: ['reasoning_details'],
        signature: 'sig',
        detailType: 'reasoning.text',
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toEqual([
      { type: 'reasoning.text', text: 'The kubilot server.', signature: 'sig' },
    ]);
  });

  it('reconstructs index, format, and id from metadata', () => {
    // Only the final streaming delta carries the signature;
    // earlier deltas carry no identity metadata. The
    // reconstructed block must still sport the index, format,
    // and id from whichever part provides them.
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('The', undefined, {
        presentFields: ['reasoning_details'],
      }),
      new LanguageModelThinkingPart(' kubilot server.', undefined, {
        presentFields: ['reasoning_details'],
        signature: 'sig',
        detailType: 'reasoning.text',
        detailIndex: 0,
        detailFormat: 'anthropic-claude-v1',
        detailId: 'block-42',
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toEqual([
      {
        type: 'reasoning.text',
        text: 'The kubilot server.',
        signature: 'sig',
        index: 0,
        format: 'anthropic-claude-v1',
        id: 'block-42',
      },
    ]);
  });

  it('does not synthesise index/format when metadata lacks them', () => {
    // Unsigned reasoning (no signature) should never gain
    // fabricated identity fields during reconstruction.
    const result = thinkingPartsToReasoning([
      new LanguageModelThinkingPart('detail text', undefined, {
        presentFields: ['reasoning_details'],
      }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toEqual([{ type: 'text', text: 'detail text' }]);
  });
});

describe('reasoningToThinkingPart ↔ thinkingPartsToReasoning — signature round-trip', () => {
  it('round-trips a signed Anthropic reasoning block faithfully', () => {
    // The assembled (non-streaming) form of an OpenRouter
    // Anthropic response: one block with full text + signature.
    const assembled = {
      reasoning: 'The kubilot server is down.',
      reasoning_details: [
        {
          type: 'reasoning.text',
          text: 'The kubilot server is down.',
          index: 0,
          format: 'anthropic-claude-v1',
          signature: 'sig',
        },
      ],
    };
    const part = reasoningToThinkingPart(assembled);
    expect(part).toBeInstanceOf(LanguageModelThinkingPart);
    expect(part!.metadata).toMatchObject({
      presentFields: ['reasoning', 'reasoning_details'],
      signature: 'sig',
      detailType: 'reasoning.text',
      detailIndex: 0,
      detailFormat: 'anthropic-claude-v1',
    });

    const restored = thinkingPartsToReasoning([part!]);
    expect(restored).not.toBeNull();
    expect(restored!.reasoning).toBe('The kubilot server is down.');
    // The provider requires `index` and `format` alongside the
    // `signature` to interpret a signed Anthropic `thinking`
    // block; dropping them yields an "Invalid `signature` in
    // `thinking` block" error from the upstream provider.
    expect(restored!.reasoning_details).toEqual([
      {
        type: 'reasoning.text',
        text: 'The kubilot server is down.',
        index: 0,
        format: 'anthropic-claude-v1',
        signature: 'sig',
      },
    ]);
  });

  it('round-trips a signatory Anthropic block carrying a provider id', () => {
    // Some providers attach an `id` to each reasoning block;
    // it must survive the thinking-part round-trip too.
    const assembled = {
      reasoning_details: [
        {
          type: 'reasoning.text',
          text: 'Thinking…',
          index: 0,
          format: 'anthropic-claude-v1',
          id: 'blk_01',
          signature: 'sig',
        },
      ],
    };
    const part = reasoningToThinkingPart(assembled);
    expect(part!.metadata).toMatchObject({
      signature: 'sig',
      detailType: 'reasoning.text',
      detailIndex: 0,
      detailFormat: 'anthropic-claude-v1',
      detailId: 'blk_01',
    });
    const restored = thinkingPartsToReasoning([part!]);
    expect(restored!.reasoning_details).toEqual([
      {
        type: 'reasoning.text',
        text: 'Thinking…',
        index: 0,
        format: 'anthropic-claude-v1',
        id: 'blk_01',
        signature: 'sig',
      },
    ]);
  });

  it('round-trips streamed reasoning_details deltas into one merged signed block', () => {
    // Simulate the three SSE deltas that OpenRouter streams for
    // one Anthropic reasoning block. Only the final delta carries
    // the signature.
    const deltas = [
      {
        reasoning: 'The',
        reasoning_details: [
          { type: 'reasoning.text', text: 'The', index: 0, format: 'anthropic-claude-v1' },
        ],
      },
      {
        reasoning: ' kubilot',
        reasoning_details: [
          { type: 'reasoning.text', text: ' kubilot', index: 0, format: 'anthropic-claude-v1' },
        ],
      },
      {
        reasoning: ' server.',
        reasoning_details: [
          {
            type: 'reasoning.text',
            text: ' server.',
            index: 0,
            format: 'anthropic-claude-v1',
            signature: 'sig',
          },
        ],
      },
    ];
    const parts = deltas.map((d) => reasoningToThinkingPart(d)!);
    const restored = thinkingPartsToReasoning(parts);
    expect(restored).not.toBeNull();
    expect(restored!.reasoning).toBe('The kubilot server.');
    // The final delta carries both the signature and the
    // identity fields; both must be reconstructed together.
    expect(restored!.reasoning_details).toEqual([
      {
        type: 'reasoning.text',
        text: 'The kubilot server.',
        index: 0,
        format: 'anthropic-claude-v1',
        signature: 'sig',
      },
    ]);
  });
});
