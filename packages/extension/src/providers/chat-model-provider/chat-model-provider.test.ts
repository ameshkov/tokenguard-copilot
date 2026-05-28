import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Model, Provider } from '../../db/index.js';
import type { ChatDebugLogger } from '../../services/chat-debug-logger/index.js';
import type { TokenCounter } from '../../services/token-counter/index.js';
import type { ReasoningCacheService } from '../../services/reasoning-cache/index.js';
import type { UsageTracker } from '../../services/usage-tracker/index.js';
import type { ChatModelProviderDeps, ModelMapEntry } from './chat-model-provider.js';
import { createMockLogger } from '../../test/mock-logger.js';

const mockRegister = vi.hoisted(() =>
  vi.fn<
    (
      vendor: string,
      provider: import('vscode').LanguageModelChatProvider,
    ) => { dispose: ReturnType<typeof vi.fn> }
  >(() => ({
    dispose: vi.fn(),
  })),
);

const mockHandle = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('vscode', () => ({
  EventEmitter: class {
    private handlers: (() => void)[] = [];
    event = (handler: () => void) => {
      this.handlers.push(handler);
      return { dispose: () => {} };
    };
    fire() {
      for (const h of this.handlers) h();
    }
    dispose() {}
  },
  lm: {
    registerLanguageModelChatProvider: mockRegister,
  },
  LanguageModelChatToolMode: {
    Auto: 1,
    Required: 2,
  },
  workspace: {
    workspaceFolders: [{ uri: { toString: () => 'file:///workspace' } }],
  },
}));

vi.mock('../../services/chat-handler/index.js', () => {
  return {
    ChatHandler: class {
      handle = mockHandle;
    },
  };
});

import { ChatModelProvider } from './chat-model-provider.js';

