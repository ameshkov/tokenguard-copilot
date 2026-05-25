import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { ReasoningCacheRepository } from '../../repositories/reasoning-cache-repository.js';
import { ReasoningCacheService } from './reasoning-cache-service.js';
import type { OpenAIMessage } from '../chat-handler/chat-handler.js';
import type { ReasoningFields } from '../../utils/reasoning.js';

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
    firstToolCallId?: string;
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
    svc = new ReasoningCacheService(repo);
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

    // This would inject reasoning if enabled, but it's not
    step(svc, msgs, false, {
      content: 'Hello',
      fields: { reasoning_content: 'thinking...' },
    });

    // Because preserveReasoning=false, cacheReasoning should
    // NOT have been called and therefore get returns null
    const cached = repo.get('irrelevant', 0);
    expect(cached).toBeNull();
  });

  it('cacheReasoning with null fields is a no-op', () => {
    const msgs: OpenAIMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];
    svc.cacheReasoning(msgs, null, { content: 'Hello' }, true);
    // Nothing should be cached
    const cached = repo.get('irrelevant', 0);
    expect(cached).toBeNull();
  });

  // --- Multi-turn scenarios ---

  it('Turn 1 error: no cache stored', () => {
    const turn1Messages: OpenAIMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
    ];
    // On error, cacheReasoning is NOT called
    svc.backfillReasoning(turn1Messages, true);
    // No cacheReasoning call simulates HTTP error
    // Repository should be empty
    const allCached = repo.get('any', 0);
    expect(allCached).toBeNull();
  });

  it('Turn 1 text → Turn 2 backfill', () => {
    const turn1Messages: OpenAIMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
    ];

    // Turn 1: cache reasoning after text response
    step(svc, turn1Messages, true, {
      content: 'Hi there!',
      fields: { reasoning_content: 'I should greet the user.' },
    });

    // Turn 2: add assistant message to history, backfill should inject
    const turn2Messages: OpenAIMessage[] = [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: 'Hi there!',
        // No reasoning fields — should be backfilled
      },
      { role: 'user', content: 'How are you?' },
    ];

    step(svc, turn2Messages, true);

    // Assistant message at index 0 should have reasoning injected
    expect(turn2Messages[2].reasoning_content).toBe('I should greet the user.');
    expect(turn2Messages[2].reasoning).toBe('I should greet the user.');
    expect(turn2Messages[2].reasoning_details).toBeDefined();
  });

  it('Turn 2 second assistant → Turn 3 backfill both', () => {
    // Turn 1
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Hi' }];
    step(svc, t1, true, {
      content: 'Hello!',
      fields: { reasoning_content: 'R1' },
    });

    // Turn 2
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'More?' },
    ];
    step(svc, t2, true, {
      content: 'Sure!',
      fields: { reasoning_content: 'R2' },
    });

    // Turn 3: both assistants should get reasoning
    const t3: OpenAIMessage[] = [
      { role: 'user', content: 'Hi' },
      {
        role: 'assistant',
        content: 'Hello!',
      },
      { role: 'user', content: 'More?' },
      {
        role: 'assistant',
        content: 'Sure!',
      },
      { role: 'user', content: 'Again?' },
    ];

    step(svc, t3, true);

    // First assistant gets R1
    expect(t3[1].reasoning_content).toBe('R1');
    // Second assistant gets R2
    expect(t3[3].reasoning_content).toBe('R2');
  });

  it('Turn 3 fingerprint ignores second assistant', () => {
    // Turn 1: tool call
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Weather?' }];
    step(svc, t1, true, {
      content: '',
      firstToolCallId: 'call_1',
      fields: { reasoning_content: 'R1' },
    });

    // Add assistant1 tool call to messages for Turn 2
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

    // Turn 3: fingerprint should still be based on first assistant (call_1)
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
      {
        role: 'assistant',
        content: 'It is sunny!',
      },
    ];

    step(svc, t3, true);

    // Both assistants should have reasoning
    expect(t3[1].reasoning_content).toBe('R1');
    expect(t3[3].reasoning_content).toBe('R2');
  });

  it('Tool call fingerprint uses tool_calls[0].id', () => {
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Do something' }];

    step(svc, t1, true, {
      content: '', // No text content since tool call
      firstToolCallId: 'call_abc',
      fields: { reasoning_content: 'tool thinking' },
    });

    // Turn 2: fingerprint computed from tool_calls[0].id
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Do something' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'do_stuff',
              arguments: '{}',
            },
          },
        ],
      },
    ];

    step(svc, t2, true);

    expect(t2[1].reasoning_content).toBe('tool thinking');
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

    // Turn 2
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
    // Pre-populate cache with full reasoning
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Long answer',
      fields: {
        reasoning_content: 'This is the full chain of thought.',
      },
    });

    // Turn 2: agent supplies a placeholder
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: 'Long answer',
        reasoning_content: '.',
      },
    ];

    step(svc, t2, true);

    // Placeholder should be replaced with cached
    expect(t2[1].reasoning_content).toBe('This is the full chain of thought.');
  });

  it('Agent already has full reasoning, no replacement', () => {
    // Pre-populate cache
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Answer',
      fields: {
        reasoning_content: 'Cached reasoning.',
      },
    });

    // Turn 2: agent provides its own non-trivial reasoning
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: 'Answer',
        reasoning_content: 'Agent-provided long reasoning.',
      },
    ];

    step(svc, t2, true);

    // Agent's reasoning should NOT be overwritten
    expect(t2[1].reasoning_content).toBe('Agent-provided long reasoning.');
  });

  it('Agent supplies one field → copied to all three', () => {
    // Pre-populate cache
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Answer',
      fields: {
        reasoning_content: 'Cached R',
        reasoning_details: [{ type: 'text', text: 'Cached detail' }],
      },
    });

    // Turn 2: agent only provides reasoning field
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: 'Answer',
        reasoning: 'Agent reasoning field',
      },
    ];

    step(svc, t2, true);

    // All three fields should be populated with the longest
    expect(t2[1].reasoning_content).toBe('Agent reasoning field');
    expect(t2[1].reasoning).toBe('Agent reasoning field');
    // reasoning_details should come from cached details
    expect(t2[1].reasoning_details).toEqual([{ type: 'text', text: 'Cached detail' }]);
  });

  it('Agent supplies no reasoning fields → cached injected', () => {
    // Pre-populate cache
    const t1: OpenAIMessage[] = [{ role: 'user', content: 'Q' }];
    step(svc, t1, true, {
      content: 'Answer',
      fields: {
        reasoning_content: 'Cached thought.',
        reasoning: 'Cached plaintext.',
        reasoning_details: [{ type: 'text', text: 'Cached detail' }],
      },
    });

    // Turn 2: agent provides no reasoning fields
    const t2: OpenAIMessage[] = [
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: 'Answer',
      },
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

    // Check user/system messages are not touched
    expect((t2[0] as OpenAIMessage).reasoning_content).toBeUndefined();
    expect((t2[1] as OpenAIMessage).reasoning_content).toBeUndefined();
    expect((t2[3] as OpenAIMessage).reasoning_content).toBeUndefined();
    // Assistant gets reasoning
    expect(t2[2].reasoning_content).toBe('R');
  });

  it('No reasoning content in response: nothing cached', () => {
    const msgs: OpenAIMessage[] = [{ role: 'user', content: 'Hello' }];
    step(svc, msgs, true, {
      content: 'Hi!',
      fields: null,
    });

    // Caching should have been skipped (fields=null)
    // Any get should return null
    const cached = repo.get('irrelevant', 0);
    expect(cached).toBeNull();
  });
});
