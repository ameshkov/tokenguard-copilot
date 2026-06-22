/**
 * Shared test helpers and mocks for chat-handler unit tests.
 *
 * All exports are for test use only.
 *
 * @internal Exported for test files only; not part of the public module API.
 */

import { vi } from 'vitest';
import type * as vscode from 'vscode';
import type { Model, Provider } from '../db/index.js';
import type { ReasoningCacheService } from '../services/reasoning-cache/index.js';
import type { ChatContext } from '../services/chat-handler/chat-handler.js';

// ---------------------------------------------------------------------------
// VS Code API mock
// ---------------------------------------------------------------------------

vi.mock('vscode', () => ({
  LanguageModelChatMessageRole: { User: 1, Assistant: 2, System: 3 },
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  LanguageModelThinkingPart: class {
    constructor(
      public value: string | string[],
      public id?: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      public metadata?: { readonly [key: string]: any },
    ) {}
  },
  LanguageModelToolCallPart: class {
    constructor(
      public callId: string,
      public name: string,
      public input: Record<string, unknown>,
    ) {}
  },
  LanguageModelToolResultPart: class {
    constructor(
      public callId: string,
      public content: unknown[],
    ) {}
  },
  LanguageModelDataPart: class {
    constructor(
      public data: Uint8Array,
      public mimeType: string,
    ) {}
  },
  CancellationTokenSource: class {
    token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    };
    cancel() {}
    dispose() {}
  },
}));

// ---------------------------------------------------------------------------
// ReasoningCacheService mocks
// ---------------------------------------------------------------------------

/**
 * No-op ReasoningCacheService mock for tests that don't exercise reasoning preservation.
 *
 * @internal Exported for test files only.
 */
export function noopReasoningCacheService(): ReasoningCacheService {
  return {
    backfillReasoning: vi.fn(),
    cacheReasoning: vi.fn(),
  } as unknown as ReasoningCacheService;
}

/**
 * Creates a ReasoningCacheService mock that exposes the underlying vi.fn() spies
 * so tests can assert on call counts and arguments.
 *
 * @internal Exported for test files only.
 */
export function spyReasoningCacheService(): {
  svc: ReasoningCacheService;
  backfillMock: ReturnType<typeof vi.fn>;
  cacheMock: ReturnType<typeof vi.fn>;
} {
  const backfillMock = vi.fn();
  const cacheMock = vi.fn();
  return {
    svc: {
      backfillReasoning: backfillMock,
      cacheReasoning: cacheMock,
    } as unknown as ReasoningCacheService,
    backfillMock,
    cacheMock,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Helper to create a mock VS Code chat request message.
 *
 * @internal Exported for test files only.
 */
export function mockMessage(
  role: number,
  content: Array<Record<string, unknown>>,
): vscode.LanguageModelChatRequestMessage {
  return { role, content, name: undefined } as unknown as vscode.LanguageModelChatRequestMessage;
}

/**
 * Helper to create a mock Model row.
 *
 * @internal Exported for test files only.
 */
export function mockModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'gpt-4',
    providerId: 'p1',
    displayName: null,
    maxContextWindowTokens: 128000,
    maxOutputTokens: 16384,
    streaming: 1,
    vision: 0,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: 0,
    inputCostPer1m: null,
    outputCostPer1m: null,
    cachedInputCostPer1m: null,
    cacheControl: null,
    customFields: null,
    enabled: 1,
    removed: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Helper to create a mock Provider row.
 *
 * @internal Exported for test files only.
 */
export function mockProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'p1',
    name: 'test-provider',
    baseUrl: 'https://api.example.com/v1',
    removed: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Helper to create a mock progress reporter.
 *
 * @internal Exported for test files only.
 */
export function mockProgress(): {
  parts: Record<string, unknown>[];
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
} {
  const parts: Record<string, unknown>[] = [];
  return {
    parts,
    progress: {
      report: (part: Record<string, unknown>) => parts.push(part),
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>,
  };
}

/**
 * Helper to create a mock cancellation token.
 *
 * @internal Exported for test files only.
 */
export function mockToken(
  overrides: {
    cancelled?: boolean;
    onCancellationRequested?: (...args: unknown[]) => unknown;
  } = {},
): vscode.CancellationToken {
  return {
    isCancellationRequested: overrides.cancelled ?? false,
    onCancellationRequested:
      overrides.onCancellationRequested ?? vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as vscode.CancellationToken;
}

// ---------------------------------------------------------------------------
// Chat context factory
// ---------------------------------------------------------------------------

/**
 * Helper to create a base ChatContext for chat-handler tests.
 *
 * Provides sensible defaults: a non-streaming test model, the default test
 * provider, and a dummy API key. Pass overrides to customise per test.
 *
 * @internal Exported for test files only; not part of the public module API.
 */
export function baseChatContext(overrides: Partial<ChatContext> = {}): ChatContext {
  return {
    model: mockModel({ streaming: 0 }),
    provider: mockProvider(),
    apiKey: 'sk-test',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SSE stream factory
// ---------------------------------------------------------------------------

/**
 * Creates a ReadableStream from an array of SSE-formatted lines.
 *
 * Each input string is wrapped in a `data:` Server-Sent-Events line and the
 * resulting chunks are encoded as UTF-8, mimicking an OpenAI-compatible
 * streaming response body.
 *
 * @param lines - Raw JSON strings to wrap in `data:` SSE lines.
 * @returns A ReadableStream emitting the SSE-formatted text.
 *
 * @internal Exported for test files only; not part of the public module API.
 */
export function createSSEStream(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  const data = lines.map((l) => `data: ${l}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });
}
