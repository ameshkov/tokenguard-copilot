import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  computeFingerprint,
  computeMessageFingerprint,
  type FingerprintMessage,
  type FingerprintToolCall,
} from './fingerprint.js';

/** SHA-256 hex digest helper for expected values. */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('computeFingerprint', () => {
  it('hashes system+user prefix and assistant content on turn 2+', () => {
    const messages: FingerprintMessage[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'Follow-up' },
    ];

    const result = computeFingerprint(messages);

    const expected = sha256('You are helpful\0Hello\0Hi there');
    expect(result).toBe(expected);
  });

  it('uses tool_calls[0].id as key part when assistant has tool calls', () => {
    const messages: FingerprintMessage[] = [
      { role: 'user', content: 'Call a tool' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_abc123' }],
      },
    ];

    const result = computeFingerprint(messages);

    const expected = sha256('Call a tool\0call_abc123');
    expect(result).toBe(expected);
  });

  it('uses firstAssistant.content on turn 1 (no assistant in messages)', () => {
    const messages: FingerprintMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Question' },
    ];

    const result = computeFingerprint(messages, {
      content: 'Answer',
    });

    const expected = sha256('System prompt\0Question\0Answer');
    expect(result).toBe(expected);
  });

  it('uses firstAssistant.firstToolCallId on turn 1 when provided', () => {
    const messages: FingerprintMessage[] = [{ role: 'user', content: 'Do something' }];

    const result = computeFingerprint(messages, {
      content: '',
      firstToolCallId: 'call_xyz',
    });

    const expected = sha256('Do something\0call_xyz');
    expect(result).toBe(expected);
  });

  it('handles content-part arrays via extractTextContent', () => {
    const messages: FingerprintMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Part A' },
          { type: 'text', text: 'Part B' },
        ],
      },
      { role: 'assistant', content: 'Response' },
    ];

    const result = computeFingerprint(messages);

    const expected = sha256('Part APart B\0Response');
    expect(result).toBe(expected);
  });

  it('skips tool role messages in prefix', () => {
    const messages: FingerprintMessage[] = [
      { role: 'system', content: 'Sys' },
      { role: 'user', content: 'Ask' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1' }] },
      { role: 'tool', content: 'Tool result' },
      { role: 'assistant', content: 'Final' },
    ];

    const result = computeFingerprint(messages);

    // Only system+user in prefix, key part is first
    // assistant's tool_calls[0].id
    const expected = sha256('Sys\0Ask\0c1');
    expect(result).toBe(expected);
  });

  it('returns null when no key part can be determined', () => {
    const messages: FingerprintMessage[] = [{ role: 'user', content: 'Hello' }];

    // No firstAssistant provided, no assistant in messages
    const result = computeFingerprint(messages);

    expect(result).toBeNull();
  });

  it('returns null when messages are empty and no firstAssistant', () => {
    expect(computeFingerprint([])).toBeNull();
  });

  it('is deterministic — same input produces same hash', () => {
    const messages: FingerprintMessage[] = [{ role: 'user', content: 'Determinism test' }];
    const first = computeFingerprint(messages, {
      content: 'Same answer',
    });
    const second = computeFingerprint(messages, {
      content: 'Same answer',
    });

    expect(first).toBe(second);
    expect(first).not.toBeNull();
  });

  it('ignores firstAssistant param when assistant is in messages', () => {
    const messages: FingerprintMessage[] = [
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: 'A' },
    ];

    const withParam = computeFingerprint(messages, {
      content: 'Different',
    });
    const withoutParam = computeFingerprint(messages);

    expect(withParam).toBe(withoutParam);
  });
});

describe('computeMessageFingerprint', () => {
  it('hashes content-only message', () => {
    const fp = computeMessageFingerprint('Hello world', undefined);

    expect(fp).not.toBeNull();
    expect(fp).toBe(sha256(JSON.stringify({ content: 'Hello world', tool_calls: null })));
  });

  it('hashes tool-calls-only message', () => {
    const toolCalls: FingerprintToolCall[] = [
      { id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
    ];

    const fp = computeMessageFingerprint(null, toolCalls);

    expect(fp).not.toBeNull();
    expect(fp).toBe(
      sha256(
        JSON.stringify({
          content: null,
          tool_calls: [
            { function: { arguments: '{"city":"NYC"}', name: 'get_weather' }, id: 'call_1' },
          ],
        }),
      ),
    );
  });

  it('hashes message with both content and tool calls', () => {
    const toolCalls: FingerprintToolCall[] = [
      { id: 'call_1', function: { name: 'fn', arguments: '{}' } },
    ];

    const fp = computeMessageFingerprint('Some text', toolCalls);

    expect(fp).not.toBeNull();
  });

  it('treats empty string and null content as equivalent', () => {
    const fpNull = computeMessageFingerprint(null, [
      { id: 'c1', function: { name: 'fn', arguments: '{}' } },
    ]);
    const fpEmpty = computeMessageFingerprint('', [
      { id: 'c1', function: { name: 'fn', arguments: '{}' } },
    ]);

    expect(fpNull).toBe(fpEmpty);
  });

  it('sorts tool calls by id', () => {
    const tc1: FingerprintToolCall[] = [
      { id: 'b', function: { name: 'fn_b', arguments: '{}' } },
      { id: 'a', function: { name: 'fn_a', arguments: '{}' } },
    ];
    const tc2: FingerprintToolCall[] = [
      { id: 'a', function: { name: 'fn_a', arguments: '{}' } },
      { id: 'b', function: { name: 'fn_b', arguments: '{}' } },
    ];

    expect(computeMessageFingerprint(null, tc1)).toBe(computeMessageFingerprint(null, tc2));
  });

  it('is deterministic', () => {
    const fp1 = computeMessageFingerprint('Same content');
    const fp2 = computeMessageFingerprint('Same content');

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBeNull();
  });

  it('returns null for null content and no tool calls', () => {
    expect(computeMessageFingerprint(null)).toBeNull();
  });

  it('returns null for empty content and no tool calls', () => {
    expect(computeMessageFingerprint('')).toBeNull();
  });

  it('returns null for empty content and empty tool calls array', () => {
    expect(computeMessageFingerprint(null, [])).toBeNull();
  });

  it('handles content-part arrays via extractTextContent', () => {
    const fpParts = computeMessageFingerprint([
      { type: 'text', text: 'Part A' },
      { type: 'text', text: 'Part B' },
    ]);
    const fpString = computeMessageFingerprint('Part APart B');

    expect(fpParts).toBe(fpString);
  });

  it('different content produces different fingerprint', () => {
    const fp1 = computeMessageFingerprint('Answer A');
    const fp2 = computeMessageFingerprint('Answer B');

    expect(fp1).not.toBe(fp2);
  });
});
