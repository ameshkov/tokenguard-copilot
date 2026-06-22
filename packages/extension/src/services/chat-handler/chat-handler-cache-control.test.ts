import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockMessage,
  mockProgress,
  mockToken,
  noopReasoningCacheService,
  baseChatContext,
} from '../../test/chat-handler-test-helpers.js';
import { ChatHandler, type ChatContext } from './chat-handler.js';

describe('ChatHandler — cache control integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  const baseContext = baseChatContext();

  it('injects cache_control markers when cacheControl.enabled is true', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const vscodeModule = await import('vscode');
    const p1 = new vscodeModule.LanguageModelTextPart('System prompt');
    const p2 = new vscodeModule.LanguageModelTextPart('User message');
    const messages = [
      mockMessage(1, [p1 as unknown as Record<string, unknown>]),
      mockMessage(1, [p2 as unknown as Record<string, unknown>]),
    ];

    const ctx: ChatContext = {
      ...baseContext,
      cacheControl: {
        enabled: true,
        maxMarkers: 4,
      },
    };

    const { progress } = mockProgress();
    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, progress, mockToken());

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body) as { messages: unknown[] };
    // At least one message should have cache_control markers
    const hasMarker = JSON.stringify(body.messages).includes('cache_control');
    expect(hasMarker).toBe(true);
  });

  it('does not inject markers when cacheControl is undefined', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const vscodeModule = await import('vscode');
    const p1 = new vscodeModule.LanguageModelTextPart('Hello');
    const messages = [mockMessage(1, [p1 as unknown as Record<string, unknown>])];

    const ctx: ChatContext = {
      ...baseContext,
    };

    const { progress } = mockProgress();
    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, progress, mockToken());

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body) as { messages: unknown[] };
    const hasMarker = JSON.stringify(body.messages).includes('cache_control');
    expect(hasMarker).toBe(false);
  });

  it('does not inject markers when cacheControl.enabled is false', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const vscodeModule = await import('vscode');
    const p1 = new vscodeModule.LanguageModelTextPart('Hello');
    const messages = [mockMessage(1, [p1 as unknown as Record<string, unknown>])];

    const ctx: ChatContext = {
      ...baseContext,
      cacheControl: {
        enabled: false,
        maxMarkers: 4,
      },
    };

    const { progress } = mockProgress();
    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, progress, mockToken());

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body) as { messages: unknown[] };
    const hasMarker = JSON.stringify(body.messages).includes('cache_control');
    expect(hasMarker).toBe(false);
  });

  it('includes TTL in markers when configured', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: 'Response' } }],
      }),
    });

    const vscodeModule = await import('vscode');
    const p1 = new vscodeModule.LanguageModelTextPart('System prompt');
    const p2 = new vscodeModule.LanguageModelTextPart('User message');
    const messages = [
      mockMessage(1, [p1 as unknown as Record<string, unknown>]),
      mockMessage(1, [p2 as unknown as Record<string, unknown>]),
    ];

    const ctx: ChatContext = {
      ...baseContext,
      cacheControl: {
        enabled: true,
        maxMarkers: 4,
        ttl: '5m',
      },
    };

    const { progress } = mockProgress();
    const handler = new ChatHandler(ctx, noopReasoningCacheService());
    await handler.handle(messages, progress, mockToken());

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body) as { messages: unknown[] };
    const bodyStr = JSON.stringify(body.messages);
    expect(bodyStr).toContain('"cache_control"');
    expect(bodyStr).toContain('"ttl":300');
  });
});
