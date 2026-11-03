import { describe, it, expect } from 'vitest';
import { replaceUnpairedSurrogates, unpairedSurrogateReplacer } from './string-sanitize.js';

describe('replaceUnpairedSurrogates', () => {
  it('returns ASCII strings unchanged', () => {
    expect(replaceUnpairedSurrogates('hello world')).toBe('hello world');
  });

  it('keeps intact surrogate pairs (astral characters) unchanged', () => {
    const emoji = '\u{1F7E2}'; // green circle: \uD83D\uDFE2
    const text = `Cur ${emoji} 93</td><td>`;
    expect(replaceUnpairedSurrogates(text)).toBe(text);
  });

  it('replaces a lone leading surrogate with U+FFFD', () => {
    // Simulates a tool result truncated in the middle of an astral
    // character: only the leading half of the surrogate pair survived.
    const truncated = '<td>\uD83D [match at col 136 \u00b7 line truncated]';
    const sanitized = replaceUnpairedSurrogates(truncated);
    expect(sanitized).toBe('<td>\uFFFD [match at col 136 \u00b7 line truncated]');
    expect(sanitized).not.toContain('\uD83D');
  });

  it('replaces a lone trailing surrogate with U+FFFD', () => {
    const sanitized = replaceUnpairedSurrogates('x\uDFE2y');
    expect(sanitized).toBe('x\uFFFDy');
  });

  it('replaces all unpaired surrogates in a string', () => {
    const sanitized = replaceUnpairedSurrogates('\uD83Da\uD83Db');
    expect(sanitized).toBe('\uFFFDa\uFFFDb');
  });

  it('keeps a leading surrogate paired across adjacent string content', () => {
    const pair = '\uD83D\uDD34'; // red circle
    expect(replaceUnpairedSurrogates(`${pair}!`)).toBe(`${pair}!`);
  });
});

describe('unpairedSurrogateReplacer', () => {
  it('passes non-string values through unchanged', () => {
    expect(unpairedSurrogateReplacer('k', 42)).toBe(42);
    expect(unpairedSurrogateReplacer('k', null)).toBe(null);
    expect(unpairedSurrogateReplacer('k', true)).toBe(true);
    const obj = { a: 1 };
    expect(unpairedSurrogateReplacer('k', obj)).toBe(obj);
  });

  it('sanitizes string values', () => {
    expect(unpairedSurrogateReplacer('k', 'a\uD83Db')).toBe('a\uFFFDb');
  });

  it('makes JSON.stringify output well-formed for poisoned histories', () => {
    // Regression shape from a real-world failure: a conversation
    // history containing a tool result truncated mid-emoji. Without
    // the replacer the serialized body contains a lone "\ud83d"
    // escape which strict JSON parsers reject with a 400 error.
    const body = {
      model: 'zai-org/GLM-5.3',
      messages: [{ role: 'tool', content: 'row \uD83D [match at col 136 \u00b7 truncated]' }],
    };
    const json = JSON.stringify(body, unpairedSurrogateReplacer);
    expect(json).not.toMatch(/\\ud[89ab][0-9a-f]{2}(?!\\u[dD][cdef][0-9a-f]{2})/);
    // U+FFFD is printable, so JSON.stringify emits it as a raw character.
    expect(json).toContain('\uFFFD');
    // Round-trips cleanly.
    expect(JSON.parse(json).messages[0].content).toBe(
      'row \uFFFD [match at col 136 \u00b7 truncated]',
    );
  });

  it('keeps valid emoji intact through serialization', () => {
    const body = { content: 'Cur \uD83D\uDFE1 Avg \uD83D\uDFE1' };
    const json = JSON.stringify(body, unpairedSurrogateReplacer);
    expect(json).toContain('Cur \uD83D\uDFE1 Avg \uD83D\uDFE1');
  });
});
