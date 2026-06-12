import { describe, it, expect } from 'vitest';
import type { LanguageModelResponsePart, Progress } from 'vscode';
import { mockProgress } from '../../test/chat-handler-test-helpers.js';
import {
  processStreamingDataLine,
  flushToolCalls,
  type StreamingChunkState,
} from './process-streaming-chunk.js';

function makeState(): StreamingChunkState {
  return { pendingToolCalls: new Map() };
}

describe('processStreamingDataLine', () => {
  it('reports content from delta', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    const isDone = processStreamingDataLine(
      JSON.stringify({
        choices: [{ delta: { content: 'Hello' } }],
      }),
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    expect(isDone).toBe(false);
    expect(parts).toHaveLength(1);
    expect(parts[0].value).toBe('Hello');
  });

  it('reports reasoning_content as thinking part', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    processStreamingDataLine(
      JSON.stringify({
        choices: [{ delta: { reasoning_content: 'Let me think...' } }],
      }),
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].value).toBe('Let me think...');
    expect((parts[0] as { metadata?: { presentFields?: string[] } }).metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
  });

  it('reports usage data part', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    processStreamingDataLine(
      JSON.stringify({
        choices: [{ delta: { content: 'Hi' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    const usageParts = parts.filter(
      (p: Record<string, unknown>) =>
        p.constructor?.name === 'LanguageModelDataPart' && p.mimeType === 'usage',
    );
    expect(usageParts.length).toBe(1);
  });

  it('accumulates tool call deltas by index', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    // First chunk: tool call start
    processStreamingDataLine(
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '' },
                },
              ],
            },
          },
        ],
      }),
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    // Should not have flushed yet (no finish_reason)
    expect(parts).toHaveLength(0);
    expect(state.pendingToolCalls.size).toBe(1);

    // Second chunk: argument continuation
    processStreamingDataLine(
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"city":"London"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    // Should have flushed on finish_reason=tool_calls
    expect(parts).toHaveLength(1);
    expect(parts[0].callId).toBe('call_1');
    expect(parts[0].name).toBe('get_weather');
    expect(parts[0].input).toEqual({ city: 'London' });
    expect(state.pendingToolCalls.size).toBe(0);
  });

  it('flushes tool calls on finish_reason=tool_calls', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    state.pendingToolCalls.set(0, {
      id: 'call_1',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"London"}' },
    });

    processStreamingDataLine(
      JSON.stringify({
        choices: [
          {
            delta: {},
            finish_reason: 'tool_calls',
          },
        ],
      }),
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].callId).toBe('call_1');
    expect(parts[0].name).toBe('get_weather');
  });

  it('skips malformed JSON gracefully', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    const isDone = processStreamingDataLine(
      '{invalid',
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    expect(isDone).toBe(false);
    expect(parts).toHaveLength(0);
  });

  it('handles [DONE] sentinel', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    const isDone = processStreamingDataLine(
      '[DONE]',
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    expect(isDone).toBe(true);
    expect(parts).toHaveLength(0);
  });

  it('ignores empty delta with no content', async () => {
    const { parts, progress } = mockProgress();
    const state = makeState();

    processStreamingDataLine(
      JSON.stringify({
        choices: [{ delta: {} }],
      }),
      progress as unknown as Progress<LanguageModelResponsePart>,
      state,
    );

    expect(parts).toHaveLength(0);
  });
});

describe('flushToolCalls', () => {
  it('flushes all pending tool calls and clears buffer', async () => {
    const vscodeModule = await import('vscode');
    const { parts, progress } = mockProgress();
    const state = makeState();

    state.pendingToolCalls.set(0, {
      id: 'call_1',
      type: 'function',
      function: { name: 'fn1', arguments: '{"a":1}' },
    });
    state.pendingToolCalls.set(1, {
      id: 'call_2',
      type: 'function',
      function: { name: 'fn2', arguments: '{"b":2}' },
    });

    flushToolCalls(state, progress as unknown as Progress<LanguageModelResponsePart>);

    expect(parts).toHaveLength(2);
    expect(parts[0]).toBeInstanceOf(vscodeModule.LanguageModelToolCallPart);
    expect(parts[0].callId).toBe('call_1');
    expect(parts[0].name).toBe('fn1');
    expect(parts[0].input).toEqual({ a: 1 });
    expect(parts[1].callId).toBe('call_2');
    expect(parts[1].name).toBe('fn2');
    expect(parts[1].input).toEqual({ b: 2 });
    expect(state.pendingToolCalls.size).toBe(0);
  });
});
