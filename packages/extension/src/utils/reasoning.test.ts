import { describe, it, expect } from 'vitest';
import { extractReasoning, extractReasoningFields, mergeReasoningDetails } from './reasoning.js';

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

describe('extractReasoning — OpenRouter reasoning_details types', () => {
  it('extracts text from reasoning.text details', () => {
    const result = extractReasoning({
      reasoning_details: [{ type: 'reasoning.text', text: 'Let me think.' }],
    });
    expect(result).toBe('Let me think.');
  });

  it('extracts summary from reasoning.summary details', () => {
    const result = extractReasoning({
      reasoning_details: [
        { type: 'reasoning.summary', summary: 'Step one. ' },
        { type: 'reasoning.summary', summary: 'Step two.' },
      ],
    });
    expect(result).toBe('Step one. Step two.');
  });

  it('concatenates reasoning.text fragments across deltas', () => {
    const result = extractReasoning({
      reasoning_details: [
        { type: 'reasoning.text', text: 'The', index: 0, format: 'anthropic-claude-v1' },
        {
          type: 'reasoning.text',
          text: ' kubilot server.',
          index: 0,
          format: 'anthropic-claude-v1',
          signature: 'sig',
        },
      ],
    });
    expect(result).toBe('The kubilot server.');
  });

  it('ignores reasoning.encrypted details for display', () => {
    const result = extractReasoning({
      reasoning_details: [
        { type: 'reasoning.encrypted', data: 'opaque', index: 0 },
        { type: 'reasoning.text', text: 'Visible.', index: 1 },
      ],
    });
    expect(result).toBe('Visible.');
  });
});

describe('extractReasoningFields — signature round-trip', () => {
  it('preserves signature and provider-specific fields on details', () => {
    const details = [
      {
        type: 'reasoning.text',
        text: 'reasoning',
        index: 0,
        format: 'anthropic-claude-v1',
        signature: 'sig',
        id: 'reasoning-text-1',
      },
    ];
    const result = extractReasoningFields({ reasoning_details: details });
    expect(result).not.toBeNull();
    expect(result!.reasoning_details).toEqual(details);
    expect(result!.reasoning_details![0].signature).toBe('sig');
  });
});

describe('mergeReasoningDetails', () => {
  it('merges streamed text fragments of one block into a single entry', () => {
    const merged = mergeReasoningDetails(undefined, [
      { type: 'reasoning.text', text: 'The', index: 0, format: 'anthropic-claude-v1' },
    ]);
    const result = mergeReasoningDetails(merged, [
      {
        type: 'reasoning.text',
        text: ' kubilot server.',
        index: 0,
        format: 'anthropic-claude-v1',
        signature: 'sig',
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('reasoning.text');
    expect(result[0].text).toBe('The kubilot server.');
    expect(result[0].signature).toBe('sig');
    expect(result[0].index).toBe(0);
    expect(result[0].format).toBe('anthropic-claude-v1');
  });

  it('preserves the signature when an earlier delta already carried one', () => {
    const withSig = mergeReasoningDetails(undefined, [
      {
        type: 'reasoning.text',
        text: 'part one',
        index: 0,
        format: 'anthropic-claude-v1',
        signature: 'sig',
      },
    ]);
    const result = mergeReasoningDetails(withSig, [
      // A later delta with `signature: null` must not erase
      // the previously captured signature.
      {
        type: 'reasoning.text',
        text: ' part two',
        index: 0,
        format: 'anthropic-claude-v1',
        signature: null,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('part one part two');
    expect(result[0].signature).toBe('sig');
  });

  it('keeps distinct reasoning blocks separate by index', () => {
    const result = mergeReasoningDetails(undefined, [
      { type: 'reasoning.text', text: 'block zero ', index: 0, format: 'anthropic-claude-v1' },
      { type: 'reasoning.text', text: 'part a', index: 0, format: 'anthropic-claude-v1' },
      {
        type: 'reasoning.text',
        text: 'block one',
        index: 1,
        format: 'anthropic-claude-v1',
        signature: 'sig2',
      },
      { type: 'reasoning.text', text: ' part b', index: 0, format: 'anthropic-claude-v1' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('block zero part a part b');
    expect(result[0].index).toBe(0);
    expect(result[1].text).toBe('block one');
    expect(result[1].index).toBe(1);
    expect(result[1].signature).toBe('sig2');
  });

  it('keeps distinct detail types separate within the same block index', () => {
    const result = mergeReasoningDetails(undefined, [
      { type: 'reasoning.text', text: 'thinking text', index: 0, format: 'anthropic-claude-v1' },
      {
        type: 'reasoning.summary',
        summary: 'summary part',
        index: 0,
        format: 'anthropic-claude-v1',
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('reasoning.text');
    expect(result[0].text).toBe('thinking text');
    expect(result[1].type).toBe('reasoning.summary');
    expect(result[1].summary).toBe('summary part');
  });

  it('returns an empty array for undefined existing and empty incoming', () => {
    expect(mergeReasoningDetails(undefined, [])).toEqual([]);
  });

  it('does not mutate the previously accumulated array', () => {
    const first = mergeReasoningDetails(undefined, [
      { type: 'reasoning.text', text: 'a', index: 0, format: 'f' },
    ]);
    mergeReasoningDetails(first, [{ type: 'reasoning.text', text: 'b', index: 0, format: 'f' }]);
    expect(first).toHaveLength(1);
    expect(first[0].text).toBe('a');
  });

  it('merges deltas that omit index/format into the same block (wildcard)', () => {
    // Reproduces the OpenRouter streaming shape that caused
    // "Invalid signature in thinking block": the first delta
    // carries `index`/`format` but no signature, while the
    // final delta carries the `signature` but omits
    // `index`/`format`. The strict (type+index+format) key
    // would split these into two entries — the first without
    // a signature — which the upstream provider rejects.
    const result = mergeReasoningDetails(undefined, [
      { type: 'reasoning.text', text: 'The', index: 0, format: 'anthropic-claude-v1' },
      { type: 'reasoning.text', text: ' kubilot', signature: 'sig' },
      { type: 'reasoning.text', text: ' server.', signature: 'sig' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('reasoning.text');
    expect(result[0].text).toBe('The kubilot server.');
    expect(result[0].index).toBe(0);
    expect(result[0].format).toBe('anthropic-claude-v1');
    expect(result[0].signature).toBe('sig');
  });

  it('merges deltas that carry only the signature on the final chunk', () => {
    // The opposite shape: every text delta omits the
    // identity fields; only the final (empty-text) delta
    // carries signature + index + format.
    const result = mergeReasoningDetails(undefined, [
      { type: 'reasoning.text', text: 'The' },
      { type: 'reasoning.text', text: ' kubilot' },
      {
        type: 'reasoning.text',
        text: ' server.',
        index: 0,
        format: 'anthropic-claude-v1',
        signature: 'sig',
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('The kubilot server.');
    expect(result[0].index).toBe(0);
    expect(result[0].format).toBe('anthropic-claude-v1');
    expect(result[0].signature).toBe('sig');
  });

  it('keeps distinct indexed blocks separate even with wildcard deltas', () => {
    // Two real blocks (index 0 and 1), each fully identified,
    // must stay separate even though matching is wildcard.
    const result = mergeReasoningDetails(undefined, [
      { type: 'reasoning.text', text: 'block zero ', index: 0, format: 'f' },
      { type: 'reasoning.text', text: 'block one', index: 1, format: 'f' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(0);
    expect(result[1].index).toBe(1);
  });
});
