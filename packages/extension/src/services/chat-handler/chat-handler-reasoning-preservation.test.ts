import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockMessage,
  mockModel,
  mockProgress,
  mockToken,
  noopReasoningCacheService,
  spyReasoningCacheService,
  baseChatContext,
} from '../../test/chat-handler-test-helpers.js';
import { ChatHandler, type ChatContext, type OpenAIMessage } from './chat-handler.js';
import { createMockLogger } from '../../test/mock-logger.js';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { ReasoningCacheRepository } from '../../repositories/index.js';
import { ReasoningCacheService } from '../reasoning-cache/index.js';

describe('ChatHandler — reasoning preservation', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  const baseContext = baseChatContext({
    model: mockModel({ streaming: 0, preserveReasoning: 1 }),
  });

  it('streaming: calls backfillReasoning before fetch and cacheReasoning after success', async () => {
    const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
    const ctx: ChatContext = {
      ...baseContext,
      model: mockModel({ streaming: 1, preserveReasoning: 1 }),
    };
    const handler = new ChatHandler(ctx, svc);

    fetchMock.mockResolvedValue(
      new Response(
        new Blob([
          'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        ]).stream(),
        { status: 200 },
      ),
    );

    const messages = [mockMessage(1, [{ value: 'Hello' }])];
    const { progress } = mockProgress();
    await handler.handle(messages, progress, mockToken());

    // backfillReasoning is called before fetch
    expect(backfillMock).toHaveBeenCalledOnce();
    // cacheReasoning is called after successful response
    expect(cacheMock).toHaveBeenCalledOnce();

    // Verify preserveReasoning flag is passed correctly
    expect(backfillMock.mock.calls[0][1]).toBe(true);
    expect(cacheMock.mock.calls[0][3]).toBe(true);
  });

  it('non-streaming: calls backfillReasoning before fetch and cacheReasoning after success', async () => {
    const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
    const ctx: ChatContext = {
      ...baseContext,
      model: mockModel({ streaming: 0, preserveReasoning: 1 }),
    };
    const handler = new ChatHandler(ctx, svc);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const messages = [mockMessage(1, [{ value: 'Hello' }])];
    const { progress } = mockProgress();
    await handler.handle(messages, progress, mockToken());

    expect(backfillMock).toHaveBeenCalledOnce();
    expect(cacheMock).toHaveBeenCalledOnce();

    expect(backfillMock.mock.calls[0][1]).toBe(true);
    expect(cacheMock.mock.calls[0][3]).toBe(true);
  });

  it('HTTP error: backfillReasoning called but cacheReasoning NOT called', async () => {
    const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
    const ctx: ChatContext = {
      ...baseContext,
      model: mockModel({ streaming: 0, preserveReasoning: 1 }),
    };
    const handler = new ChatHandler(ctx, svc);

    fetchMock.mockResolvedValue(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    const messages = [mockMessage(1, [{ value: 'Hello' }])];
    const { progress } = mockProgress();
    await expect(handler.handle(messages, progress, mockToken())).rejects.toThrow(
      '401 Unauthorized',
    );

    // backfillReasoning is always called before the request
    expect(backfillMock).toHaveBeenCalledOnce();
    expect(backfillMock.mock.calls[0][1]).toBe(true);

    // cacheReasoning must NOT be called on error
    expect(cacheMock).not.toHaveBeenCalled();
  });

  it('preserveReasoning disabled: methods called with preserveReasoning=false', async () => {
    const { svc, backfillMock, cacheMock } = spyReasoningCacheService();
    const ctx: ChatContext = {
      ...baseContext,
      model: mockModel({ streaming: 0, preserveReasoning: 0 }),
    };
    const handler = new ChatHandler(ctx, svc);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const messages = [mockMessage(1, [{ value: 'Hello' }])];
    const { progress } = mockProgress();
    await handler.handle(messages, progress, mockToken());

    // Both methods are called but with preserveReasoning=false
    // (the service itself is a no-op when preserveReasoning is false)
    expect(backfillMock).toHaveBeenCalledOnce();
    expect(backfillMock.mock.calls[0][1]).toBe(false);
    expect(cacheMock).toHaveBeenCalledOnce();
    expect(cacheMock.mock.calls[0][3]).toBe(false);
  });

  it('streaming with reasoning: cacheReasoning receives accumulated reasoning_content in fields', async () => {
    const { svc, cacheMock } = spyReasoningCacheService();
    const ctx: ChatContext = {
      ...baseContext,
      model: mockModel({ streaming: 1, preserveReasoning: 1 }),
    };
    const handler = new ChatHandler(ctx, svc);

    const sseData =
      'data: {"choices":[{"delta":{"reasoning_content":"Let me","content":""},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"reasoning_content":" think"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"42"},"finish_reason":"stop"}]}\n\n' +
      'data: [DONE]\n\n';

    fetchMock.mockResolvedValue(new Response(new Blob([sseData]).stream(), { status: 200 }));

    const messages = [mockMessage(1, [{ value: 'What is the answer?' }])];
    const { progress } = mockProgress();
    await handler.handle(messages, progress, mockToken());

    expect(cacheMock).toHaveBeenCalledOnce();
    const fields = cacheMock.mock.calls[0][1];
    expect(fields).not.toBeNull();
    expect(fields.reasoning_content).toBe('Let me think');
  });

  it('non-streaming with reasoning: cacheReasoning receives extracted reasoning fields', async () => {
    const { svc, cacheMock } = spyReasoningCacheService();
    const ctx: ChatContext = {
      ...baseContext,
      model: mockModel({ streaming: 0, preserveReasoning: 1 }),
    };
    const handler = new ChatHandler(ctx, svc);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Paris',
              reasoning_content: 'The capital of France is Paris.',
            },
          },
        ],
      }),
    });

    const messages = [mockMessage(1, [{ value: 'Capital of France?' }])];
    const { progress } = mockProgress();
    await handler.handle(messages, progress, mockToken());

    expect(cacheMock).toHaveBeenCalledOnce();
    const fields = cacheMock.mock.calls[0][1];
    expect(fields).not.toBeNull();
    expect(fields.reasoning_content).toBe('The capital of France is Paris.');
  });

  it('turn 1 reports thinking part with correct presentFields, turn 2 only sends reasoning_content', async () => {
    // Turn 1: user sends a message, LLM responds with
    // reasoning_content. The handler reports a thinking part
    // with presentFields metadata.
    // Turn 2: the reported parts from turn 1 are passed back
    // as message history. Only reasoning_content must appear
    // in the outgoing request body.

    const vscodeModule = await import('vscode');

    // --- Turn 1 ---
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Paris',
              reasoning_content: 'The capital of France is Paris.',
            },
          },
        ],
      }),
    });

    const userMsg1 = mockMessage(1, [{ value: 'Capital of France?' }]);
    const { parts: turn1Parts, progress: turn1Progress } = mockProgress();
    const handler1 = new ChatHandler(
      { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
      noopReasoningCacheService(),
    );
    await handler1.handle([userMsg1], turn1Progress, mockToken());

    // Verify the thinking part was reported with metadata that
    // only lists reasoning_content (the only field the server sent).
    expect(turn1Parts.length).toBeGreaterThanOrEqual(2);
    const thinkingPart = turn1Parts[0] as {
      value: string;
      metadata?: { presentFields?: string[] };
    };
    expect(thinkingPart.value).toBe('The capital of France is Paris.');
    expect(thinkingPart.metadata).toEqual({
      presentFields: ['reasoning_content'],
    });
    const textPart1 = turn1Parts[1] as { value: string };
    expect(textPart1.value).toBe('Paris');

    // --- Turn 2 ---
    // Use the exact parts reported by turn 1 as the assistant
    // message history (filtering out any data parts).
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Sure, let me elaborate.' } }],
      }),
    });

    const assistantParts = turn1Parts.filter(
      (p) =>
        p instanceof vscodeModule.LanguageModelThinkingPart ||
        p instanceof vscodeModule.LanguageModelTextPart,
    );
    const assistantMsg = mockMessage(2, assistantParts as unknown as Record<string, unknown>[]);
    const userMsg2 = mockMessage(1, [{ value: 'Tell me more.' }]);

    const { progress: turn2Progress } = mockProgress();
    const handler2 = new ChatHandler(
      { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
      noopReasoningCacheService(),
    );
    await handler2.handle([assistantMsg, userMsg2], turn2Progress, mockToken());

    // Inspect the turn 2 request body — only reasoning_content
    // must be present in the assistant message.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, options] = fetchMock.mock.calls[1];
    const body = JSON.parse(options.body) as { messages: OpenAIMessage[] };
    const assistantBody = body.messages[0];
    expect(assistantBody.role).toBe('assistant');
    expect(assistantBody.reasoning_content).toBe('The capital of France is Paris.');
    expect(assistantBody.reasoning).toBeUndefined();
    expect(assistantBody.reasoning_details).toBeUndefined();
  });

  it('real cache backfills only reasoning_content when thinking parts are absent', async () => {
    // Multi-turn scenario with a real ReasoningCacheService:
    // Turn 1: assistant responds with reasoning_content. The
    // handler caches it via the real repository.
    // Turn 2: VS Code did NOT preserve thinking parts in the
    // message history. The real cache service backfills only
    // the fields that were cached (reasoning_content).

    const { db, raw } = createTestDb();
    try {
      clearTestDb(raw);
      const repo = new ReasoningCacheRepository(db);
      const realSvc = new ReasoningCacheService(repo, createMockLogger());

      // --- Turn 1: response with reasoning_content ---
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Paris',
                reasoning_content: 'The capital of France is Paris.',
              },
            },
          ],
        }),
      });

      const userMsg1 = mockMessage(1, [{ value: 'Capital of France?' }]);
      const { progress: turn1Progress } = mockProgress();
      const handler1 = new ChatHandler(
        { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
        realSvc,
      );
      await handler1.handle([userMsg1], turn1Progress, mockToken());

      // --- Turn 2: no thinking parts in history ---
      // Simulate VS Code losing thinking parts — only the text
      // part is preserved in the assistant message.
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{ message: { content: 'Sure, let me elaborate.' } }],
        }),
      });

      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Paris');
      const assistantMsg = mockMessage(2, [textPart as unknown as Record<string, unknown>]);
      const userMsg2 = mockMessage(1, [{ value: 'Tell me more.' }]);

      const { progress: turn2Progress } = mockProgress();
      const handler2 = new ChatHandler(
        { ...baseContext, model: mockModel({ streaming: 0, preserveReasoning: 1 }) },
        realSvc,
      );
      await handler2.handle([assistantMsg, userMsg2], turn2Progress, mockToken());

      // Inspect the turn 2 request body — the cache backfill
      // should have set only reasoning_content.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, options] = fetchMock.mock.calls[1];
      const body = JSON.parse(options.body) as { messages: OpenAIMessage[] };
      const assistantBody = body.messages[0];
      expect(assistantBody.role).toBe('assistant');
      expect(assistantBody.reasoning_content).toBe('The capital of France is Paris.');
      expect(assistantBody.reasoning).toBeUndefined();
      expect(assistantBody.reasoning_details).toBeUndefined();
    } finally {
      raw.close();
    }
  });
});