describe('ChatModelProvider', () => {
  let deps: ChatModelProviderDeps;
  let model: Model;
  let provider: Provider;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHandle.mockResolvedValue(undefined);

    model = {
      id: 'gpt-4o',
      providerId: 'provider-1',
      displayName: 'GPT-4o',
      maxContextWindowTokens: 128000,
      maxOutputTokens: 16384,
      streaming: 1,
      vision: 0,
      enabled: 1,
      removed: 0,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Model;

    provider = {
      id: 'provider-1',
      name: 'TestProvider',
      baseUrl: 'https://api.test.com/v1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Provider;

    const modelMap = new Map<string, ModelMapEntry>();
    modelMap.set('tokenguard-copilot.TestProvider.gpt-4o', {
      model,
      provider,
    });

    const chatInfos = [
      {
        id: 'tokenguard-copilot.TestProvider.gpt-4o',
        name: 'GPT-4o',
        family: 'gpt-4o',
        version: 'gpt-4o',
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        capabilities: {
          toolCalling: true,
          imageInput: false,
        },
      },
    ] as unknown as import('vscode').LanguageModelChatInformation[];

    const vscodeModule = await import('vscode');
    const chatInfoEmitter =
      new vscodeModule.EventEmitter() as unknown as import('vscode').EventEmitter<void>;

    deps = {
      modelMap,
      chatInfos,
      chatInfoEmitter,
      secrets: {
        get: vi.fn().mockResolvedValue('test-key'),
        store: vi.fn(),
        delete: vi.fn(),
        onDidChange: vi.fn(),
      } as unknown as import('vscode').SecretStorage,
      chatDebugLogger: {
        logRequest: vi.fn(),
      } as unknown as ChatDebugLogger,
      tokenCounter: {
        countTokens: vi.fn().mockResolvedValue(42),
        countMessageTokens: vi.fn().mockResolvedValue(10),
      } as unknown as TokenCounter,
      reasoningCacheService: {
        backfillReasoning: vi.fn(),
        cacheReasoning: vi.fn(),
      } as unknown as ReasoningCacheService,
      usageTracker: {
        recordUsage: vi.fn(),
        recordError: vi.fn(),
      } as unknown as UsageTracker,
      logger: createMockLogger(),
    };
  });

  it('calls registerLanguageModelChatProvider with correct vendor', () => {
    ChatModelProvider.register(deps);

    expect(mockRegister).toHaveBeenCalledOnce();
    expect(mockRegister).toHaveBeenCalledWith(
      'tokenguard-copilot',
      expect.objectContaining({
        provideLanguageModelChatInformation: expect.any(Function),
        provideLanguageModelChatResponse: expect.any(Function),
        provideTokenCount: expect.any(Function),
      }),
    );
  });

  it('returns a disposable', () => {
    const disposable = ChatModelProvider.register(deps);

    expect(disposable).toBeDefined();
    expect(disposable.dispose).toBeDefined();
  });

  it('provideLanguageModelChatInformation returns the chat infos list', () => {
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const infos = registeredProvider.provideLanguageModelChatInformation(
      {} as import('vscode').PrepareLanguageModelChatModelOptions,
      null as unknown as import('vscode').CancellationToken,
    );
    expect(infos).toEqual(deps.chatInfos);
  });

  it('provideLanguageModelChatResponse dispatches to ChatHandler', async () => {
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const modelInfo = {
      id: 'tokenguard-copilot.TestProvider.gpt-4o',
    } as import('vscode').LanguageModelChatInformation;
    const messages: import('vscode').LanguageModelChatRequestMessage[] = [];
    const options = {
      tools: [],
      toolMode: 1,
    } as unknown as import('vscode').ProvideLanguageModelChatResponseOptions;
    const progress = {
      report: vi.fn(),
    } as unknown as import('vscode').Progress<unknown>;
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    } as unknown as import('vscode').CancellationToken;

    await registeredProvider.provideLanguageModelChatResponse(
      modelInfo,
      messages,
      options,
      progress,
      token,
    );

    expect(mockHandle).toHaveBeenCalledOnce();
  });

  it('provideLanguageModelChatResponse throws for unknown model', async () => {
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const modelInfo = {
      id: 'tokenguard-copilot.Unknown.model',
    } as import('vscode').LanguageModelChatInformation;

    await expect(
      registeredProvider.provideLanguageModelChatResponse(
        modelInfo,
        [],
        {
          tools: [],
          toolMode: 1,
        } as unknown as import('vscode').ProvideLanguageModelChatResponseOptions,
        { report: vi.fn() } as unknown as import('vscode').Progress<unknown>,
        {
          isCancellationRequested: false,
          onCancellationRequested: vi.fn(),
        } as unknown as import('vscode').CancellationToken,
      ),
    ).rejects.toThrow('Unknown model');
  });

  it('records error on handler failure', async () => {
    mockHandle.mockRejectedValue(new Error('API error'));
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const modelInfo = {
      id: 'tokenguard-copilot.TestProvider.gpt-4o',
    } as import('vscode').LanguageModelChatInformation;

    await expect(
      registeredProvider.provideLanguageModelChatResponse(
        modelInfo,
        [],
        {
          tools: [],
          toolMode: 1,
        } as unknown as import('vscode').ProvideLanguageModelChatResponseOptions,
        { report: vi.fn() } as unknown as import('vscode').Progress<unknown>,
        {
          isCancellationRequested: false,
          onCancellationRequested: vi.fn(),
        } as unknown as import('vscode').CancellationToken,
      ),
    ).rejects.toThrow('API error');

    expect(deps.usageTracker.recordError).toHaveBeenCalledWith('provider-1', 'gpt-4o');
  });

  it('records successful usage after handler completes', async () => {
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const modelInfo = {
      id: 'tokenguard-copilot.TestProvider.gpt-4o',
    } as import('vscode').LanguageModelChatInformation;

    await registeredProvider.provideLanguageModelChatResponse(
      modelInfo,
      [],
      {
        tools: [],
        toolMode: 1,
      } as unknown as import('vscode').ProvideLanguageModelChatResponseOptions,
      { report: vi.fn() } as unknown as import('vscode').Progress<unknown>,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as import('vscode').CancellationToken,
    );

    expect(deps.usageTracker.recordUsage).toHaveBeenCalledWith(
      'provider-1',
      'gpt-4o',
      expect.objectContaining({ success: true }),
    );
  });

  it('provideTokenCount calls countTokens for string input', async () => {
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const result = await registeredProvider.provideTokenCount!(
      {
        id: 'test',
      } as import('vscode').LanguageModelChatInformation,
      'Hello world',
      null as unknown as import('vscode').CancellationToken,
    );
    expect(result).toBe(42);
    expect(deps.tokenCounter.countTokens).toHaveBeenCalledWith('Hello world');
  });

  it('provideTokenCount calls countMessageTokens for message input', async () => {
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const msg = { role: 1, content: [], name: undefined };
    const result = await registeredProvider.provideTokenCount!(
      {
        id: 'test',
      } as import('vscode').LanguageModelChatInformation,
      msg as unknown as import('vscode').LanguageModelChatRequestMessage,
      null as unknown as import('vscode').CancellationToken,
    );
    expect(result).toBe(10);
    expect(deps.tokenCounter.countMessageTokens).toHaveBeenCalledWith(msg);
  });

  it('handles empty model map without errors', () => {
    deps.modelMap = new Map();
    deps.chatInfos = [];

    const disposable = ChatModelProvider.register(deps);

    expect(disposable).toBeDefined();

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const infos = registeredProvider.provideLanguageModelChatInformation(
      {} as import('vscode').PrepareLanguageModelChatModelOptions,
      null as unknown as import('vscode').CancellationToken,
    );
    expect(infos).toHaveLength(0);
  });

  it('handles null API key gracefully', async () => {
    vi.mocked(deps.secrets.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    ChatModelProvider.register(deps);

    const registeredProvider = mockRegister.mock.calls[0]![1]!;
    const modelInfo = {
      id: 'tokenguard-copilot.TestProvider.gpt-4o',
    } as import('vscode').LanguageModelChatInformation;

    // Should not throw — empty string is used as fallback
    await registeredProvider.provideLanguageModelChatResponse(
      modelInfo,
      [],
      {
        tools: [],
        toolMode: 1,
      } as unknown as import('vscode').ProvideLanguageModelChatResponseOptions,
      { report: vi.fn() } as unknown as import('vscode').Progress<unknown>,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as unknown as import('vscode').CancellationToken,
    );

    expect(mockHandle).toHaveBeenCalledOnce();
  });
});
