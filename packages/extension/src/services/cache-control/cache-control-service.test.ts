import { describe, it, expect } from 'vitest';
import type { CacheControlConfig } from '@tokenguard/shared';
import type {
  OpenAIMessage,
  OpenAIContentPart,
  OpenAIContentPartUnion,
} from '../chat-handler/index.js';
import { CacheControlService } from './cache-control-service.js';

/** Helper to create a basic config. */
function cfg(overrides: Partial<CacheControlConfig> = {}): CacheControlConfig {
  return {
    enabled: true,
    maxMarkers: 2,
    ...overrides,
  };
}

/** Helper to create a simple text message. */
function msg(
  role: OpenAIMessage['role'],
  content: string | OpenAIContentPartUnion[] | null,
): OpenAIMessage {
  return { role, content };
}

describe('CacheControlService.injectMarkers', () => {
  it('places one marker on a single message with string content', () => {
    const messages: OpenAIMessage[] = [msg('user', 'hello')];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 1 }));

    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual([
      {
        type: 'text',
        text: 'hello',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('marks last message and first message with maxMarkers=2', () => {
    const messages: OpenAIMessage[] = [
      msg('system', 'sys'),
      msg('user', 'u1'),
      msg('assistant', 'a1'),
      msg('user', 'u2'),
      msg('assistant', 'a2'),
    ];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 2 }));

    // Last content message = message 4 ('a2')
    expect(result[4].content).toEqual([
      {
        type: 'text',
        text: 'a2',
        cache_control: { type: 'ephemeral' },
      },
    ]);

    // First content message = message 0 ('sys')
    expect(result[0].content).toEqual([
      {
        type: 'text',
        text: 'sys',
        cache_control: { type: 'ephemeral' },
      },
    ]);

    // Middle messages unchanged
    expect(result[1].content).toBe('u1');
    expect(result[2].content).toBe('a1');
    expect(result[3].content).toBe('u2');
  });

  it('skips null-content messages when marking from start', () => {
    const messages: OpenAIMessage[] = [
      msg('assistant', null), // null — skipped
      msg('system', 'sys'),
      msg('assistant', null), // null — skipped
      msg('user', 'u1'),
    ];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 2 }));

    // Last non-null = message 3 ('u1')
    expect(result[3].content).toEqual([
      {
        type: 'text',
        text: 'u1',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    // First non-null from start = message 1 ('sys')
    expect(result[1].content).toEqual([
      {
        type: 'text',
        text: 'sys',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    expect(result[0].content).toBeNull();
    expect(result[2].content).toBeNull();
  });

  it('marks forward from start filling markers in order', () => {
    const messages: OpenAIMessage[] = [
      msg('system', 'sys'),
      msg('user', 'u1'),
      msg('assistant', 'a1'),
      msg('user', 'u2'),
      msg('assistant', 'a2'),
    ];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 4 }));

    // Last = a2 (index 4), then forward from start: sys(0), u1(1), a1(2)
    expect(result[0].content).toEqual([
      { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
    ]);
    expect(result[1].content).toEqual([
      { type: 'text', text: 'u1', cache_control: { type: 'ephemeral' } },
    ]);
    expect(result[2].content).toEqual([
      { type: 'text', text: 'a1', cache_control: { type: 'ephemeral' } },
    ]);
    expect(result[3].content).toBe('u2');
    expect(result[4].content).toEqual([
      { type: 'text', text: 'a2', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('does not exceed available content messages when maxMarkers is large', () => {
    const messages: OpenAIMessage[] = [msg('user', 'u1'), msg('assistant', 'a1')];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 10 }));

    // Both messages should have markers
    expect(result[0].content).toEqual([
      {
        type: 'text',
        text: 'u1',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    expect(result[1].content).toEqual([
      {
        type: 'text',
        text: 'a1',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('converts string content to OpenAIContentPart[] when marked', () => {
    const messages: OpenAIMessage[] = [msg('user', 'hello world')];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 1 }));

    const content = result[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toEqual([
      {
        type: 'text',
        text: 'hello world',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('skips injection when any block has existing cache_control', () => {
    const parts: OpenAIContentPart[] = [
      {
        type: 'text',
        text: 'cached',
        cache_control: { type: 'ephemeral' },
      },
    ];
    const messages: OpenAIMessage[] = [msg('user', parts), msg('assistant', 'a1')];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 2 }));

    // Returns the exact same array reference
    expect(result).toBe(messages);
  });

  it('includes ttl in marker when configured', () => {
    const messages: OpenAIMessage[] = [msg('user', 'hello')];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 1, ttl: '5m' }));

    expect(result[0].content).toEqual([
      {
        type: 'text',
        text: 'hello',
        cache_control: { type: 'ephemeral', ttl: 300 },
      },
    ]);
  });

  it('includes 1h ttl in marker', () => {
    const messages: OpenAIMessage[] = [msg('user', 'hello')];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 1, ttl: '1h' }));

    expect(result[0].content).toEqual([
      {
        type: 'text',
        text: 'hello',
        cache_control: { type: 'ephemeral', ttl: 3600 },
      },
    ]);
  });

  it('omits ttl from marker when not configured', () => {
    const messages: OpenAIMessage[] = [msg('user', 'hello')];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 1 }));

    const content = result[0].content as OpenAIContentPart[];
    expect(content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect('ttl' in content[0].cache_control!).toBe(false);
  });

  it('returns empty array for empty messages', () => {
    const result = CacheControlService.injectMarkers([], cfg());
    expect(result).toEqual([]);
  });

  it('returns unchanged array when all messages are contentless', () => {
    const messages: OpenAIMessage[] = [msg('assistant', null), msg('assistant', null)];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 2 }));

    // No markers placed — same content
    expect(result[0].content).toBeNull();
    expect(result[1].content).toBeNull();
  });

  it('marks last and first with maxMarkers=2 regardless of message count', () => {
    const messages: OpenAIMessage[] = [
      msg('system', 'sys'),
      msg('user', 'u1'),
      msg('assistant', 'a1'),
    ];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 2 }));

    // Last = a1, first = sys
    expect(result[2].content).toEqual([
      {
        type: 'text',
        text: 'a1',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    expect(result[0].content).toEqual([
      {
        type: 'text',
        text: 'sys',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    // u1 unchanged
    expect(result[1].content).toBe('u1');
  });

  it('marks only the last message when maxMarkers=1', () => {
    const messages: OpenAIMessage[] = [
      msg('system', 'sys'),
      msg('user', 'u1'),
      msg('assistant', 'a1'),
    ];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 1 }));

    // Only last message gets a marker
    expect(result[2].content).toEqual([
      {
        type: 'text',
        text: 'a1',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    expect(result[0].content).toBe('sys');
    expect(result[1].content).toBe('u1');
  });

  it('adds cache_control to last content part for array content', () => {
    const parts: OpenAIContentPart[] = [
      { type: 'text', text: 'part1' },
      { type: 'text', text: 'part2' },
    ];
    const messages: OpenAIMessage[] = [msg('user', parts)];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 1 }));

    // Last part = part2, should have marker
    const content = result[0].content as OpenAIContentPart[];
    expect(content[0]).toEqual({ type: 'text', text: 'part1' });
    expect(content[1]).toEqual({
      type: 'text',
      text: 'part2',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('does not mutate the original messages array', () => {
    const messages: OpenAIMessage[] = [msg('user', 'hello'), msg('assistant', 'world')];
    const original = JSON.parse(JSON.stringify(messages));
    CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 2 }));

    expect(messages).toEqual(original);
  });

  it('handles null-content messages interspersed throughout', () => {
    const messages: OpenAIMessage[] = [
      msg('assistant', null),
      msg('system', 'sys'),
      msg('assistant', null),
      msg('user', 'u1'),
      msg('assistant', null),
    ];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 3 }));

    // Last non-null = message 3 ('u1')
    expect(result[3].content).toEqual([
      { type: 'text', text: 'u1', cache_control: { type: 'ephemeral' } },
    ]);
    // First non-null from start = message 1 ('sys')
    expect(result[1].content).toEqual([
      { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
    ]);
    // Nulls unchanged
    expect(result[0].content).toBeNull();
    expect(result[2].content).toBeNull();
    expect(result[4].content).toBeNull();
  });

  it('places cache control on last part when message has image parts', () => {
    const messages: OpenAIMessage[] = [
      msg('user', 'Hello'),
      msg('user', [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ]),
    ];
    const result = CacheControlService.injectMarkers(messages, cfg({ maxMarkers: 2 }));

    expect(result[0].content).toEqual([
      { type: 'text', text: 'Hello', cache_control: { type: 'ephemeral' } },
    ]);
    expect(result[1].content).toEqual([
      {
        type: 'text',
        text: 'What is in this image?',
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,abc' },
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });
});
