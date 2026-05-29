import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { ReasoningCacheRepository } from '../../repositories/index.js';
import { ReasoningCacheService } from './reasoning-cache-service.js';
import { createMockLogger } from '../../test/mock-logger.js';
import type { OpenAIMessage } from '../chat-handler/index.js';
import type { ReasoningFields, FingerprintToolCall } from '../../utils/index.js';

/**
 * Helper to simulate one request/response cycle:
 * 1. Backfill reasoning into messages
 * 2. Cache reasoning from response (if given)
 * 3. Return messages for next turn
 */
function step(
  svc: ReasoningCacheService,
  messages: OpenAIMessage[],
  preserve: boolean,
  response?: {
    content: string;
    toolCalls?: FingerprintToolCall[];
    fields: ReasoningFields | null;
  },
): OpenAIMessage[] {
  svc.backfillReasoning(messages, preserve);
  if (response) {
    svc.cacheReasoning(messages, response.fields, response, preserve);
  }
  return messages;
}

describe('ReasoningCacheService', () => {
  const { db, raw } = createTestDb();
  let repo: ReasoningCacheRepository;
  let svc: ReasoningCacheService;

  beforeEach(() => {
    clearTestDb(raw);
    repo = new ReasoningCacheRepository(db);
    svc = new ReasoningCacheService(repo, createMockLogger());
  });

  // --- Edge cases ---

  it('backfillReasoning with preserveReasoning=false is a no-op', () => {
    const msgs: OpenAIMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];
    const before = JSON.stringify(msgs);
    svc.backfillReasoning(msgs, false);
    expect(JSON.stringify(msgs)).toBe(before);
  });

  it('backfillReasoning with no assistant messages is a no-op', () => {
    const msgs: OpenAIMessage[] = [{ role: 'user', content: 'Hello' }];
    const before = JSON.stringify(msgs);
    svc.backfillReasoning(msgs, true);
    expect(JSON.stringify(msgs)).toBe(before);
  });

  it('cacheReasoning with preserveReasoning=false is a no-op', () => {
    const msgs: OpenAIMessage[] = [{ role: 'user', content: 'Hi' }];
    step(svc, msgs, false, {
      content: 'Hello',
      fields: { reasoning_content: 'thinking...' },
    });

    // Verify nothing was cached by attempting a backfill
    // on the same conversation — reasoning should NOT
    // appear because cacheReasoning was a no-op.
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ];
    svc.backfillReasoning(t2, true);

    // Placeholder injected (no cache hit), not the
    // original 'thinking...' value.
    expect(t2[1].reasoning_content).toBe('.');
  });

  it('cacheReasoning with null fields is a no-op', () => {
    const msgs: OpenAIMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];
    svc.cacheReasoning(msgs, null, { content: 'Hello' }, true);

    // Verify nothing was cached by attempting a backfill.
    const t2: OpenAIMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ];
    svc.backfillReasoning(t2, true);

    // Placeholder injected (no cache hit), not a real value.
    expect(t2[2].reasoning_content).toBe('.');
  });

  // --- Multi-turn scenarios ---

  it('Turn 1 error: no cache stored', () => {
    const turn1Messages: OpenAIMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
    ];
    // On error, cacheReasoning is NOT called
    svc.backfillReasoning(turn1Messages, true);

    // Verify nothing was cached: simulate Turn 2 and check
    // that no reasoning was backfilled from cache.
    const t2: OpenAIMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Some response' },
    ];
    svc.backfillReasoning(t2, true);

    // Only placeholder — no real reasoning was cached.
    expect(t2[2].reasoning_content).toBe('.');
  });

  it('Turn 1 text -> Turn 2 backfill', () => {
    const t1: OpenAIMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
    ];
    step(svc, t1, true, {
      content: 'Hi there!',
      fields: {
        reasoning_content: 'I should greet the user.',
      },
    });

    const t2: OpenAIMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
    ];
    step(svc, t2, true);

    expect(t2[2].reasoning_content).toBe('I should greet the user.');
    expect(t2[2].reasoning).toBe('I should greet the user.');
    expect(t2[2].reasoning_details).toBeDefined();
  });

  it('Turn 2 second assistant -> Turn 3 backfill both', () => {
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Hi' }];
    step(svc, t1, true, {
      content: 'Hello!',
      fields: { reasoning_content: 'R1' },
    });

    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'More?' },
    ];
    step(svc, t2, true, {
      content: 'Sure!',
      fields: { reasoning_content: 'R2' },
    });

    const t3: OpenAIMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'More?' },
      { role: 'assistant', content: 'Sure!' },
      { role: 'user', content: 'Again?' },
    ];
    step(svc, t3, true);

    expect(t3[1].reasoning_content).toBe('R1');
    expect(t3[3].reasoning_content).toBe('R2');
  });

  it('Tool call message fingerprint and backfill', () => {
    const toolCalls: FingerprintToolCall[] = [
      {
        id: 'call_1',
        function: {
          name: 'get_weather',
          arguments: '{}',
        },
      },
    ];

    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Weather?' }];
    step(svc, t1, true, {
      content: '',
      toolCalls,
      fields: { reasoning_content: 'R1' },
    });

    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Weather?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: 'Sunny',
        tool_call_id: 'call_1',
      },
    ];
    step(svc, t2, true, {
      content: 'It is sunny!',
      fields: { reasoning_content: 'R2' },
    });

    const t3: OpenAIMessage[] = [
      { role: 'user', content: 'Weather?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: 'Sunny',
        tool_call_id: 'call_1',
      },
      { role: 'assistant', content: 'It is sunny!' },
    ];
    step(svc, t3, true);

    expect(t3[1].reasoning_content).toBe('R1');
    expect(t3[3].reasoning_content).toBe('R2');
  });

  it('Multiple system/user before first assistant', () => {
    const msgs: OpenAIMessage[] = [
      { role: 'system', content: 'A' },
      { role: 'user', content: 'B' },
      { role: 'system', content: 'C' },
      { role: 'user', content: 'D' },
    ];
    step(svc, msgs, true, {
      content: 'Reply',
      fields: { reasoning_content: 'multi prefix' },
    });

    const t2: OpenAIMessage[] = [
      { role: 'system', content: 'A' },
      { role: 'user', content: 'B' },
      { role: 'system', content: 'C' },
      { role: 'user', content: 'D' },
      { role: 'assistant', content: 'Reply' },
    ];
    step(svc, t2, true);
    expect(t2[4].reasoning_content).toBe('multi prefix');
  });

  it('Agent-supplied placeholder (short) replaced by cached', () => {
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Long answer',
      fields: {
        reasoning_content: 'This is the full chain of thought.',
      },
    });

    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: 'Long answer',
        reasoning_content: '.',
      },
    ];
    step(svc, t2, true);

    expect(t2[1].reasoning_content).toBe('This is the full chain of thought.');
  });

  it('Agent already has full reasoning, no replacement', () => {
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Answer',
      fields: { reasoning_content: 'Cached reasoning.' },
    });

    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: 'Answer',
        reasoning_content: 'Agent-provided long reasoning.',
      },
    ];
    step(svc, t2, true);

    expect(t2[1].reasoning_content).toBe('Agent-provided long reasoning.');
  });

  it('Agent supplies one field -> copied to all three', () => {
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Answer',
      fields: {
        reasoning_content: 'Cached R',
        reasoning_details: [{ type: 'text', text: 'Cached detail' }],
      },
    });

    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: 'Answer',
        reasoning: 'Agent reasoning field',
      },
    ];
    step(svc, t2, true);

    expect(t2[1].reasoning_content).toBe('Agent reasoning field');
    expect(t2[1].reasoning).toBe('Agent reasoning field');
    expect(t2[1].reasoning_details).toEqual([{ type: 'text', text: 'Cached detail' }]);
  });

  it('Agent supplies no reasoning fields -> cached injected', () => {
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Answer',
      fields: {
        reasoning_content: 'Cached thought.',
        reasoning: 'Cached plaintext.',
        reasoning_details: [{ type: 'text', text: 'Cached detail' }],
      },
    });

    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: 'Answer' },
    ];
    step(svc, t2, true);

    expect(t2[1].reasoning_content).toBe('Cached thought.');
    expect(t2[1].reasoning).toBe('Cached plaintext.');
    expect(t2[1].reasoning_details).toEqual([{ type: 'text', text: 'Cached detail' }]);
  });

  it('User and system messages are not modified', () => {
    const t1: OpenAIMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ];
    step(svc, t1, true, {
      content: 'Hi!',
      fields: { reasoning_content: 'R' },
    });

    const t2: OpenAIMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Again' },
    ];
    step(svc, t2, true);

    expect((t2[0] as OpenAIMessage).reasoning_content).toBeUndefined();
    expect((t2[1] as OpenAIMessage).reasoning_content).toBeUndefined();
    expect((t2[3] as OpenAIMessage).reasoning_content).toBeUndefined();
    expect(t2[2].reasoning_content).toBe('R');
  });

  it('No reasoning content in response: nothing cached', () => {
    const msgs: OpenAIMessage[] = [{ role: 'user', content: 'Hello' }];
    step(svc, msgs, true, {
      content: 'Hi!',
      fields: null,
    });

    // Verify nothing was cached by attempting a backfill.
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];
    svc.backfillReasoning(t2, true);

    // Only placeholder — null fields were not cached.
    expect(t2[1].reasoning_content).toBe('.');
  });

  // --- Placeholder fallback ---

  it('No cache and no agent reasoning -> injects placeholder', () => {
    // Simulate Turn 2 with no prior cache entry for this
    // assistant message content.
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    // Turn 1 returns "Answer A" with reasoning, cached OK
    step(svc, t1, true, {
      content: 'Answer A',
      fields: { reasoning_content: 'R_A' },
    });

    // Turn 2 has a different assistant message "Answer B"
    // that was NOT cached (e.g. from a rollback/re-gen).
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: 'Answer B' },
      { role: 'user', content: 'More?' },
    ];
    step(svc, t2, true);

    // "Answer B" has no cache hit → placeholder injected
    expect(t2[1].reasoning_content).toBe('.');
  });

  // --- Rollback resilience ---

  it('Same assistant content at different index still hits cache', () => {
    // Turn 1: two assistants with reasoning
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Hi' }];
    step(svc, t1, true, {
      content: 'A1',
      fields: { reasoning_content: 'R1' },
    });

    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'More' },
    ];
    step(svc, t2, true, {
      content: 'A2',
      fields: { reasoning_content: 'R2' },
    });

    // Now simulate rollback within the same conversation:
    // user rolls back to after A1, re-asks, and gets A2 again
    // but now A2 appears right after A1 (no "More" user msg).
    // Session FP is the same ("Hi" + "A1"), and A2's message
    // FP is the same regardless of position.
    const rollback: OpenAIMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Something else' },
      { role: 'assistant', content: 'A2' },
      { role: 'user', content: 'Continue' },
    ];
    svc.backfillReasoning(rollback, true);

    // Both get their reasoning: A1 via message FP, A2 via
    // message FP (same session FP because first assistant
    // is still "A1").
    expect(rollback[1].reasoning_content).toBe('R1');
    expect(rollback[3].reasoning_content).toBe('R2');
  });

  it('tool call reorder still hits cache', () => {
    // Turn 1: two tool calls returned in [A, B] order
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Weather?' }];
    step(svc, t1, true, {
      content: '',
      toolCalls: [
        { id: 'call_A', function: { name: 'fn_a', arguments: '{}' } },
        { id: 'call_B', function: { name: 'fn_b', arguments: '{}' } },
      ],
      fields: { reasoning_content: 'R for tool calls' },
    });

    // Turn 2: VS Code returns tool calls in [B, A] order
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Weather?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_B', type: 'function', function: { name: 'fn_b', arguments: '{}' } },
          { id: 'call_A', type: 'function', function: { name: 'fn_a', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: 'Result', tool_call_id: 'call_A' },
      { role: 'tool', content: 'Result', tool_call_id: 'call_B' },
    ];
    step(svc, t2, true);

    // Reasoning from Turn 1 should be found despite
    // reversed tool call order
    expect(t2[1].reasoning_content).toBe('R for tool calls');
  });
});
